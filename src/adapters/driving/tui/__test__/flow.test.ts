/**
 * The guided flow's happy path (AC-1 adapter side, AC-3, AC-5, AC-6).
 *
 * Everything here runs against the scripted prompter and fake use cases — no
 * real TTY, no keypress emulation, no `@clack/prompts` (AC-12). The trace
 * array interleaves prompts and use-case calls, so ordering claims (fetch
 * before the branch menu, confirm before `runReview`) are asserted, not
 * assumed.
 */

import { describe, expect, it } from "vitest";
import type {
  PersistRunRequest,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  BranchRef,
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
} from "../../../../core/run/index.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
  type ScriptedPrompter,
} from "./tui-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": {
    url: "https://example.test/owner/repo.git",
    baseBranch: "develop",
  },
};

const branches: readonly BranchRef[] = [
  { name: "feature", kind: "local" },
  { name: "main", kind: "local" },
  { name: "hotfix", kind: "remote", remote: "origin" },
];

const okResult: RunReviewResult = {
  state: "ok",
  verdict: "approve",
  cleanup: { attempted: true, removed: true, reason: "policy-always" },
  engineName: "claude-code",
};

const okRecord: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "develop",
  targetRef: "feature",
  state: "ok",
  verdict: "approve",
  engine: "claude-code",
};

/** The full happy-path script: repo, branch, harness, confirm. */
function happyScript() {
  return [
    answer("owner/repo"),
    answer("feature"),
    answer("pr-review"),
    answer(true),
  ];
}

/** Wraps the scripted prompter so prompts land in the shared trace too. */
function tracingPrompter(
  inner: ScriptedPrompter,
  trace: string[],
): ScriptedPrompter {
  return {
    ...inner,
    select: (input) => {
      trace.push(`prompt:select:${input.message}`);
      return inner.select(input);
    },
    confirm: (input) => {
      trace.push("prompt:confirm");
      return inner.confirm(input);
    },
  };
}

interface FlowHarness {
  readonly deps: ReturnType<typeof createTuiTestDeps>;
  readonly prompter: ScriptedPrompter;
  readonly trace: string[];
  readonly runReviewRequests: RunReviewRequest[];
  readonly persistRunRequests: PersistRunRequest[];
  run(): Promise<number>;
}

function harness(
  options: {
    readonly script?: ReturnType<typeof happyScript>;
    readonly result?: RunReviewResult;
    readonly runReview?: (
      request: RunReviewRequest,
    ) => Promise<RunReviewResult>;
  } = {},
): FlowHarness {
  const trace: string[] = [];
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];

  const scripted = createScriptedPrompter(options.script ?? happyScript());
  const prompter = tracingPrompter(scripted, trace);

  const deps = createTuiTestDeps({
    prompter: prompter as ScriptedPrompter,
    loadContext: () => {
      trace.push("loadContext");
      return Promise.resolve({ config, repos });
    },
    now: () => 1_700_000_000_000,
    useCases: {
      listRepos: () => {
        trace.push("listRepos");
        return Promise.resolve({ repos });
      },
      listBranches: (request) => {
        trace.push(`listBranches:${request.alias}`);
        return Promise.resolve({ alias: request.alias, branches });
      },
      listHarnessTypes: () => {
        trace.push("listHarnessTypes");
        return Promise.resolve(["pr-review", "quick"]);
      },
      runReview: (request) => {
        trace.push("runReview");
        runReviewRequests.push(request);
        if (options.runReview !== undefined) {
          return options.runReview(request);
        }
        return Promise.resolve(options.result ?? okResult);
      },
      persistRun: (request) => {
        trace.push("persistRun");
        persistRunRequests.push(request);
        return Promise.resolve({ runDir: RUN_DIR, record: okRecord });
      },
    },
  });

  return {
    deps,
    prompter: scripted,
    trace,
    runReviewRequests,
    persistRunRequests,
    run: () => createTui(deps).run(),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {
    throw new Error("deferred resolved before wiring");
  };
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe("flow — launch (AC-1, adapter side)", () => {
  it("launches the interactive flow when both streams are TTYs", async () => {
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.deps.io.out[0]).toContain("sentinel");
    // Three menus and one confirmation — the whole flow stayed in the TUI.
    expect(h.prompter.prompts.map((prompt) => prompt.kind)).toEqual([
      "select",
      "select",
      "select",
      "confirm",
    ]);
    expect(h.deps.io.err).toEqual([]);
  });
});

