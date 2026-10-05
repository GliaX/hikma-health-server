import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import Token from "@/models/token";
import User from "@/models/user";
import UserClinicPermissions from "@/models/user-clinic-permissions";
import { Option, pipe } from "effect";
import type Clinic from "@/models/clinic";
import db from "@/db";
import { getClientIp } from "@/lib/rate-limiter";

/**
 * Context available to all tRPC procedures.
 * Created per-request in the fetch handler.
 */
export type TRPCContext = {
  /** Raw Authorization header value, if present */
  authHeader: string | null;
  /** Rate-limit key for the caller (proxy-trust aware) */
  ip: string;
};

/**
 * Authenticated context added by the authed middleware.
 */
export type AuthedContext = {
  userId: string;
  role: typeof User.RoleSchema.Type;
  permissions: Record<Clinic.EncodedT["id"], UserClinicPermissions.EncodedT>;
};

/** Build context from the incoming request */
export function createTRPCContext(request: Request): TRPCContext {
  const authHeader = request.headers.get("Authorization");
  return { authHeader, ip: getClientIp(request) };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Middleware that validates a Bearer token and attaches user info to context.
 * Rejects with UNAUTHORIZED if the token is missing or invalid.
 */
const authedMiddleware = t.middleware(async ({ ctx, next }) => {
  const { authHeader } = ctx;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Empty bearer token",
    });
  }

  const caller = await Token.getUser(token);
  const user = Option.getOrNull(caller);

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    });
  }

  const userId: string = user.id;
  const role = user.role;

  const permissionsArray = await UserClinicPermissions.API.getByUser(userId);
  const permissions = permissionsArray.reduce(
    (acc, permission) => {
      acc[permission.clinic_id] = permission;
      return acc;
    },
    {} as Record<Clinic.EncodedT["id"], UserClinicPermissions.EncodedT>,
  );

  return next({
    ctx: { userId, role, permissions } satisfies AuthedContext,
  });
});

/** Procedure that requires a valid Bearer token */
export const authedProcedure = t.procedure.use(authedMiddleware);

/**
 * Assert that the authenticated user holds a specific clinic-level permission.
 *
 * When clinicId is provided, checks that exact clinic.
 * When clinicId is null/undefined, checks that the user holds the permission
 * on at least one clinic.
 *
 * Throws TRPCError FORBIDDEN on failure.
 */
export function requireClinicPermission(
  ctx: AuthedContext,
  permission: UserClinicPermissions.UserPermissionsT,
  clinicId: string | null | undefined,
): void {
  if (ctx.role === "super_admin") return;

  if (clinicId) {
    const clinicPerms = ctx.permissions[clinicId];
    if (!clinicPerms || !clinicPerms[permission]) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not have ${permission} permission for this clinic`,
      });
    }
  } else {
    const hasPermission = Object.values(ctx.permissions).some(
      (p) => p[permission],
    );
    if (!hasPermission) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not have ${permission} permission for any clinic`,
      });
    }
  }
}

/**
 * Clinic IDs where the caller holds the given clinic-level permission.
 * Returns null when the caller is unrestricted (super_admin).
 */
export function permittedClinicIds(
  ctx: AuthedContext,
  permission: UserClinicPermissions.UserPermissionsT,
): string[] | null {
  if (ctx.role === "super_admin") return null;
  return Object.entries(ctx.permissions)
    .filter(([, p]) => p[permission])
    .map(([clinicId]) => clinicId);
}

/**
 * Clinic IDs the caller may read patient data for (can_view_history).
 * Null means unrestricted (super_admin).
 */
export function patientClinicScopeIds(ctx: AuthedContext): string[] | null {
  return permittedClinicIds(ctx, "can_view_history");
}

/**
 * Whether the caller may read the record identified by (table, recordId),
 * based on its owning clinic and the caller's can_view_history scope.
 * Records with no clinic association (NULL clinic) are treated as visible,
 * matching the clients' inclusion of unassigned patients.
 */
export async function isRecordClinicVisible(
  ctx: AuthedContext,
  table: "patients" | "visits" | "events" | "appointments" | "prescriptions" | "patient_vitals",
  recordId: string,
): Promise<boolean> {
  const scope = patientClinicScopeIds(ctx);
  if (scope === null) return true;
  const clinicId = await resolveClinicIdForRecord(table, recordId);
  // undefined -> record does not exist; let callers decide (NOT_FOUND paths)
  if (clinicId === undefined) return true;
  return clinicId === null ? true : scope.includes(clinicId);
}

/**
 * Resolve the clinic that owns a record, following references where the
 * table itself has no clinic column:
 * - events / prescriptions / patient_vitals -> owning visit's clinic
 * - patients -> primary_clinic_id
 * - visits / appointments -> clinic_id
 *
 * Returns null when the record has no clinic association and undefined when
 * the record does not exist.
 */
export async function resolveClinicIdForRecord(
  table: "patients" | "visits" | "events" | "appointments" | "prescriptions" | "patient_vitals",
  recordId: string,
): Promise<string | null | undefined> {
  switch (table) {
    case "patients": {
      const row = await db
        .selectFrom("patients")
        .select("primary_clinic_id")
        .where("id", "=", recordId)
        .executeTakeFirst();
      return row ? (row.primary_clinic_id ?? null) : undefined;
    }
    case "visits":
    case "appointments": {
      const row = await db
        .selectFrom(table)
        .select("clinic_id")
        .where("id", "=", recordId)
        .executeTakeFirst();
      return row ? (row.clinic_id ?? null) : undefined;
    }
    case "events":
    case "prescriptions":
    case "patient_vitals": {
      const row = await db
        .selectFrom(table)
        .select("visit_id")
        .where("id", "=", recordId)
        .executeTakeFirst();
      if (!row) return undefined;
      if (!row.visit_id) return null;
      const visit = await db
        .selectFrom("visits")
        .select("clinic_id")
        .where("id", "=", row.visit_id)
        .executeTakeFirst();
      return visit ? (visit.clinic_id ?? null) : undefined;
    }
  }
}
