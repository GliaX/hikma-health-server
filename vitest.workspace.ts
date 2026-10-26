import {defineWorkspace} from "vitest/config";

export default defineWorkspace([
    {
        extends: "./vitest.config.ts",
        test: {
            name: "unit",
        },
    },
    {
        extends: "./vitest.integration.config.ts",
        test: {
            name: "integration",
        },
    },
    "./apps/server/vitest.config.ts",
]);
