/**
 * `runReview` behavioural suite.
 *
 * ST-4 half: every one of the five terminal states is reachable, nothing
 * escapes as a rejection, and pre-flight faults leave no worktree behind
 * (AC-1..AC-6, AC-11, AC-12).
 *
 * ST-5 half: the cleanup contract (AC-7..AC-10), the two seams (AC-13,
 * AC-14), timer hygiene, and the adapter self-enforced timeout precedence
 * route (R1-001).
 */

import { describe, expect, it } from "vitest";
import { createFakeEngine } from "../../../adapters/driven/engines/fake/fake-engine.js";
import { GitWorktreeError } from "../../repos/index.js";
import {
  ContextModeNotSupportedError,
  HarnessNotFoundError,
  HarnessValidationError,
  SkillNotFoundError,
} from "../../review/index.js";
import {
  DiffSizePolicyError,
  InvalidWorktreeRequestError,
  WorktreeCleanupError,
  WorktreeCreationError,
} from "../../workspace/index.js";
import {
  EngineInvocationError,
  EngineTimeoutError,
  InvalidRunRequestError,
  runReview,
} from "../index.js";
import {
  buildDeps,
  buildGit,
  buildHarnessDeps,
  buildRequest,
  buildValidationFailingHarnessDeps,
  createHangingEngine,
  createManualScheduler,
  TIMEOUT_MS,
} from "./run-review-fixtures.js";

