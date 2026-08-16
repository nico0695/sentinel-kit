/**
 * Driven adapter: engines — claude-code/ and opencode/ ReviewEngine
 * implementations (PRD §4.2).
 *
 * Public API today: the `claude-code` adapter (`[E4.F2.H1]`, #28) and the
 * scripted `FakeEngine` used by tests and the future e2e smoke. The
 * `opencode` adapter lands in `[E4.F2.H2]` (#29).
 */

export type { ClaudeCodeAdapterOptions } from "./claude-code/claude-code-adapter.js";
export { createClaudeCodeAdapter } from "./claude-code/claude-code-adapter.js";
export type {
  FakeEngineScript,
  FakeReviewOutcome,
} from "./fake/fake-engine.js";
export { createFakeEngine } from "./fake/fake-engine.js";