describe("flow — happy path (AC-3)", () => {
  it("drives only core use cases, in the review order", async () => {
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.trace.filter((entry) => !entry.startsWith("prompt:"))).toEqual([
      "listRepos",
      "listBranches:owner/repo",
      "listHarnessTypes",
      "loadContext",
      "runReview",
      "persistRun",
    ]);
  });

  it("offers the registered repos and the fetched branches as options", async () => {
    const h = harness();

    await h.run();

    const [repoPrompt, branchPrompt, harnessPrompt] = h.prompter.prompts;
    expect(repoPrompt?.options?.map((option) => option.value)).toEqual([
      "owner/repo",
    ]);
    expect(branchPrompt?.options?.map((option) => option.value)).toEqual([
      "feature",
      "main",
      "hotfix",
    ]);
    expect(harnessPrompt?.options?.map((option) => option.value)).toEqual([
      "pr-review",
      "quick",
    ]);
  });

  it("composes the request through the same cascade as the CLI", async () => {
    const h = harness();

    await h.run();

    expect(h.runReviewRequests).toHaveLength(1);
    expect(h.runReviewRequests[0]).toMatchObject({
      repoPath: "/tmp/sentinel-test/clones/owner/repo",
      baseRef: "develop",
      targetRef: "feature",
      harnessType: "pr-review",
      engineName: "claude-code",
    });
  });
});

describe("flow — confirmation gate (AC-5)", () => {
  it("summarises repo, branch, harness and the resolved engine before running", async () => {
    const h = harness();

    await h.run();

    const summary = h.deps.io.out.join("\n");
    expect(summary).toContain("owner/repo");
    expect(summary).toContain("feature");
    expect(summary).toContain("pr-review");
    expect(summary).toContain("claude-code");
  });

  it("asks for confirmation strictly before runReview", async () => {
    const h = harness();

    await h.run();

    const confirmAt = h.trace.indexOf("prompt:confirm");
    const runAt = h.trace.indexOf("runReview");
    expect(confirmAt).toBeGreaterThanOrEqual(0);
    expect(runAt).toBeGreaterThan(confirmAt);
  });
});

describe("flow — progress (AC-6)", () => {
  it("covers the fetch with an activity indicator before the branch menu", async () => {
    const h = harness();

    await h.run();

    const fetchStart = h.prompter.spinnerEvents.findIndex((event) =>
      event.startsWith("start:"),
    );
    expect(fetchStart).toBe(0);
    expect(h.prompter.spinnerEvents[0]).toContain("owner/repo");
    expect(h.prompter.spinnerEvents[1]).toMatch(/^stop:/);
  });

  it("keeps a single static-text indicator active while runReview is pending", async () => {
    const run = deferred<RunReviewResult>();
    const h = harness({ runReview: () => run.promise });

    const exitCode = h.run();
    await tick();

    // The run spinner started (static text, no staged progress) and nothing
    // downstream happened while the single awaited call is pending.
    const events = h.prompter.spinnerEvents;
    expect(events[events.length - 1]).toMatch(/^start:/);
    expect(events[events.length - 1]).toContain("Running review");
    expect(h.persistRunRequests).toHaveLength(0);

    run.resolve(okResult);

    expect(await exitCode).toBe(0);
    expect(
      h.prompter.spinnerEvents[h.prompter.spinnerEvents.length - 1],
    ).toMatch(/^stop:/);
    expect(h.persistRunRequests).toHaveLength(1);
  });
});
