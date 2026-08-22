/**
 * `createExecProcessRunner` test: drives the shared `ProcessRunner`
 * contract suite against the real execa-backed adapter. Thin driver only —
 * contract assertions live in `ProcessRunner.contract.ts`. Adapter-specific
 * real-process assertions (AC-1's reaping, byte-exact capture, cwd,
 * no-shell) are ST-4's scope, not this file's.
 */
import { createExecProcessRunner } from "../process-runner-exec.js";
import { runProcessRunnerContract } from "./ProcessRunner.contract.js";

runProcessRunnerContract(() => createExecProcessRunner());
