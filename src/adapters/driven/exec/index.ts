/**
 * Driven adapter: exec — process execution for validations, implementing
 * ProcessRunner (PRD §4.2). Lands in E5.F1.x.
 */
export {
  classifyExecaResult,
  type ExecaLikeResult,
} from "./classify-execa-result.js";
export { createExecProcessRunner } from "./process-runner-exec.js";
