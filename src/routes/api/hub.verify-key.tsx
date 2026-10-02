import { createFileRoute } from "@tanstack/react-router";
import Device from "@/models/device";
import {
  createRateLimiter,
  getClientIp,
  tooManyRequestsResponse,
} from "@/lib/rate-limiter";

/** Throttle device API-key verification attempts. */
const verifyKeyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
});

export const Route = createFileRoute("/api/hub/verify-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limit = verifyKeyLimiter.check(getClientIp(request));
        if (!limit.allowed) return tooManyRequestsResponse(limit.retryAfterMs);

        try {
          const { api_key } = await request.json();
          if (!api_key || typeof api_key !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing or invalid api_key" }),
              {
                headers: { "Content-Type": "application/json" },
                status: 400,
              },
            );
          }

          const device = await Device.API.getByApiKey(api_key);

          if (!device) {
            return new Response(JSON.stringify({ error: "Invalid API key" }), {
              headers: { "Content-Type": "application/json" },
              status: 401,
            });
          }

          // Strip the api_key_hash from the response
          const { api_key_hash, ...deviceData } = device;

          return new Response(JSON.stringify(deviceData), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        } catch (error) {
          console.error("Error verifying device API key:", error);
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
              headers: { "Content-Type": "application/json" },
              status: 500,
            },
          );
        }
      },
    },
  },
});
