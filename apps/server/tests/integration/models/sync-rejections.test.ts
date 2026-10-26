import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { v1 as uuidV1 } from "uuid";
import { testDb } from "../setup";

vi.mock("@/db", () => ({ default: testDb }));

import Sync, { classifyUpsertResult } from "@/models/sync";
import type { RequestCaller } from "@/types";

const patientIds: string[] = [];

/**
 * The same shape every model's push-path upsert uses: conflict on the primary
 * key, DO UPDATE guarded by `excluded.updated_at > <table>.updated_at`.
 */
const guardedUpsert = async (id: string, updatedAt: string) =>
  await testDb
    .insertInto("patients")
    .values({
      id,
      given_name: "Rejection",
      surname: "TestPatient",
      date_of_birth: sql`'1990-01-01'::date`,
      sex: "female",
      is_deleted: false,
      created_at: sql`now()`,
      updated_at: sql`${updatedAt}::timestamptz`,
      last_modified: sql`now()`,
      server_created_at: sql`now()`,
      metadata: sql`'{}'::jsonb`,
    } as any)
    .onConflict((oc) =>
      oc
        .column("id")
        .doUpdateSet({
          given_name: (eb) => eb.ref("excluded.given_name"),
          updated_at: sql`now()::timestamp with time zone`,
        } as any)
        .where(sql<boolean>`excluded.updated_at > patients.updated_at`),
    )
    .executeTakeFirst();

let seededId: string;

beforeAll(async () => {
  seededId = uuidV1();
  patientIds.push(seededId);
  await guardedUpsert(seededId, "2026-06-01T00:00:00Z");
});

afterAll(async () => {
  for (const id of patientIds)
    await testDb.deleteFrom("patients").where("id", "=", id).execute();
});

describe("what the staleness guard returns", () => {
  // This is the contract classifyUpsertResult is built on. event.ts claims
  // inline that the result is `undefined` on rejection; it is not, and building
  // rejection reporting on that claim would mark every stale record accepted.
  it("returns a zero row count — not undefined — when it rejects a stale record", async () => {
    const result = await guardedUpsert(seededId, "2026-01-01T00:00:00Z");
    expect(result).toBeDefined();
    expect((result as any).numInsertedOrUpdatedRows).toBe(0n);
  });

  it("returns a row count of one when it accepts a newer record", async () => {
    const result = await guardedUpsert(seededId, "2026-12-01T00:00:00Z");
    expect((result as any).numInsertedOrUpdatedRows).toBe(1n);
  });

  it("classifies a real rejection as not accepted", async () => {
    const result = await guardedUpsert(seededId, "2020-01-01T00:00:00Z");
    expect(classifyUpsertResult(result)).toBe(false);
  });

  it("classifies a real acceptance as accepted", async () => {
    const result = await guardedUpsert(seededId, "2027-01-01T00:00:00Z");
    expect(classifyUpsertResult(result)).toBe(true);
  });

  it("classifies a fresh insert as accepted", async () => {
    const id = uuidV1();
    patientIds.push(id);
    const result = await guardedUpsert(id, "2026-06-01T00:00:00Z");
    expect(classifyUpsertResult(result)).toBe(true);
  });
});

const clinicIds: string[] = [];
const userIds: string[] = [];
const visitIds: string[] = [];
const appointmentIds: string[] = [];

const pushPatient = (id: string, updatedAt: string) => ({
  patients: {
    created: [
      {
        id,
        given_name: "Pushed",
        surname: "TestPatient",
        date_of_birth: "1990-01-01",
        sex: "female",
        is_deleted: false,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: updatedAt,
        metadata: {},
      },
    ],
    updated: [],
    deleted: [],
  },
});

