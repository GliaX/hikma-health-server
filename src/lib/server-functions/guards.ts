import Token from "@/models/token";
import User from "@/models/user";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { Option } from "effect";

/**
 * Returns the authenticated user for the current request, or null when there
 * is no valid session token.
 *
 * Server-only: relies on the request-scoped cookie store.
 */
export const getAuthenticatedUser = createServerOnlyFn(async () => {
	const token = getCookie("token");
	if (!token) return null;
	const userOption = await Token.getUser(token);
	return Option.getOrNull(userOption);
});

/**
 * Returns the authenticated user or throws when there is no valid session.
 *
 * Use this at the top of server-function handlers that must never run
 * unauthenticated. Throwing produces an error response instead of executing
 * the handler body.
 */
export const requireAuthenticatedUser = createServerOnlyFn(async () => {
	const user = await getAuthenticatedUser();
	if (!user) {
		throw new Error("Unauthorized: authentication required");
	}
	return user;
});

/**
 * Returns the authenticated user or throws when the session is missing or the
 * user's role lacks any of the required role capabilities.
 */
export const requireCapability = createServerOnlyFn(
	async (...capabilities: (typeof User.CapabilitySchema.Type)[]) => {
		const user = await requireAuthenticatedUser();
		const roleCapabilities = User.ROLE_CAPABILITIES[user.role] || [];
		const authorized = capabilities.every((capability) =>
			roleCapabilities.includes(capability),
		);
		if (!authorized) {
			throw new Error("Unauthorized: insufficient permissions");
		}
		return user;
	},
);
