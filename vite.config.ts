import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
// import viteTsConfigPaths from "vite-tsconfig-paths";
import { devtools } from "@tanstack/devtools-vite";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";

// import { wrapVinxiConfigWithSentry } from "@sentry/tanstackstart-react";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  // Global HTTP security headers for every response (pages + API).
  // CSP ships as Report-Only first so violations are observable in the
  // console without breaking the app; tighten to enforcing once clean.
  nitro: {
    routeRules: {
      "/**": {
        headers: {
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Strict-Transport-Security":
            "max-age=31536000; includeSubDomains",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Content-Security-Policy-Report-Only":
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
        },
      },
    },
  },
  // plugins: [
  //   // this is the plugin that enables path aliases
  //   viteTsConfigPaths({
  //     projects: ["./tsconfig.json"],
  //   }),
  //   tailwindcss(),
  //   tanstackStart(),
  // ],
  plugins: [
    devtools(),
    // nitro({
    //   rollupConfig: {
    //     external: [/^@sentry\//, "exceljs", /^echarts/, "zrender"],
    //   },
    //   preset: "render_com",
    // }),
    nitro(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    sentryTanstackStart({
      org: process.env.VITE_SENTRY_ORG,
      project: process.env.VITE_SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
    }),
  ],
  esbuild: {
    jsx: "automatic",
  },
  server: {
    allowedHosts: true,
  },
});
