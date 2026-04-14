import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { v7 as uuidV7 } from "uuid";
import { Option } from "effect";
import db from "@/db";
import { createDiskAdapter } from "@/storage/adapters/disk";
import { RESOURCE_PATH_PREFIX } from "@/storage/types";
import Token from "@/models/token";
import User from "@/models/user";

/** Image mimetypes accepted for form resource uploads from mobile */
const ALLOWED_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Authenticate an incoming request via session cookie, Bearer token, or Basic auth.
 * Cookie auth covers browser callers (portal UI) — the browser sends the session
 * cookie automatically on same-origin fetch calls without needing explicit headers.
 * Bearer/Basic auth covers mobile and API callers.
 */
const authenticate = createServerOnlyFn(
  async (request: Request): Promise<boolean> => {
    // Cookie auth — browser portal sends this automatically on same-origin requests
    const cookieHeader = request.headers.get("Cookie") ?? "";
    const cookieToken = cookieHeader
      .split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === "token")?.[1];

    if (cookieToken) {
      const userOption = await Token.getUser(decodeURIComponent(cookieToken));
      if (Option.isSome(userOption)) return true;
    }

    // Header auth — Bearer token or Basic credentials (mobile / API callers)
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

export const Route = createFileRoute("/api/forms/resources")({
  server: {
    handlers: {
      /**
       * POST /api/forms/resources
       * Accepts a multipart/form-data request with a single "file" field.
       * Validates auth, restricts to image mimetypes, stores to disk, and
       * inserts a row into the resources table.
       * Returns: { id: string }
       */
      POST: async ({ request }) => {
        const isAuthenticated = await authenticate(request);
        if (!isAuthenticated) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid multipart form data" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const mimetype = file.type || "application/octet-stream";
        if (!ALLOWED_IMAGE_MIMETYPES.has(mimetype)) {
          return new Response(
            JSON.stringify({
              error: `File type not accepted: ${mimetype}. Only images (jpeg, png, gif, webp) are allowed.`,
            }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const adapter = await createDiskAdapter();
          const destination = `${RESOURCE_PATH_PREFIX}/${uuidV7()}_${file.name}`;
          const result = await adapter.put(bytes, destination, mimetype);

          const row = await db
            .insertInto("resources")
            .values({
              id: uuidV7(),
              store: "disk",
              store_version: adapter.version,
              uri: result.uri,
              hash: result.hash[1],
              mimetype,
              description: file.name,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

          return new Response(JSON.stringify({ id: row.id }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("[forms/resources] Upload error:", error);
          const message =
            error instanceof Error ? error.message : "Upload failed";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
