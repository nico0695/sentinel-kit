/**
 * Driven adapter: engines — claude-code/ and opencode/ ReviewEngine
 * implementations (PRD §4.2). Real adapters land in E4.F2.x.
 *
 * Public API today: the scripted `FakeEngine` used by tests and the future
 * e2e smoke.
 */

export type {
  FakeEngineScript,
  FakeReviewOutcome,
} from "./fake/fake-engine.js";
export { createFakeEngine } from "./fake/fake-engine.js";
