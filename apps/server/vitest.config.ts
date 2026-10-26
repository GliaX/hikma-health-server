import {defineConfig} from "vitest/config";
import {resolve} from "path";

/**
 * V3 server package. Alias precedence:
 *   1. explicit entries below for code that has migrated into `apps/server/src`
 *   2. everything else falls back to the legacy root `src/` until it moves here
 * When you migrate a module, add an explicit alias entry for it (or flip the
 * fallback once the whole tree has moved).
 */
export default defineConfig({
    test: {
        name: "server",
        include: ["tests/**/*.test.ts"],
        globals: true,
        environment: "node",
        setupFiles: ["./tests/integration/setup.ts"],
        testTimeout: 30_000,
        exclude: ["**/node_modules/**", "**/dist/**"],
    },
    resolve: {
        alias: {
            "@hikmahealth/js-utils": resolve(__dirname, "../../src/shims/js-utils.ts"),
            "@/integrations/trpc/routers/commands/sync": resolve(__dirname, "./src/integrations/trpc/routers/commands/sync.ts"),
            "@/integrations/trpc/init": resolve(__dirname, "./src/integrations/trpc/init.ts"),
            "@/models/sync-audit": resolve(__dirname, "./src/models/sync-audit.ts"),
            "@/models/sync": resolve(__dirname, "./src/models/sync.ts"),
            "@/models/sync-shared": resolve(__dirname, "./src/models/sync-shared.ts"),
            "@/models/sync-paged": resolve(__dirname, "./src/models/sync-paged.ts"),
            "@": resolve(__dirname, "../../src"),
        },
    },
});
