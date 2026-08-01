#!/usr/bin/env node
/**
 * Composition root: future CLI entrypoint — the only place adapters are
 * instantiated (PRD §4.2). Real wiring lands in E6.F1.x; this file only
 * implements the minimal `--version` contract of [E0.F1.H3]: print the
 * package version and exit 0. Any other invocation is a deliberate
 * no-op exiting 0.
 */
import pkg from "../../package.json" with { type: "json" };

if (process.argv.includes("--version")) {
  console.log(pkg.version);
}
