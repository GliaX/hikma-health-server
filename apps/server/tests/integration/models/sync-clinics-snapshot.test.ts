/**
 * Clinics are replicated whole on every pull rather than as a delta.
 *
 * These pin the property that makes a missed clinic self-correcting: it is
 * delivered regardless of how recent the client's watermark is.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";

import { testDb } from "../setup";
import Sync from "@/models/sync";
import type { RequestCaller } from "@/types";

const createdClinicIds: string[] = [];
const createdPermissionIds: string[] = [];

const insertClinic = async (overrides: Record<string, unknown> = {}) => {
  const id = uuidV1();
  createdClinicIds.push(id);
  await testDb
    .insertInto("clinics")
    .values({
      id,
      name: "Snapshot Test Clinic",
      is_deleted: false,
      is_archived: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
      ...overrides,
    })
    .execute();
  // User callers are clinic-scoped by can_view_history, so grant the caller's
  // user access to each clinic this test creates.
  const permissionId = uuidV1();
  createdPermissionIds.push(permissionId);
  await testDb
    .insertInto("user_clinic_permissions")
    .values({
      id: permissionId,
      user_id: callerUserId,
      clinic_id: id,
      can_register_patients: true,
      can_view_history: true,
      can_edit_records: true,
      can_delete_records: false,
      is_clinic_admin: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
    } as any)
    .execute();
  return id;
};

/** The caller's user must exist as a row for permission lookups to resolve. */
const callerUserId = uuidV1();

let caller: RequestCaller;

beforeAll(async () => {
  await testDb
    .insertInto("users")
    .values({
      id: callerUserId,
      name: "Snapshot User",
      role: "provider",
      email: `snapshot-${callerUserId}@example.com`,
      hashed_password: "not-a-real-hash",
      instance_url: null,
      clinic_id: null,
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`now()`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      deleted_at: null,
    } as any)
    .execute();
  caller = {
    user: { id: callerUserId, name: "Snapshot User", role: "provider" } as any,
    clinic: { id: uuidV1(), name: "Snapshot Test Clinic" } as any,
    token: "test-token",
  } as RequestCaller;
});

afterAll(async () => {
  await testDb
    .deleteFrom("users")
    .where("id", "=", callerUserId)
    .execute();
});

/** A watermark far in the future — no delta bucket could match anything. */
const FUTURE = Date.now() + 60 * 60 * 1000;

afterEach(async () => {
  // The caller's user owns only the rows this suite created.
  await testDb
    .deleteFrom("user_clinic_permissions")
    .where("user_id", "=", callerUserId)
    .execute();
  createdPermissionIds.length = 0;
  for (const id of createdClinicIds) {
    await testDb.deleteFrom("clinics").where("id", "=", id).execute();
  }
  createdClinicIds.length = 0;
});

describe("Sync.getDeltaRecords clinics snapshot (integration)", () => {
  it("delivers a clinic even when the client watermark is newer than every change", async () => {
    const id = await insertClinic();

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    // The whole point: an ordinary delta would return nothing here.
    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
  });

  it("puts live clinics in updated, never created", async () => {
    await insertClinic();

    const delta = await Sync.getDeltaRecords(0, "mobile", caller);

    // WatermelonDB creates unknown ids from `updated`, but logs an error for
    // every id in `created` that already exists locally.
    expect(delta.clinics.created).toEqual([]);
    expect(delta.clinics.updated.length).toBeGreaterThan(0);
  });

  it("reports a soft-deleted clinic as deleted and omits it from updated", async () => {
    const id = await insertClinic({
      is_deleted: true,
      deleted_at: sql`now()`,
    });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.deleted).toContain(id);
    expect(delta.clinics.updated.map((r: any) => r.id)).not.toContain(id);
  });

  it("reports a clinic flagged deleted with no deleted_at", async () => {
    // The delete path has historically set one column without the other.
    const id = await insertClinic({ is_deleted: true, deleted_at: null });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.deleted).toContain(id);
    expect(delta.clinics.updated.map((r: any) => r.id)).not.toContain(id);
  });

  it("treats a null is_deleted as live rather than dropping it from both lists", async () => {
    // `is_deleted` is nullable, and `is_deleted = false` does not match NULL.
    const id = await insertClinic({ is_deleted: null });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
    expect(delta.clinics.deleted).not.toContain(id);
  });

  it("still delivers a clinic whose sync timestamps were never populated", async () => {
    const id = await insertClinic({
      server_created_at: null,
      last_modified: null,
    });

    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    expect(delta.clinics.updated.map((r: any) => r.id)).toContain(id);
  });

  it("leaves the delta behaviour of other tables alone", async () => {
    const delta = await Sync.getDeltaRecords(FUTURE, "mobile", caller);

    // Patients stay watermark-driven; a future `since` matches nothing.
    expect(delta.patients.created).toEqual([]);
    expect(delta.patients.updated).toEqual([]);
  });
});