describe("runReview", () => {
  describe("ok (AC-1, AC-2)", () => {
    it("resolves the full result shape on the happy path", async () => {
      const git = buildGit();
      const engine = createFakeEngine({
        ok: true,
        result: {
          output: "Looks solid.\nVERDICT: approve\n",
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        },
      });
      const deps = buildDeps({ git, engine });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("ok");
      expect(result.verdict).toBe("approve");
      expect(result.worktreePath).toBe(git.addCalls[0]?.targetPath);
      expect(result.diff?.files).toHaveLength(1);
      expect(result.diff?.files[0]?.path).toBe("src/a.ts");
      expect(result.prompt).toContain("<instructions>");
      expect(result.prompt).toContain("<diff ");
      expect(result.engineOutput).toBe("Looks solid.\nVERDICT: approve\n");
      expect(result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      });
      expect(result.failure).toBeUndefined();
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: true,
        reason: "policy-always",
      });
    });

    it("reaches ok with one distinct VERDICT line — state describes the run, not the opinion", async () => {
      const engine = createFakeEngine({
        ok: true,
        result: { output: "Several issues found.\nVERDICT: request-changes" },
      });
      const deps = buildDeps({ engine });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("ok");
      expect(result.verdict).toBe("request-changes");
    });
  });

  describe("ambiguous (AC-3)", () => {
    it("resolves ambiguous when the output has no VERDICT line", async () => {
      const engine = createFakeEngine({
        ok: true,
        result: { output: "The change looks fine to me.\nNothing to add." },
      });
      const deps = buildDeps({ engine });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("ambiguous");
      expect(result.verdict).toBeUndefined();
      expect(result.failure).toBeUndefined();
      expect(result.engineOutput).toBe(
        "The change looks fine to me.\nNothing to add.",
      );
    });

    it("resolves ambiguous on two distinct conflicting verdicts", async () => {
      const engine = createFakeEngine({
        ok: true,
        result: { output: "VERDICT: approve\nVERDICT: request-changes" },
      });
      const deps = buildDeps({ engine });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("ambiguous");
      expect(result.verdict).toBeUndefined();
    });
  });

  describe("engine-error (AC-4)", () => {
    it("wraps an engine rejection in EngineInvocationError with the cause preserved (AC-4a)", async () => {
      const rawError = new Error("engine exploded");
      const engine = createFakeEngine({ ok: false, error: rawError });
      const deps = buildDeps({ engine });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("engine-error");
      expect(result.failure?.stage).toBe("engine");
      expect(result.failure?.error).toBeInstanceOf(EngineInvocationError);
      const wrapped = result.failure?.error as EngineInvocationError;
      expect(wrapped.cause).toBe(rawError);
      // The engine stage failed, so no output; earlier stages still report.
      expect(result.engineOutput).toBeUndefined();
      expect(result.worktreePath).toBeDefined();
      expect(result.diff).toBeDefined();
      expect(result.prompt).toBeDefined();
    });

    it("maps a failed worktree add to engine-error via WorktreeCreationError (AC-4b)", async () => {
      const git = buildGit({ addError: new GitWorktreeError("bad ref") });
      const deps = buildDeps({ git });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("engine-error");
      expect(result.failure?.stage).toBe("worktree");
      expect(result.failure?.error).toBeInstanceOf(WorktreeCreationError);
      // The add failed, so no worktree ever existed to clean up.
      expect(result.worktreePath).toBeUndefined();
      expect(result.cleanup).toEqual({ attempted: false });
      expect(git.removeCalls).toHaveLength(0);
    });
  });

  describe("timeout (AC-5)", () => {
    it("resolves timeout deterministically when the engine never settles", async () => {
      const engine = createHangingEngine();
      const manual = createManualScheduler({ fireImmediately: true });
      const deps = buildDeps({ engine, scheduleTimeout: manual.scheduler });

      const started = Date.now();
      const result = await runReview(buildRequest(), deps);
      const elapsed = Date.now() - started;

      expect(result.state).toBe("timeout");
      expect(result.failure?.stage).toBe("engine");
      expect(result.failure?.error).toBeInstanceOf(EngineTimeoutError);
      const timeoutError = result.failure?.error as EngineTimeoutError;
      expect(timeoutError.timeoutMs).toBe(TIMEOUT_MS);
      // No wall-clock waiting: the 60s budget elapsed through the manual
      // scheduler, not through real timers.
      expect(elapsed).toBeLessThan(TIMEOUT_MS);
      expect(manual.calls).toHaveLength(1);
      expect(manual.calls[0]?.ms).toBe(TIMEOUT_MS);
      // The budget is also forwarded into the engine's own request, so real
      // adapters can self-enforce (r-engine-not-cancellable).
      expect(engine.requests).toHaveLength(1);
      expect(engine.requests[0]?.timeoutMs).toBe(TIMEOUT_MS);
      expect(result.engineOutput).toBeUndefined();
    });
  });

  describe("validation-failed (AC-6) — one case per enumerated producer", () => {
    it("rejects timeoutMs <= 0 at the request stage", async () => {
      const result = await runReview(
        buildRequest({ timeoutMs: 0 }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("request");
      expect(result.failure?.error).toBeInstanceOf(InvalidRunRequestError);
    });

    it("rejects timeoutMs above Node's setTimeout upper bound at the request stage", async () => {
      const result = await runReview(
        buildRequest({ timeoutMs: 2_147_483_648 }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("request");
      expect(result.failure?.error).toBeInstanceOf(InvalidRunRequestError);
      const requestError = result.failure?.error as InvalidRunRequestError;
      expect(requestError.message).toContain("2147483647");
    });

    it("rejects an empty harnessType at the request stage", async () => {
      const result = await runReview(
        buildRequest({ harnessType: "" }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("request");
      expect(result.failure?.error).toBeInstanceOf(InvalidRunRequestError);
    });

    it("rejects a relative repoPath at the worktree stage", async () => {
      const result = await runReview(
        buildRequest({ repoPath: "relative/path" }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("worktree");
      expect(result.failure?.error).toBeInstanceOf(InvalidWorktreeRequestError);
    });

    it("rejects limits.maxLines = 0 at the diff stage", async () => {
      const result = await runReview(
        buildRequest({ limits: { maxLines: 0, maxTokens: 50000 } }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("diff");
      expect(result.failure?.error).toBeInstanceOf(DiffSizePolicyError);
    });

    it("rejects an unknown harness at the harness stage", async () => {
      const result = await runReview(
        buildRequest({ harnessType: "nonexistent" }),
        buildDeps(),
      );

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("harness");
      expect(result.failure?.error).toBeInstanceOf(HarnessNotFoundError);
    });

    it("rejects a harness referencing a missing skill at the harness stage", async () => {
      const deps = buildDeps({
        harnesses: buildHarnessDeps({ harnessSkills: ["absent-skill"] }),
      });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("harness");
      expect(result.failure?.error).toBeInstanceOf(SkillNotFoundError);
    });

    it("rejects a non-inline contextMode at the prompt stage", async () => {
      const deps = buildDeps({
        harnesses: buildHarnessDeps({ contextMode: "agent" }),
      });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("prompt");
      expect(result.failure?.error).toBeInstanceOf(
        ContextModeNotSupportedError,
      );
    });

    it("rejects a harness that fails validation at the harness stage", async () => {
      const deps = buildDeps({
        harnesses: buildValidationFailingHarnessDeps(),
      });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("validation-failed");
      expect(result.failure?.stage).toBe("harness");
      expect(result.failure?.error).toBeInstanceOf(HarnessValidationError);
    });
  });

  describe("no worktree on a pre-flight failure (AC-11)", () => {
    it("creates no worktree for an unknown harness", async () => {
      const git = buildGit();
      const deps = buildDeps({ git });

      const result = await runReview(
        buildRequest({ harnessType: "nonexistent" }),
        deps,
      );

      expect(result.state).toBe("validation-failed");
      expect(result.cleanup).toEqual({ attempted: false });
      expect(git.addCalls).toHaveLength(0);
      expect(git.removeCalls).toHaveLength(0);
    });

    it("creates no worktree for timeoutMs <= 0", async () => {
      const git = buildGit();
      const deps = buildDeps({ git });

      const result = await runReview(buildRequest({ timeoutMs: 0 }), deps);

      expect(result.state).toBe("validation-failed");
      expect(result.cleanup).toEqual({ attempted: false });
      expect(git.addCalls).toHaveLength(0);
      expect(git.removeCalls).toHaveLength(0);
    });
  });

  describe("never rejects (AC-12)", () => {
    it("resolves an unrecognized throwable as engine-error with the original preserved", async () => {
      const rawError = new TypeError("mergeBase is not a function");
      const git = buildGit({ mergeBaseError: rawError });
      const deps = buildDeps({ git });

      // Same promise asserted twice: first that it resolves (never rejects),
      // then what it resolved to.
      const promise = runReview(buildRequest(), deps);
      await expect(promise).resolves.toBeDefined();

      const result = await promise;
      expect(result.state).toBe("engine-error");
      expect(result.failure?.stage).toBe("diff");
      expect(result.failure?.error).toBe(rawError);
    });
  });

  describe("cleanup on every path under policy always (AC-7)", () => {
    // A failed worktree ADD (`cleanup: { attempted: false }`, no remove call)
    // is already pinned by AC-4b above and is deliberately not re-counted here.
    it("removes the worktree on ok", async () => {
      const git = buildGit();

      const result = await runReview(buildRequest(), buildDeps({ git }));

      expect(result.state).toBe("ok");
      expect(git.removeCalls).toHaveLength(1);
      expect(git.removeCalls[0]?.worktreePath).toBe(result.worktreePath);
    });

    it("removes the worktree on ambiguous", async () => {
      const git = buildGit();
      const engine = createFakeEngine({
        ok: true,
        result: { output: "No verdict line anywhere." },
      });

      const result = await runReview(
        buildRequest(),
        buildDeps({ git, engine }),
      );

      expect(result.state).toBe("ambiguous");
      expect(git.removeCalls).toHaveLength(1);
    });

    it("removes the worktree on a post-worktree engine-error", async () => {
      const git = buildGit();
      const engine = createFakeEngine({
        ok: false,
        error: new Error("engine exploded"),
      });

      const result = await runReview(
        buildRequest(),
        buildDeps({ git, engine }),
      );

      expect(result.state).toBe("engine-error");
      expect(git.removeCalls).toHaveLength(1);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: true,
        reason: "policy-always",
      });
    });

    it("removes the worktree on timeout", async () => {
      const git = buildGit();
      const engine = createHangingEngine();
      const manual = createManualScheduler({ fireImmediately: true });

      const result = await runReview(
        buildRequest(),
        buildDeps({ git, engine, scheduleTimeout: manual.scheduler }),
      );

      expect(result.state).toBe("timeout");
      expect(git.removeCalls).toHaveLength(1);
    });
  });

  describe("cleanup honours the policy (AC-8)", () => {
    it("keep never removes, even on ok", async () => {
      const git = buildGit();

      const result = await runReview(
        buildRequest({ cleanupPolicy: "keep" }),
        buildDeps({ git }),
      );

      expect(result.state).toBe("ok");
      expect(git.removeCalls).toHaveLength(0);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "policy-keep",
      });
    });

    it("on-success removes on ok", async () => {
      const git = buildGit();

      const result = await runReview(
        buildRequest({ cleanupPolicy: "on-success" }),
        buildDeps({ git }),
      );

      expect(result.state).toBe("ok");
      expect(git.removeCalls).toHaveLength(1);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: true,
        reason: "policy-on-success",
      });
    });

    it("on-success keeps the worktree on engine-error", async () => {
      const git = buildGit();
      const engine = createFakeEngine({
        ok: false,
        error: new Error("engine exploded"),
      });

      const result = await runReview(
        buildRequest({ cleanupPolicy: "on-success" }),
        buildDeps({ git, engine }),
      );

      expect(result.state).toBe("engine-error");
      expect(git.removeCalls).toHaveLength(0);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "review-failed",
      });
    });

    it("on-success keeps the worktree on timeout", async () => {
      const git = buildGit();
      const engine = createHangingEngine();
      const manual = createManualScheduler({ fireImmediately: true });

      const result = await runReview(
        buildRequest({ cleanupPolicy: "on-success" }),
        buildDeps({ git, engine, scheduleTimeout: manual.scheduler }),
      );

      expect(result.state).toBe("timeout");
      expect(git.removeCalls).toHaveLength(0);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "review-failed",
      });
    });

    it("on-success keeps the worktree on ambiguous — literal reading of success (R2-002)", async () => {
      const git = buildGit();
      const engine = createFakeEngine({
        ok: true,
        result: { output: "No verdict line anywhere." },
      });

      const result = await runReview(
        buildRequest({ cleanupPolicy: "on-success" }),
        buildDeps({ git, engine }),
      );

      expect(result.state).toBe("ambiguous");
      expect(git.removeCalls).toHaveLength(0);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "review-failed",
      });
    });
  });

  describe("a cleanup fault annotates, never overrides (AC-9, AC-10)", () => {
    it("keeps state ok when only the cleanup fails (AC-9)", async () => {
      const git = buildGit({ removeError: new GitWorktreeError("rm failed") });
      const deps = buildDeps({ git });

      // The same promise asserted twice: a cleanup fault must not reject.
      const promise = runReview(buildRequest(), deps);
      await expect(promise).resolves.toBeDefined();

      const result = await promise;
      expect(result.state).toBe("ok");
      expect(result.verdict).toBe("approve");
      expect(result.failure).toBeUndefined();
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "cleanup-failed",
        error: expect.any(WorktreeCleanupError),
      });
    });

    it("does not swallow the originating engine error when cleanup also fails (AC-10)", async () => {
      const git = buildGit({ removeError: new GitWorktreeError("rm failed") });
      const engine = createFakeEngine({
        ok: false,
        error: new Error("engine exploded"),
      });

      const result = await runReview(
        buildRequest(),
        buildDeps({ git, engine }),
      );

      expect(result.state).toBe("engine-error");
      expect(result.failure?.stage).toBe("engine");
      expect(result.failure?.error).toBeInstanceOf(EngineInvocationError);
      expect(result.cleanup).toEqual({
        attempted: true,
        removed: false,
        reason: "cleanup-failed",
        error: expect.any(WorktreeCleanupError),
      });
    });
  });

  describe("E5 validation seam pass-through (AC-13)", () => {
    it("renders a supplied validationOutput into the prompt", async () => {
      const result = await runReview(
        buildRequest({ validationOutput: ["lint: ok", "tests: 12 passed"] }),
        buildDeps(),
      );

      expect(result.state).toBe("ok");
      expect(result.prompt).toContain("<validation-output>");
      expect(result.prompt).toContain("lint: ok");
      expect(result.prompt).toContain("tests: 12 passed");
    });

    it("omits the validation-output section when none is supplied", async () => {
      const result = await runReview(buildRequest(), buildDeps());

      expect(result.state).toBe("ok");
      expect(result.prompt).not.toContain("<validation-output>");
    });
  });

  describe("parse seam injectable (AC-14)", () => {
    it("lets deps.parseVerdict override the built-in extraction", async () => {
      const seen: string[] = [];
      const engine = createFakeEngine({
        ok: true,
        result: { output: "VERDICT: approve" },
      });
      const deps = buildDeps({
        engine,
        parseVerdict: (output) => {
          seen.push(output);
          return "comment";
        },
      });

      const result = await runReview(buildRequest(), deps);

      // The built-in extraction would say approve; the injected parser wins.
      expect(result.state).toBe("ok");
      expect(result.verdict).toBe("comment");
      expect(seen).toEqual(["VERDICT: approve"]);
    });
  });

  describe("timer hygiene", () => {
    it("cancels the scheduled timer exactly once on the happy path", async () => {
      // Non-firing manual scheduler: the default scheduler's real timer is
      // unobservable, and a leaked (uncancelled) timer must be visible.
      const manual = createManualScheduler();
      const deps = buildDeps({ scheduleTimeout: manual.scheduler });

      const result = await runReview(buildRequest(), deps);

      expect(result.state).toBe("ok");
      expect(manual.calls).toHaveLength(1);
      expect(manual.cancelCount()).toBe(1);
    });
  });

  describe("adapter self-enforced timeout (R1-001)", () => {
    it("maps an engine rejection with the public EngineTimeoutError to timeout, unwrapped", async () => {
      // An E4.F2 adapter that enforces its own budget rejects with the
      // publicly-exported `EngineTimeoutError` (imported from the module
      // index, as production adapters would). The race rethrows it UNWRAPPED
      // instead of wrapping it in `EngineInvocationError`, so the run lands
      // on `timeout`, not `engine-error` — the documented precedence route.
      const adapterTimeout = new EngineTimeoutError(500);
      const engine = createFakeEngine({ ok: false, error: adapterTimeout });

      const result = await runReview(buildRequest(), buildDeps({ engine }));

      expect(result.state).toBe("timeout");
      expect(result.failure?.stage).toBe("engine");
      expect(result.failure?.error).toBe(adapterTimeout);
    });
  });
});
