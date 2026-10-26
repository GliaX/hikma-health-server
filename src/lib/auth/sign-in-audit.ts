/**
 * Local stand-in for upstream's `@/lib/auth/sign-in-audit`.
 *
 * Upstream wires tRPC context creation to a sign-in audit client. The fork
 * does not have that module yet; the only consumer in the migrated tRPC init
 * is `createTRPCContext` (HTTP entry points), which the in-process test
 * callers never use. This no-op keeps the import surface identical so the
 * upstream file can be adopted verbatim; replace with the real audit client
 * when the fork adopts upstream's auth middleware.
 */
export type SignInClient = unknown;

export function signInClient(
    _request: Request,
    _source: string,
): SignInClient {
    return undefined;
}
