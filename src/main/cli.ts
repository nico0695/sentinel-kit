#!/usr/bin/env node
/**
 * Composition root: the CLI entrypoint (`[E6.F1.H1]`, #36).
 *
 * Deliberately trivial — it owns exactly three facts and delegates the rest:
 * the package version (AC-4, the `[E0.F1.H3]` contract this file inherits),
 * `process.argv`, and the exit code.
 *
 * The exit code is **assigned to `process.exitCode`**, never passed to
 * `process.exit()`: `process.exit` tears the process down without flushing
 * pending writes, which on a pipe would truncate the very output the run just
 * produced. Assigning lets Node exit naturally once `stdout` has drained.
 */
import pkg from "../../package.json" with { type: "json" };
import { createCli } from "../adapters/driving/cli/index.js";
import { createCliDeps } from "./container.js";

const cli = createCli(createCliDeps({ version: pkg.version }));

process.exitCode = await cli.run(process.argv);
