/**
 * Driving adapter: cli — direct commands for scripting (PRD §4.2).
 *
 * Public API (`[E6.F1.H1]`, #36): the `createCli` factory and the dependency
 * contract `src/main/` fills in. Command modules and their formatters land on
 * top of this shell in the same story; nothing here imports another adapter
 * (guard `adapters-isolated`) or `src/main/` (guard `wiring-only-in-main`).
 */

export type {
  CliDeps,
  CliIo,
  CliUseCases,
  ReviewContext,
} from "./cli-deps.js";
export {
  type CommandRegistrar,
  commandRegistrars,
  createCli,
  type SentinelCli,
} from "./create-cli.js";
export { formatErrorLine } from "./render/format-error.js";
