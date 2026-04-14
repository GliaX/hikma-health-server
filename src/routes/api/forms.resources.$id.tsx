import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { Option } from "effect";
import db from "@/db";
import { createDiskAdapter } from "@/storage/adapters/disk";
import Token from "@/models/token";
import User from "@/models/user";

/**
 * Authenticate from Authorization header (Bearer / Basic) or session cookie.
 * The browser sends the session cookie automatically when rendering <img> tags,
 * so cookie auth covers the portal UI. Bearer/Basic covers API/mobile callers.
 */
const authenticate = createServerOnlyFn(
  async (request: Request): Promise<boolean> => {
    // Cookie auth — used by browser-rendered <img> tags in the portal
    const cookieHeader = request.headers.get("Cookie") ?? "";
    const cookieToken = cookieHeader
      .split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === "token")?.[1];

    if (cookieToken) {
      const userOption = await Token.getUser(decodeURIComponent(cookieToken));
      if (Option.isSome(userOption)) return true;
    }

    // Header auth — Bearer token or Basic credentials
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return false;

    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const userOption = await Token.getUser(token);
      return Option.isSome(userOption);
    }

    if (authHeader.startsWith("Basic ")) {
      const encoded = authHeader.slice(6);
      const decoded = Buffer.from(encoded, "base64").toString();
      const colonIndex = decoded.indexOf(":");
      if (colonIndex === -1) return false;
      const email = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);
      try {
        await User.signIn(email, password);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  },
);

export const Route = createFileRoute("/api/forms/resources/$id")({
  server: {
    handlers: {
      /**
       * GET /api/forms/resources/:id
       * Serves a form resource (e.g. a wound image) to authenticated callers.
       * Unlike /api/resources/$id, this does not restrict to public education content —
       * it serves any resource stored under the forms prefix, behind auth.
       */
      GET: async ({ request, params }) => {
        const isAuthenticated = await authenticate(request);
        if (!isAuthenticated) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const resource = await db
          .selectFrom("resources")
          .selectAll()
          .where("id", "=", params.id)
          .executeTakeFirst();

        if (!resource) {
          return new Response("Not found", { status: 404 });
        }

        if (resource.store !== "disk") {
          return new Response("Unsupported storage backend", { status: 501 });
        }

        try {
          const adapter = await createDiskAdapter();
          const bytes = await adapter.downloadAsBytes(resource.uri);

          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Content-Type": resource.mimetype,
              "Cache-Control": "private, max-age=3600",
            },
          });
        } catch {
          return new Response("Failed to read resource", { status: 500 });
        }
      },
    },
  },
});
