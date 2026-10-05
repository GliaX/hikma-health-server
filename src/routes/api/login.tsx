import {
	createRateLimiter,
	getClientIp,
	tooManyRequestsResponse,
} from "@/lib/rate-limiter";
import Clinic from "@/models/clinic";
import User from "@/models/user";
import { createFileRoute } from "@tanstack/react-router";
import { minutesToMilliseconds } from "date-fns";

const loginLimiter = createRateLimiter({
	windowMs: minutesToMilliseconds(15),
	maxRequests: 30,
});

/**
 * Legacy mobile login endpoint.
 *
 * The mobile app's cloud sign-in flow POSTs { email, password } to /api/login
 * and expects a 200 response with the flat user record (id, name, email, role,
 * instance_url, clinic_id, clinic_name) and no `message` field. Credentials
 * are verified without minting a session token; mobile clients obtain a
 * Bearer token separately via /api/auth/sign-in.
 */
export const Route = createFileRoute("/api/login")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const ip = getClientIp(request);
				const limit = loginLimiter.check(ip);
				if (!limit.allowed) return tooManyRequestsResponse(limit.retryAfterMs);

				const { email, password } = await request.json();

				try {
					const user = await User.verifyCredentials(email, password);

					const clinic = user.clinic_id
						? await Clinic.getById(user.clinic_id)
						: null;

					return new Response(
						JSON.stringify({
							id: user.id,
							name: user.name,
							email: user.email,
							role: user.role,
							instance_url: user.instance_url,
							clinic_id: user.clinic_id,
							clinic_name: clinic?.name ?? null,
						}),
						{
							headers: { "Content-Type": "application/json" },
							status: 200,
						},
					);
				} catch (error) {
					console.error("[login error]", error);
					return new Response(
						JSON.stringify({ error: "Invalid credentials" }),
						{
							headers: { "Content-Type": "application/json" },
							status: 401,
						},
					);
				}
			},
		},
	},
});
