import { describe, it, expect } from "vitest";
import {
  resolveEntitiesForPeer,
  applyClinicScope,
  CLINIC_COLUMN_BY_TABLE,
  CLINIC_ARRAY_TABLES,
  EXEMPT_FROM_HISTORY_LIMIT,
  FULL_SNAPSHOT_TABLES,
  normalizeCivilDates,
} from "@/models/sync-shared";

describe("resolveEntitiesForPeer", () => {
  it("gives hub peers a superset of what mobile peers receive", () => {
    const mobile = resolveEntitiesForPeer("android", "push").map(
      (e) => e.Table.name,
    );
    const hub = resolveEntitiesForPeer("sync_hub", "push").map(
      (e) => e.Table.name,
    );
    for (const name of mobile) expect(hub).toContain(name);
    expect(hub.length).toBeGreaterThan(mobile.length);
  });

  it("treats an unknown peer type as mobile", () => {
    const unknown = resolveEntitiesForPeer("unknown", "push").map(
      (e) => e.Table.name,
    );
    const mobile = resolveEntitiesForPeer("android", "push").map(
      (e) => e.Table.name,
    );
    expect(unknown).toEqual(mobile);
  });

  it("accepts a narrower entity set from mobile than it sends", () => {
    const sends = resolveEntitiesForPeer("android", "push").length;
    const accepts = resolveEntitiesForPeer("android", "pull").length;
    expect(accepts).toBeLessThan(sends);
  });
});

/** Records the `where` calls a query builder would have received. */
const spy = () => {
  const calls: unknown[][] = [];
  const q = {
    where: (...args: unknown[]) => {
      calls.push(args);
      return q;
    },
    calls,
  };
  return q;
};

describe("applyClinicScope", () => {
  it("returns the query untouched when clinicIds is null", () => {
    const q = spy();
    applyClinicScope(q, "visits", null);
    expect(q.calls).toHaveLength(0);
  });

  it("fails closed for an empty clinic list (no clinic access → no rows)", () => {
    const q = spy();
    applyClinicScope(q, "visits", []);
    expect(q.calls).toHaveLength(1);
  });

  it("filters clinics by id directly", () => {
    const q = spy();
    applyClinicScope(q, "clinics", ["c1"]);
    expect(q.calls[0]).toEqual(["id", "in", ["c1"]]);
  });

  it("filters a table with a simple clinic column", () => {
    const q = spy();
    applyClinicScope(q, "visits", ["c1"]);
    expect(q.calls[0]).toEqual([CLINIC_COLUMN_BY_TABLE.visits, "in", ["c1"]]);
  });

  it("scopes events through their patient's primary clinic", () => {
    const q = spy();
    applyClinicScope(q, "events", ["c1"]);
    expect(q.calls).toHaveLength(1);
  });

  it("leaves tables with no clinic association unfiltered", () => {
    const q = spy();
    applyClinicScope(q, "drug_catalogue", ["c1"]);
    expect(q.calls).toHaveLength(0);
  });
});

describe("EXEMPT_FROM_HISTORY_LIMIT", () => {
  it("covers both the server and mobile names for registration forms", () => {
    expect(EXEMPT_FROM_HISTORY_LIMIT).toContain("patient_registration_forms");
    expect(EXEMPT_FROM_HISTORY_LIMIT).toContain("registration_forms");
  });
});

/**
 * The reader itself is pinned against both date frames in
 * tests/lib/civil-date.test.ts, including the east-of-UTC contrast with
 * toISOString. These cover only which tables and columns it is wired to.
 */
describe("normalizeCivilDates", () => {
  /** The shape `pg` produces for a `date` column: local calendar parts. */
  const localMidnight = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d);

  it("renders a patient's date_of_birth as its civil day", () => {
    const [row] = normalizeCivilDates("patients", [
      { id: "p1", date_of_birth: localMidnight(1990, 5, 15) },
    ]);
    expect(row.date_of_birth).toBe("1990-05-15");
  });

  it("leaves a value already in civil form untouched, without copying the row", () => {
    const rows = [{ id: "p1", date_of_birth: "1990-05-15" }];
    const out = normalizeCivilDates("patients", rows);
    expect(out[0]).toBe(rows[0]);
  });

  it("passes through tables that declare no civil-date column", () => {
    const rows = [{ id: "v1", check_in_timestamp: localMidnight(2026, 1, 2) }];
    expect(normalizeCivilDates("visits", rows)).toBe(rows);
  });

  it("tolerates a projection that omits the column", () => {
    // The paged pull's `deleted` bucket selects only (id, deleted_at).
    const rows = [{ id: "p1", deleted_at: "2026-01-02T00:00:00.000Z" }];
    expect(normalizeCivilDates("patients", rows)).toEqual(rows);
  });

  it("maps a null date_of_birth to null rather than a string", () => {
    const [row] = normalizeCivilDates("patients", [
      { id: "p1", date_of_birth: null },
    ]);
    expect(row.date_of_birth).toBeNull();
  });
});

describe("FULL_SNAPSHOT_TABLES", () => {
  it("covers clinics, which mobile resolves through a throwing findAndObserve", () => {
    expect(FULL_SNAPSHOT_TABLES.has("clinics")).toBe(true);
  });

  it("names server table names, so both pull paths can match on them", () => {
    // sync.ts keys off `server_table_name` and sync-paged.ts off
    // `entity.Table.name`; a mobile-side alias would match neither. Both peer
    // lists, since a table pushed to only one leaves the other unsnapshotted.
    for (const peer of ["android", "sync_hub"] as const) {
      const names = resolveEntitiesForPeer(peer, "push").map(
        (e) => e.Table.name,
      );
      for (const table of FULL_SNAPSHOT_TABLES) {
        expect(names).toContain(table);
      }
    }
  });

  it("still narrows to a hub's own clinics rather than every clinic", () => {
    // "Full" means "not a delta", not "unscoped".
    const q = spy();
    applyClinicScope(q, "clinics", ["c1"]);
    expect(q.calls[0]).toEqual(["id", "in", ["c1"]]);
  });
});

describe("app_config clinic scoping", () => {
  it("is excluded from the hub clinic-scope map, whose semantics are inverted", () => {
    // event_forms reads an empty clinic_ids as "all clinics", app_config as
    // "no clinic", so the jsonb branch would turn one into the other.
    expect(CLINIC_ARRAY_TABLES.app_config).toBeUndefined();
    expect(CLINIC_COLUMN_BY_TABLE.app_config).toBeUndefined();
  });

  it("leaves app_config rows unfiltered for hub pulls", () => {
    const q = spy();
    applyClinicScope(q, "app_config", ["c1"]);
    expect(q.calls).toHaveLength(0);
  });
});
