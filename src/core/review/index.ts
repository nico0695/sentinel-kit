/**
 * Core module: review — harnesses, skills, prompt assembly (PRD §4.2).
 * ConfigStore is owned by `repos` (decision B1); import its types
 * via `../repos/index.js` when this module needs config access.
 */

export { type AssemblePromptInput, assemblePrompt } from "./assemble-prompt.js";
export { type LoadHarnessesDeps, loadHarnesses } from "./load-harnesses.js";
export {
  HarnessError,
  type HarnessErrorOptions,
  HarnessNotFoundError,
  HarnessValidationError,
  SkillNotFoundError,
} from "./ports/harness-errors.js";
export type { HarnessLoader } from "./ports/harness-loader.js";
export {
  type Harness,
  type HarnessSkillsConfig,
  HarnessSkillsSchema,
  type ResolvedHarness,
  type Skill,
} from "./ports/harness-schemas.js";
export { resolveHarnessSkills } from "./resolve-harness-skills.js";
