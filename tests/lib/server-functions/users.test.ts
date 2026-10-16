import { describe, it, expect, vi, beforeEach } from "vitest";
import User from "@/models/user";

vi.mock("@/lib/auth/request", () => ({
  userRoleTokenHasCapability: vi.fn(),
}));

import { getAllUsersHandler } from "@/lib/server-functions/users";
import { userRoleTokenHasCapability } from "@/lib/auth/request";

describe("getAllUsers authorization gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array and does not query the DB when caller lacks READ_USER", async () => {
    vi.mocked(userRoleTokenHasCapability).mockResolvedValue(false);
    const getAllSpy = vi.spyOn(User.API, "getAll");

    const result = await getAllUsersHandler();

    expect(result).toEqual([]);
    expect(getAllSpy).not.toHaveBeenCalled();
  });

  it("returns users when caller holds READ_USER", async () => {
    vi.mocked(userRoleTokenHasCapability).mockResolvedValue(true);
    vi.spyOn(User.API, "getAll").mockResolvedValue([
      { id: "u1", name: "Alice", hashed_password: "bcrypt-hash-1" } as any,
      { id: "u2", name: "Bob", hashed_password: "bcrypt-hash-2" } as any,
    ]);

    const result = await getAllUsersHandler();

    expect(result.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("strips hashed_password from every returned user", async () => {
    vi.mocked(userRoleTokenHasCapability).mockResolvedValue(true);
    vi.spyOn(User.API, "getAll").mockResolvedValue([
      { id: "u1", name: "Alice", hashed_password: "bcrypt-hash-1" } as any,
      { id: "u2", name: "Bob", hashed_password: "bcrypt-hash-2" } as any,
    ]);

    const result = await getAllUsersHandler();

    expect(result.every((u) => u.hashed_password === "")).toBe(true);
  });
});
