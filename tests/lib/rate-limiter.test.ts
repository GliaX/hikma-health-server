import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { createRateLimiter, getClientIp, tooManyRequestsResponse } from "../../src/lib/rate-limiter";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests under the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
  });

  it("should reject requests over the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    limiter.check("ip1");
    limiter.check("ip1");
    const result = limiter.check("ip1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("should track keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip2")).toEqual({ allowed: true });
    expect(limiter.check("ip1").allowed).toBe(false);
    expect(limiter.check("ip2").allowed).toBe(false);
  });

  it("should allow requests again after window expires", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, maxRequests: 1 });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip1").allowed).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect(limiter.check("ip1")).toEqual({ allowed: true });
  });

  it("should use sliding window (oldest request expires first)", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, maxRequests: 2 });

    limiter.check("ip1"); // t=0
    vi.advanceTimersByTime(5_000);
    limiter.check("ip1"); // t=5000

    expect(limiter.check("ip1").allowed).toBe(false); // at capacity

    // Advance past first request's window but not second's
    vi.advanceTimersByTime(5_001);
    expect(limiter.check("ip1")).toEqual({ allowed: true });
  });

  it("property: never allows more than maxRequests in a window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 50 }),
        (maxRequests, totalAttempts) => {
          const limiter = createRateLimiter({ windowMs: 60_000, maxRequests });
          let allowed = 0;
          for (let i = 0; i < totalAttempts; i++) {
            if (limiter.check("key").allowed) allowed++;
          }
          expect(allowed).toBe(Math.min(maxRequests, totalAttempts));
        },
      ),
    );
  });
});

describe("getClientIp", () => {
  const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

  afterEach(() => {
    if (ORIGINAL_TRUST_PROXY === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
    }
  });

  it("ignores client-supplied x-forwarded-for when TRUST_PROXY is not enabled", () => {
    delete process.env.TRUST_PROXY;
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    // Spoofed XFF must not become the rate-limit key.
    expect(getClientIp(request)).toBe("unknown");
  });

  it("uses the first XFF entry when TRUST_PROXY is enabled", () => {
    process.env.TRUST_PROXY = "true";
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("trims whitespace from XFF entries when TRUST_PROXY is enabled", () => {
    process.env.TRUST_PROXY = "true";
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when header is missing (even with TRUST_PROXY)", () => {
    process.env.TRUST_PROXY = "true";
    const request = new Request("http://localhost");
    expect(getClientIp(request)).toBe("unknown");
  });
});

describe("tooManyRequestsResponse", () => {
  it("should return a 429 response", () => {
    const response = tooManyRequestsResponse(5000);
    expect(response.status).toBe(429);
  });

  it("should set Retry-After header in seconds (rounded up)", () => {
    const response = tooManyRequestsResponse(5500);
    expect(response.headers.get("Retry-After")).toBe("6");
  });

  it("should set Content-Type to JSON", () => {
    const response = tooManyRequestsResponse(1000);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should include error message in body", async () => {
    const response = tooManyRequestsResponse(1000);
    const body = await response.json();
    expect(body.error).toContain("Too many requests");
  });

  it("property: Retry-After is always ceil(ms/1000)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300_000 }), (ms) => {
        const response = tooManyRequestsResponse(ms);
        expect(response.headers.get("Retry-After")).toBe(
          String(Math.ceil(ms / 1000)),
        );
      }),
    );
  });
});
