import {defineConfig} from "vitest/config";
import react from "@vitejs/plugin-react";
import {resolve} from "path";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**", "apps/server/**", "**/tests/integration/**"],
        coverage: {
            reporter: ["text", "json", "json-summary", "html"],
            exclude: [
                "**/node_modules/**",
                "**/apps/server/**",
                "**/test/**",
                "**/tests/**",
                "**/.nitro/**",
                "**/.output/**",
                "**/.tanstack/**",
                "**/public/**",
                "**/dist/**",
                "**/e2e/**",
                "**/src/components/ui/**",
                "**/src/routes/**",
                "**/src/data/**",
                "**/src/routeTree.gen.ts",
                "**/db/migrations/**",
                "**/db/old.*",
                "**/db/alembic-*",
                "**/db/utils.ts",
                "**/scripts/**",
                "**/playwright-report/**",
                "**/lib/bs/**",
                "**/*.config.ts",
                "**/*.d.ts",
            ],
            thresholds: {
                // Ratchet thresholds: raise these as coverage improves. Target: 50%.
                statements: 1,
                branches: 45,
                functions: 19,
                lines: 1,
            },
        },
    },
    resolve: {
        alias: {
            "@/models/sync-shared": resolve(__dirname, "./apps/server/src/models/sync-shared.ts"),
            "@/models/sync-paged": resolve(__dirname, "./apps/server/src/models/sync-paged.ts"),
            "@/models/sync": resolve(__dirname, "./apps/server/src/models/sync.ts"),
            "@": resolve(__dirname, "./src"),
            "@hikmahealth/js-utils": resolve(__dirname, "./src/shims/js-utils.ts"),
        },
    },
});
