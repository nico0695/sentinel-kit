/**
 * Driving adapter: tui — interactive guided review (PRD §4.2, §3.1-G).
 *
 * Public API (`[E6.F2.H1]`, #38): the `createTui` factory, the clack-backed
 * prompter `src/main/` injects, and the dependency contract the composition
 * root fills in. Nothing here imports another adapter (guard
 * `adapters-isolated`) or `src/main/` (guard `wiring-only-in-main`);
 * `@clack/prompts` is confined to `clack-prompter.ts`.
 */

export { createClackPrompter } from "./clack-prompter.js";
export type {
  PromptOutcome,
  TuiDeps,
  TuiIo,
  TuiPrompter,
  TuiReviewContext,
  TuiSelectOption,
  TuiSpinner,
  TuiTty,
  TuiUseCases,
} from "./tui-deps.js";
export { createTui, type SentinelTui } from "./tui-flow.js";
