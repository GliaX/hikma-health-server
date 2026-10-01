import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import "dotenv/config";

// Point the model layer (which reads DATABASE_URL directly) at the test
// database BEFORE importing it, so Sync queries hit the same database as
// the fixtures in this file.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { default: Sync } = await import("@/models/sync");
import type { RequestCaller } from "@/types";

/**
 * Phase 4 security regression tests: clinic-scoped sync for user peers.
 *
 * A user peer pulling with last_pulled_at=0 must only receive records for
 * clinics where they hold can_view_history (plus null-clinic patients),
 * only their own user_clinic_permissions rows, and never password hashes.
 * Push must skip records for clinics outside the caller's write scope
 * instead of failing the whole sync.
 */

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

const ids = {
  clinicA: "",
  clinicB: "",
  userA: "",
  userB: "",
  patientA: "",
  patientB: "",
  patientNull: "",
  visitA: "",
  visitB: "",
  eventA: "",
  eventB: "",
  ucpUserA: "",
  ucpUserB: "",
};

const uuid = () => crypto.randomUUID();

async function userCaller(
  userId: string,
  clinicId: string | null,
): Promise<RequestCaller> {
  const u = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  const row = u.rows[0];
  return {
    user: { ...row, hashed_password: "x" } as any,
    clinic: { _tag: clinicId ? "Some" : "None", value: clinicId } as any,
    token: "test",
  } as RequestCaller;
}

function deviceCaller(clinicIds: string[]): RequestCaller {
  return {
    device: {
      id: uuid(),
      clinic_ids: clinicIds,
    },
  } as unknown as RequestCaller;
}

beforeAll(async () => {
  ids.clinicA = uuid();
  ids.clinicB = uuid();
  ids.userA = uuid();
  ids.userB = uuid();

  await pool.query(
    `INSERT INTO clinics (id, name, is_deleted) VALUES ($1, 'SyncScopeA', false), ($2, 'SyncScopeB', false)`,
    [ids.clinicA, ids.clinicB],
  );
  await pool.query(
    `INSERT INTO users (id, name, role, email, hashed_password, is_deleted, clinic_id)
     VALUES ($1, 'User A', 'provider', $3, 'not-a-real-hash', false, $4),
            ($2, 'User B', 'provider', $5, 'not-a-real-hash', false, $6)`,
    [
      ids.userA,
      ids.userB,
      `usera-${ids.userA}@test.local`,
      ids.clinicA,
      `userb-${ids.userB}@test.local`,
      ids.clinicB,
    ],
  );
  // userA may view/edit clinic A only; userB has a row for clinic A too
  // (must NOT be delivered to userA's pull).
  ids.ucpUserA = uuid();
  ids.ucpUserB = uuid();
  await pool.query(
    `INSERT INTO user_clinic_permissions
       (id, user_id, clinic_id, can_register_patients, can_view_history,
        can_edit_records, can_delete_records, is_clinic_admin,
        created_at, updated_at)
     VALUES
       ($1, $2, $3, true, true, true, false, false, now(), now()),
       ($4, $5, $3, false, true, false, false, false, now(), now())`,
    [ids.ucpUserA, ids.userA, ids.clinicA, ids.ucpUserB, ids.userB],
  );

  ids.patientA = uuid();
  ids.patientB = uuid();
  ids.patientNull = uuid();
  for (const [pid, clinic] of [
    [ids.patientA, ids.clinicA],
    [ids.patientB, ids.clinicB],
    [ids.patientNull, null],
  ] as const) {
    await pool.query(
      `INSERT INTO patients (id, given_name, surname, primary_clinic_id, is_deleted, metadata, additional_data, created_at, updated_at, last_modified, server_created_at)
       VALUES ($1, 'Sync', 'Scope', $2, false, '{}'::jsonb, '{}'::jsonb, now(), now(), now(), now())`,
      [pid, clinic],
    );
  }

  ids.visitA = uuid();
  ids.visitB = uuid();
  for (const [vid, patient, clinic] of [
    [ids.visitA, ids.patientA, ids.clinicA],
    [ids.visitB, ids.patientB, ids.clinicB],
  ] as const) {
    await pool.query(
      `INSERT INTO visits (id, patient_id, clinic_id, provider_id, check_in_timestamp, metadata, is_deleted, created_at, updated_at, last_modified, server_created_at)
       VALUES ($1, $2, $3, $4, now(), '{}'::jsonb, false, now(), now(), now(), now())`,
      [vid, patient, clinic, ids.userA],
    );
  }

  ids.eventA = uuid();
  ids.eventB = uuid();
  for (const [eid, patient, visit] of [
    [ids.eventA, ids.patientA, ids.visitA],
    [ids.eventB, ids.patientB, ids.visitB],
  ] as const) {
    await pool.query(
      `INSERT INTO events (id, patient_id, visit_id, event_type, form_data, metadata, is_deleted, created_at, updated_at, last_modified, server_created_at)
       VALUES ($1, $2, $3, 'test', '{}'::jsonb, '{}'::jsonb, false, now(), now(), now(), now())`,
      [eid, patient, visit],
    );
  }
});

