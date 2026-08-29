/**
 * Cancel-as-value at every pre-run prompt (AC-4, D3; AC-5's "nothing runs
 * without explicit confirmation").
 *
 * One case per step — repo, branch, harness, confirmation — plus the
 * confirmation answered "no". Each asserts the same contract: a friendly
 * line, exit code 0, and zero side effects — `runReview` and `persistRun`
 * are recording fakes that must stay empty.
 */

import { describe, expect, it } from "vitest";
import type { PersistRunRequest } from "../../../../core/history/index.js";
import type {
  BranchRef,
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type { RunReviewRequest } from "../../../../core/run/index.js";
import type { PromptOutcome } from "../tui-deps.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  cancel,
  createScriptedPrompter,
  createTuiTestDeps,
} from "./tui-test-doubles.js";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

const branches: readonly BranchRef[] = [{ name: "feature", kind: "local" }];

interface CancelHarness {
  readonly deps: ReturnType<typeof createTuiTestDeps>;
  readonly runReviewRequests: RunReviewRequest[];
  readonly persistRunRequests: PersistRunRequest[];
  run(): Promise<number>;
}

function harness(
  script: ReadonlyArray<PromptOutcome<string | boolean>>,
): CancelHarness {
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];

  const deps = createTuiTestDeps({
    prompter: createScriptedPrompter(script),
    loadContext: () => Promise.resolve({ config, repos }),
    useCases: {
      listRepos: () => Promise.resolve({ repos }),
      listBranches: (request) =>
        Promise.resolve({ alias: request.alias, branches }),
      listHarnessTypes: () => Promise.resolve(["pr-review"]),
      runReview: (request) => {
        runReviewRequests.push(request);
        return Promise.reject(new Error("runReview must not be reached"));
      },
      persistRun: (request) => {
        persistRunRequests.push(request);
        return Promise.reject(new Error("persistRun must not be reached"));
      },
    },
  });

  return {
    deps,
    runReviewRequests,
    persistRunRequests,
    run: () => createTui(deps).run(),
  };
}

const cases: ReadonlyArray<
  readonly [string, ReadonlyArray<PromptOutcome<string | boolean>>]
> = [
  ["the repository prompt", [cancel()]],
  ["the branch prompt", [answer("owner/repo"), cancel()]],
  ["the harness prompt", [answer("owner/repo"), answer("feature"), cancel()]],
  [
    "the confirmation prompt",
    [answer("owner/repo"), answer("feature"), answer("pr-review"), cancel()],
  ],
];

describe("cancel at every step (AC-4)", () => {
  it.each(cases)(
    "cancelling at %s exits 0 with zero side effects",
    async (_step, script) => {
      const h = harness(script);

      const code = await h.run();

      expect(code).toBe(0);
      expect(h.runReviewRequests).toHaveLength(0);
      expect(h.persistRunRequests).toHaveLength(0);
      expect(h.deps.io.out.join("\n")).toContain("cancelled");
      expect(h.deps.io.err).toEqual([]);
    },
  );

  it("answering no at the confirmation is the same as cancelling (AC-5)", async () => {
    const h = harness([
      answer("owner/repo"),
      answer("feature"),
      answer("pr-review"),
      answer(false),
    ]);

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.persistRunRequests).toHaveLength(0);
    expect(h.deps.io.out.join("\n")).toContain("cancelled");
  });

  it("cancelling after seeing the summary still has zero side effects (AC-5)", async () => {
    // The summary is rendered — resolution already happened, read-only — and
    // the cancel that follows still runs nothing.
    const h = harness([
      answer("owner/repo"),
      answer("feature"),
      answer("pr-review"),
      cancel(),
    ]);

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.deps.io.out.join("\n")).toContain("claude-code");
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.persistRunRequests).toHaveLength(0);
  });
});
