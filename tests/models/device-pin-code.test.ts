import { describe, it, expect } from "vitest";
import fc from "fast-check";
import DevicePinCode from "../../src/models/device-pin-code";

describe("DevicePinCode.isValidPin", () => {
  it("should accept exactly 6 digits", () => {
    expect(DevicePinCode.isValidPin("123456")).toBe(true);
    expect(DevicePinCode.isValidPin("000000")).toBe(true);
    expect(DevicePinCode.isValidPin("999999")).toBe(true);
  });

  it("should reject pins that are too short or too long", () => {
    expect(DevicePinCode.isValidPin("12345")).toBe(false);
    expect(DevicePinCode.isValidPin("1234567")).toBe(false);
    expect(DevicePinCode.isValidPin("")).toBe(false);
  });

  it("should reject non-digit characters", () => {
    expect(DevicePinCode.isValidPin("12345a")).toBe(false);
    expect(DevicePinCode.isValidPin("abcdef")).toBe(false);
    expect(DevicePinCode.isValidPin("12 345")).toBe(false);
    expect(DevicePinCode.isValidPin("12.345")).toBe(false);
  });

  it("property: only accepts strings of exactly 6 digits", () => {
    // Valid 6-digit strings should always pass
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), { minLength: 6, maxLength: 6 }).map((arr) => arr.join("")),
        (pin) => {
          expect(DevicePinCode.isValidPin(pin)).toBe(true);
        },
      ),
    );
  });

  it("property: rejects strings that are not exactly 6 digits", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^\d{6}$/.test(s)),
        (pin) => {
          expect(DevicePinCode.isValidPin(pin)).toBe(false);
        },
      ),
    );
  });
});

describe("DevicePinCode.hashPin", () => {
  it("should return a bcrypt hash (60 chars, $2b$ prefix)", () => {
    const hash = DevicePinCode.hashPin("123456");
    expect(hash).toMatch(/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
  });

  it("should embed a unique salt per call", () => {
    expect(DevicePinCode.hashPin("123456")).not.toBe(
      DevicePinCode.hashPin("123456"),
    );
  });

  it("should produce hashes that verify against the original pin", () => {
    const bcrypt = require("bcrypt");
    for (const pin of ["123456", "000000", "654321"]) {
      expect(bcrypt.compareSync(pin, DevicePinCode.hashPin(pin))).toBe(true);
    }
  });

  it("should produce hashes that do not verify against other pins", () => {
    const bcrypt = require("bcrypt");
    const hash = DevicePinCode.hashPin("123456");
    expect(bcrypt.compareSync("654321", hash)).toBe(false);
  });

  it(
    "property: every 6-digit pin verifies against its hash",
    () => {
      const bcrypt = require("bcrypt");
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), { minLength: 6, maxLength: 6 }).map((arr) => arr.join("")),
          (pin) => {
            expect(bcrypt.compareSync(pin, DevicePinCode.hashPin(pin))).toBe(true);
          },
        ),
        { numRuns: 3 },
      );
    },
    30_000,
  );
});describe("DevicePinCode.PIN_LENGTH", () => {
  it("should be 6", () => {
    expect(DevicePinCode.PIN_LENGTH).toBe(6);
  });
});
