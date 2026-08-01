/**
 * Architecture guards — the 5 MANDATORY rules of PRD §4.5, executable.
 * Runs as the last step of `npm run check` (`depcruise src` — flagless:
 * dependency-cruiser >= 13 auto-discovers this file).
 *
 * While these rules hold, `src/core` stays extractable as a standalone
 * package (PRD §4.5 extraction guarantee).
 *
 * NOTE (dec-011): typescript is pinned to 5.9.3 because dependency-cruiser
 * declares support for typescript >=2.0.0 <7.0.0 only. Returning to the
 * typescript 7.x line is a future story once dependency-cruiser supports
 * TS >=7.
 */
module.exports = {
  forbidden: [
    {
      // PRD §4.5 rule 1: the core never imports adapters or the
      // composition root.
      name: "core-no-adapters",
      severity: "error",
      from: { path: "^src/core/" },
      to: { path: "^src/(adapters|main)/" },
    },
    {
      // PRD §4.5 rule 2 (+ dec-002): the core imports no I/O or runtime
      // libraries. WHITELIST: `zod` is the ONLY npm package allowed in
      // core; ALL Node builtins are banned, in both bare ("fs") and
      // prefixed ("node:fs") forms. Relaxing this is a deliberate,
      // reviewed edit of this rule (protocol B).
      // `pathNot` lists both the bare specifier ("zod", how dc reports
      // it while the package is not installed) and the resolved path
      // ("node_modules/zod/...", how dc reports it once installed).
      name: "core-no-io-libs",
      severity: "error",
      from: { path: "^src/core/" },
      to: {
        dependencyTypes: [
          "core",
          "deprecated",
          "npm",
          "npm-bundled",
          "npm-dev",
          "npm-no-pkg",
          "npm-optional",
          "npm-peer",
          "npm-unknown",
          "undetermined",
          "unknown",
        ],
        pathNot: ["^zod(/|$)", "^node_modules/zod(/|$)"],
      },
    },
    {
      // PRD §4.5 rule 3: core modules depend on each other only through
      // the other module's public index. "$1" is the importing module's
      // own folder (group matching): imports inside the same module are
      // free; only cross-module non-index imports are violations.
      name: "core-modules-via-index",
      severity: "error",
      from: { path: "^src/core/([^/]+)/" },
      to: {
        path: "^src/core/[^/]+/",
        pathNot: ["^src/core/$1/", "^src/core/[^/]+/index\\.ts$"],
      },
    },
    {
      // PRD §4.5 rule 4: adapters never import other adapters — sharing
      // happens only via core port types. "$1/$2" is the importing
      // adapter's own direction/name folder (group matching).
      name: "adapters-isolated",
      severity: "error",
      from: { path: "^src/adapters/([^/]+)/([^/]+)/" },
      to: {
        path: "^src/adapters/",
        pathNot: ["^src/adapters/$1/$2/"],
      },
    },
    {
      // PRD §4.5 rule 5: wiring lives only in src/main — nothing outside
      // the composition root imports from it.
      name: "wiring-only-in-main",
      severity: "error",
      from: { pathNot: "^src/main/" },
      to: { path: "^src/main/" },
    },
  ],
  options: {
    // Resolve with the project's TS settings (NodeNext) so imports
    // between .ts files (".js" specifiers included) actually resolve.
    tsConfig: { fileName: "tsconfig.json" },
    // Also record type-only / pre-compilation imports: an
    // `import type` from a forbidden area is still forbidden coupling
    // (dec-008). Bonus: faster cruising.
    tsPreCompilationDeps: true,
    // Report external packages as dependencies, do not cruise into them.
    doNotFollow: { path: "node_modules" },
  },
};
