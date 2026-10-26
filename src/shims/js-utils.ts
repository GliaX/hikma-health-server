/**
 * Local stand-in for the `@hikmahealth/js-utils` package used upstream.
 * The upstream package is not on the public npm registry and this fork's
 * checkout does not include the upstream workspace that provides it, so the
 * handful of call sites (sync models, patient routes) alias to this shim.
 */
const format = (args: unknown[]) =>
    args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");

export const Logger = {
    error: (...args: unknown[]) => console.error("[error]", format(args)),
    warn: (...args: unknown[]) => console.warn("[warn]", format(args)),
    info: (...args: unknown[]) => console.info("[info]", format(args)),
    log: (...args: unknown[]) => console.log("[log]", format(args)),
    debug: (...args: unknown[]) => console.debug("[debug]", format(args)),
};

export default Logger;
