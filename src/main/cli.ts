#!/usr/bin/env node
/**
 * Composition root: the CLI entrypoint (`[E6.F1.H1]`, #36; TUI dispatch
 * `[E6.F2.H1]`, #38).
 *
 * Deliberately trivial — it owns exactly four facts and delegates the rest:
 * the package version (AC-4, the `[E0.F1.H3]` contract this file inherits),
 * `process.argv`, the surface dispatch, and the exit code.
 *
 * Dispatch is one argv-length comparison (design §Overview): zero user args
 * selects the TUI surface — whose own injected-TTY gate prints guidance and
 * exits 1 off a terminal — while anything else (`--help`, `--version`, every
 * subcommand, every usage error) takes the commander path byte-for-byte
 * unchanged (AC-1). One process builds one surface's deps; the TUI never
 * enters commander.
 *
 * The exit code is **assigned to `process.exitCode`**, never passed to
 * `process.exit()`: `process.exit` tears the process down without flushing
 * pending writes, which on a pipe would truncate the very output the run just
 * produced. Assigning lets Node exit naturally once `stdout` has drained.
 */
import pkg from "../../package.json" with { type: "json" };
import { createCli } from "../adapters/driving/cli/index.js";
import { createTui } from "../adapters/driving/tui/index.js";
import { createCliDeps, createTuiDeps } from "./container.js";

process.exitCode =
  process.argv.slice(2).length === 0
    ? await createTui(createTuiDeps()).run()
    : await createCli(createCliDeps({ version: pkg.version })).run(
        process.argv,
      );
