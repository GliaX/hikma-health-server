import {defineConfig} from "vitest/config";
import {resolve} from "path";

export default defineConfig({
    test: {
        include: ["tests/integration/**/*.test.ts"],
        globals: true,
        setupFiles: ["./tests/integration/setup.ts"],
        testTimeout: 30_000,
        exclude: ["**/node_modules/**", "**/dist/**", "apps/server/**"],
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