afterAll(async () => {
  if (ids.eventA) await pool.query("DELETE FROM events WHERE id = ANY($1)", [
    [ids.eventA, ids.eventB],
  ]);
  if (ids.visitA) await pool.query("DELETE FROM visits WHERE id = ANY($1)", [
    [ids.visitA, ids.visitB],
  ]);
  if (ids.patientA) await pool.query("DELETE FROM patients WHERE id = ANY($1)", [
    [ids.patientA, ids.patientB, ids.patientNull],
  ]);
  if (ids.ucpUserA) await pool.query(
    "DELETE FROM user_clinic_permissions WHERE id = ANY($1)",
    [[ids.ucpUserA, ids.ucpUserB]],
  );
  if (ids.userA) await pool.query("DELETE FROM users WHERE id = ANY($1)", [
    [ids.userA, ids.userB],
  ]);
  if (ids.clinicA) await pool.query("DELETE FROM clinics WHERE id = ANY($1)", [
    [ids.clinicA, ids.clinicB],
  ]);
  await pool.end();
});

describe("sync clinic scoping (user peers)", () => {
  it("pull only returns permitted-clinic and null-clinic patients", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);
    const changes = await Sync.getDeltaRecords(0, "unknown", caller);
    const patients = changes["patients"]?.created ?? [];
    const patientIds = patients.map((p) => p.id);

    expect(patientIds).toContain(ids.patientA);
    expect(patientIds).toContain(ids.patientNull);
    expect(patientIds).not.toContain(ids.patientB);
  });

  it("pull scopes events via their patient's clinic", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);
    const changes = await Sync.getDeltaRecords(0, "unknown", caller);
    const events = changes["events"]?.created ?? [];
    const eventIds = events.map((e) => e.id);

    expect(eventIds).toContain(ids.eventA);
    expect(eventIds).not.toContain(ids.eventB);
  });

  it("pull only returns the caller's own user_clinic_permissions rows", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);
    const changes = await Sync.getDeltaRecords(0, "unknown", caller);
    const ucp = [
      ...(changes["user_clinic_permissions"]?.created ?? []),
      ...(changes["user_clinic_permissions"]?.updated ?? []),
    ];

    expect(ucp.length).toBeGreaterThan(0);
    expect(ucp.every((r) => r.user_id === ids.userA)).toBe(true);
  });

  it("pull does not include a users table for user peers", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);
    const changes = await Sync.getDeltaRecords(0, "unknown", caller);
    expect(changes["users"]).toBeUndefined();
  });

  it("hub pull includes users but strips password hashes", async () => {
    const caller = deviceCaller([ids.clinicA]);
    const changes = await Sync.getDeltaRecords(0, "sync_hub", caller);
    const users = [
      ...(changes["users"]?.created ?? []),
      ...(changes["users"]?.updated ?? []),
    ];

    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.hashed_password).toBeUndefined();
    }
  });

  it("push applies in-scope records and silently skips out-of-scope ones", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);
    const visitInScope = uuid();
    const visitOutOfScope = uuid();

    await Sync.persistClientChanges(
      {
        visits: {
          created: [
            {
              id: visitInScope,
              patient_id: ids.patientA,
              clinic_id: ids.clinicA,
              provider_id: ids.userA,
              check_in_timestamp: new Date().toISOString(),
              metadata: "{}",
              is_deleted: false,
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: visitOutOfScope,
              patient_id: ids.patientB,
              clinic_id: ids.clinicB,
              provider_id: ids.userA,
              check_in_timestamp: new Date().toISOString(),
              metadata: "{}",
              is_deleted: false,
              created_at: Date.now(),
              updated_at: Date.now(),
            },
          ],
          updated: [],
          deleted: [],
        },
      } as any,
      "unknown",
      caller,
    );

    const applied = await pool.query(
      "SELECT id FROM visits WHERE id = ANY($1)",
      [[visitInScope, visitOutOfScope]],
    );
    const appliedIds = applied.rows.map((r) => r.id);
    expect(appliedIds).toContain(visitInScope);
    expect(appliedIds).not.toContain(visitOutOfScope);

    await pool.query("DELETE FROM visits WHERE id = $1", [visitInScope]);
  });

  it("push does not delete out-of-scope records", async () => {
    const caller = await userCaller(ids.userA, ids.clinicA);

    await Sync.persistClientChanges(
      {
        visits: {
          created: [],
          updated: [],
          deleted: [ids.visitB],
        },
      } as any,
      "unknown",
      caller,
    );

    const stillThere = await pool.query(
      "SELECT id FROM visits WHERE id = $1",
      [ids.visitB],
    );
    expect(stillThere.rows).toHaveLength(1);
  });
});