describe("persistClientChanges reports what the guard rejected", () => {
  let caller: RequestCaller;

  beforeAll(async () => {
    const clinicId = uuidV1();
    clinicIds.push(clinicId);
    await testDb
      .insertInto("clinics")
      .values({
        id: clinicId,
        name: "Rejection Test Clinic",
        is_deleted: false,
        is_archived: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
        server_created_at: sql`now()`,
        deleted_at: null,
      } as any)
      .execute();

    const userId = uuidV1();
    userIds.push(userId);
    await testDb
      .insertInto("users")
      .values({
        id: userId,
        name: "Rejection Test User",
        role: "provider",
        email: `rejection-${userId}@example.com`,
        hashed_password: "not-a-real-hash",
        instance_url: null,
        clinic_id: clinicId,
        is_deleted: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
        server_created_at: sql`now()`,
        deleted_at: null,
      } as any)
      .execute();

    // User push authorization is scoped by can_register_patients / can_edit_records,
    // so grant the caller provider-level permissions on the clinic (mirrors
    // the rows User.API.create writes in production).
    await testDb
      .insertInto("user_clinic_permissions")
      .values({
        user_id: userId,
        clinic_id: clinicId,
        can_register_patients: true,
        can_view_history: true,
        can_edit_records: true,
        can_delete_records: false,
        is_clinic_admin: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
      } as any)
      .execute();

    caller = {
      user: { id: userId, name: "u", role: "provider", email: "u@t.com", clinic_id: clinicId },
      clinic: { id: clinicId, name: "Rejection Test Clinic" },
      token: "test-token",
    } as any;
  });

  // Children before parents: appointments reference visits, visits reference
  // patients and clinics. The patients themselves are dropped by the outer
  // afterAll, which runs after this one.
  afterAll(async () => {
    for (const id of appointmentIds)
      await testDb.deleteFrom("appointments").where("id", "=", id).execute();
    for (const id of visitIds)
      await testDb.deleteFrom("visits").where("id", "=", id).execute();
    for (const id of userIds)
      await testDb
        .deleteFrom("user_clinic_permissions")
        .where("user_id", "=", id)
        .execute();
    for (const id of userIds)
      await testDb.deleteFrom("users").where("id", "=", id).execute();
    for (const id of clinicIds)
      await testDb.deleteFrom("clinics").where("id", "=", id).execute();
  });

  it("counts a first-time push as accepted", async () => {
    const id = uuidV1();
    patientIds.push(id);
    const outcome = await Sync.persistClientChanges(
      pushPatient(id, "2026-06-01T00:00:00Z") as any,
      "android",
      caller,
    );
    expect(outcome.accepted).toBe(1);
    expect(outcome.rejected).toEqual({});
    expect(outcome.byTable.patients).toEqual({ accepted: 1, rejected: 0 });
  });

  // The whole point of the task: without this the route returns 200, the client
  // marks the record synced, and the next pull overwrites the local edit.
  it("names the record the staleness guard skipped", async () => {
    const id = uuidV1();
    patientIds.push(id);
    await Sync.persistClientChanges(
      pushPatient(id, "2026-06-01T00:00:00Z") as any,
      "android",
      caller,
    );

    const outcome = await Sync.persistClientChanges(
      pushPatient(id, "2026-01-01T00:00:00Z") as any,
      "android",
      caller,
    );

    expect(outcome.accepted).toBe(0);
    expect(outcome.rejected.patients).toEqual([id]);
    expect(outcome.byTable.patients).toEqual({ accepted: 0, rejected: 1 });
  });

  /**
   * The one model that wraps its own result.
   *
   * `patients` returns Kysely's `InsertResult` straight through, so its count is
   * a bigint. `appointment.ts` rebuilds the result as
   * `{ numInsertedOrUpdatedRows: Number(...) }`, and a classifier that matched
   * only bigint fell through to its "assume accepted" branch — so a REJECTED
   * appointment was reported accepted, the client marked it synced, and the next
   * pull overwrote the user's edit. Patients passing proves nothing about this
   * path; it has to be exercised on its own.
   */
  it("names a rejected appointment, whose model returns a number row count", async () => {
    const patientId = uuidV1();
    patientIds.push(patientId);
    await Sync.persistClientChanges(
      pushPatient(patientId, "2026-06-01T00:00:00Z") as any,
      "android",
      caller,
    );

    // Supplied explicitly so `save` does not mint a visit of its own, which the
    // teardown below would then have no id for.
    const visitId = uuidV1();
    visitIds.push(visitId);
    await testDb
      .insertInto("visits")
      .values({
        id: visitId,
        patient_id: patientId,
        clinic_id: clinicIds[0],
        provider_id: userIds[0],
        provider_name: "Rejection Test User",
        check_in_timestamp: sql`now()`,
        is_deleted: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
        server_created_at: sql`now()`,
        deleted_at: null,
        metadata: sql`'{}'::jsonb`,
      } as any)
      .execute();

    const appointmentId = uuidV1();
    appointmentIds.push(appointmentId);
    const pushAppointment = (updatedAt: string) => ({
      appointments: {
        created: [
          {
            id: appointmentId,
            patient_id: patientId,
            clinic_id: clinicIds[0],
            user_id: userIds[0],
            current_visit_id: visitId,
            provider_id: null,
            fulfilled_visit_id: null,
            timestamp: "2026-06-01T09:00:00Z",
            duration: 30,
            reason: "Rejection test",
            notes: "",
            status: "pending",
            departments: [],
            is_walk_in: false,
            metadata: {},
            is_deleted: false,
            created_at: "2026-06-01T00:00:00Z",
            updated_at: updatedAt,
          },
        ],
        updated: [],
        deleted: [],
      },
    });

    const first = await Sync.persistClientChanges(
      pushAppointment("2026-06-01T00:00:00Z") as any,
      "android",
      caller,
    );
    expect(first.byTable.appointments).toEqual({ accepted: 1, rejected: 0 });

    // Older than what is stored — the guard must skip it, and the outcome must
    // say so rather than reporting a write that never happened.
    const stale = await Sync.persistClientChanges(
      pushAppointment("2026-01-01T00:00:00Z") as any,
      "android",
      caller,
    );
    expect(stale.accepted).toBe(0);
    expect(stale.rejected.appointments).toEqual([appointmentId]);
    expect(stale.byTable.appointments).toEqual({ accepted: 0, rejected: 1 });
  });

  // markLocalChangesAsSynced resolves collections by the client's table name,
  // so a server-name key would protect nothing. patients happens to match, but
  // the contract is what matters — this breaks loudly if keying ever changes.
  it("keys rejections by the name the client uses for the table", async () => {
    const id = uuidV1();
    patientIds.push(id);
    await Sync.persistClientChanges(
      pushPatient(id, "2026-06-01T00:00:00Z") as any,
      "android",
      caller,
    );
    const outcome = await Sync.persistClientChanges(
      pushPatient(id, "2020-01-01T00:00:00Z") as any,
      "android",
      caller,
    );
    const key = Object.keys(outcome.rejected)[0];
    expect(key).toBe("patients");
    expect(key).not.toContain("undefined");
  });
});
