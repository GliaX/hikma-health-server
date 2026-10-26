import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {sql} from "kysely";
import {v1 as uuidV1} from "uuid";
import {testDb} from "../setup";
import UserClinicPermissions from "@/models/user-clinic-permissions";
import Sync from "@/models/sync";

vi.mock("@/db", () => ({default: testDb}));

const clinicIds: string[] = [];
const userIds: string[] = [];
const permIds: string[] = [];
let caller: any;

beforeAll(async () => {
    const clinicId = uuidV1();
    clinicIds.push(clinicId);
    await testDb.insertInto("clinics").values({
        id: clinicId,
        name: "DBG2 Clinic",
        is_deleted: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
        server_created_at: sql`now()`,
        deleted_at: null,
    } as any).execute();

    const userId = uuidV1();
    userIds.push(userId);
    await testDb.insertInto("users").values({
        id: userId,
        name: "DBG2 User",
        role: "provider",
        email: `dbg2-${userId}@example.com`,
        hashed_password: "x",
        instance_url: null,
        clinic_id: null,
        is_deleted: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
        last_modified: sql`now()`,
        server_created_at: sql`now()`,
        deleted_at: null,
    } as any).execute();

    const permId = uuidV1();
    permIds.push(permId);
    await testDb.insertInto("user_clinic_permissions").values({
        id: permId,
        user_id: userId,
        clinic_id: clinicId,
        can_register_patients: true,
        can_view_history: true,
        can_edit_records: true,
        can_delete_records: false,
        is_clinic_admin: false,
        created_at: sql`now()`,
        updated_at: sql`now()`,
    } as any).execute();

    caller = {
        user: {id: userId, name: "u", role: "provider"},
        clinic: {id: clinicId, name: "DBG2 Clinic"},
        token: "t",
    };
});

afterAll(async () => {
    for (const id of permIds) await testDb.deleteFrom("user_clinic_permissions").where("id", "=", id).execute();
    for (const id of userIds) await testDb.deleteFrom("users").where("id", "=", id).execute();
    for (const id of clinicIds) await testDb.deleteFrom("clinics").where("id", "=", id).execute();
});

describe("debug2", () => {
    it("logs clinic scope + snapshot", async () => {
        const scope = await (UserClinicPermissions as any).API.getClinicIdsWithPermission(
            userIds[0],
            "can_view_history",
        );
        console.log("SCOPE:", JSON.stringify(scope));
        const delta = await Sync.getDeltaRecords(0, "mobile", caller);
        console.log("CLINICS:", JSON.stringify(delta.clinics));
        expect(true).toBe(true);
    });
});
