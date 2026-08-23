import { describe, expect, it } from "vitest";
import type { RunReviewRequest, RunReviewResult } from "../../run/index.js";
import {
  type PersistRunDeps,
  persistRun,
  type RunRecord,
  type RunStore,
  type RunSummary,
} from "../index.js";

const RUN_DIR = "/home/u/.sentinel/runs/owner__repo/20260824T090000000Z";

interface CapturingStore {
  readonly store: RunStore;
  readonly saved: RunRecord[];
}

function createCapturingRunStore(runDir = RUN_DIR): CapturingStore {
  const saved: RunRecord[] = [];
  const store: RunStore = {
    save(record: RunRecord): Promise<string> {
      saved.push(record);
      return Promise.resolve(runDir);
    },
    list(_repoName: string): Promise<readonly RunSummary[]> {
      throw new Error("not used by persistRun");
    },
    get(_repoName: string, _id: string): Promise<RunRecord> {
      throw new Error("not used by persistRun");
    },
  };
  return { store, saved };
}

function createRunRequest(
  overrides: Partial<RunReviewRequest> = {},
): RunReviewRequest {
  return {
    repoPath: "/home/u/.sentinel/clones/owner/repo",
    baseRef: "main",
    targetRef: "feature/x",
    harnessType: "pr-review",
    timeoutMs: 600_000,
    ...overrides,
  };
}

function expectSingleRecord(saved: readonly RunRecord[]): RunRecord {
  expect(saved).toHaveLength(1);
  const record = saved[0];
  if (record === undefined) {
    throw new Error("expected exactly one saved record");
  }
  return record;
}

describe("persistRun", () => {
  it("composes and saves the record for an ok run, returning the run directory", async () => {
    const { store, saved } = createCapturingRunStore();
    const result: RunReviewResult = {
      state: "ok",
      verdict: "approve",
      prompt: "# review this",
      engineOutput: "VERDICT: approve",
      usage: { inputTokens: 10, outputTokens: 4 },
      cleanup: { attempted: true, removed: true, reason: "policy-always" },
      engineName: "claude-code",
    };
    const deps: PersistRunDeps = { store, now: () => 1_500 };

    const persisted = await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 1_000,
        request: createRunRequest({ validationOutput: ["npm test: ok"] }),
        result,
      },
      deps,
    );

    expect(persisted.runDir).toBe(RUN_DIR);
    const record = expectSingleRecord(saved);
    expect(persisted.record).toBe(record);
    expect(record).toEqual({
      repoName: "owner__repo",
      startedAtEpochMs: 1_000,
      durationMs: 500,
      harness: "pr-review",
      baseRef: "main",
      targetRef: "feature/x",
      state: "ok",
      engine: "claude-code",
      verdict: "approve",
      prompt: "# review this",
      engineOutput: "VERDICT: approve",
      usage: { inputTokens: 10, outputTokens: 4 },
      validationOutput: ["npm test: ok"],
    });
    expect(record.failure).toBeUndefined();
  });

  it("persists a failed run with failure populated and no verdict", async () => {
    const { store, saved } = createCapturingRunStore();
    const result: RunReviewResult = {
      state: "engine-error",
      engineOutput: "partial output",
      failure: { stage: "engine", error: new Error("engine binary not found") },
      cleanup: { attempted: false },
    };
    const deps: PersistRunDeps = { store, now: () => 3_000 };

    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 1_000,
        request: createRunRequest(),
        result,
      },
      deps,
    );

    const record = expectSingleRecord(saved);
    expect(record.state).toBe("engine-error");
    expect(record.failure).toEqual({
      stage: "engine",
      message: "engine binary not found",
    });
    expect(record.verdict).toBeUndefined();
    expect(record.durationMs).toBe(2_000);
  });

  it("reduces the diff to a summary and never persists a diff body", async () => {
    const { store, saved } = createCapturingRunStore();
    const diffBody = "@@ -1 +1 @@\n-old\n+new";
    const result: RunReviewResult = {
      state: "ambiguous",
      diff: {
        files: [
          {
            path: "src/a.ts",
            additions: 1,
            deletions: 1,
            content: diffBody,
            truncated: false,
            diffLineCount: 3,
          },
          {
            path: "src/b.ts",
            additions: 0,
            deletions: 2,
            content: null,
            truncated: true,
            diffLineCount: 40,
          },
        ],
        totalLines: 43,
        estimatedTokens: 512,
        truncated: true,
        warnings: [
          {
            kind: "diff-truncated",
            message: "diff truncated: 1 of 2 files",
            originalLines: 90,
            originalTokens: 900,
            keptLines: 43,
            keptTokens: 512,
            truncatedFileCount: 1,
            totalFileCount: 2,
          },
        ],
      },
      cleanup: { attempted: false },
    };

    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 0,
        request: createRunRequest(),
        result,
      },
      { store, now: () => 0 },
    );

    const record = expectSingleRecord(saved);
    expect(record.diff).toEqual({
      fileCount: 2,
      totalLines: 43,
      estimatedTokens: 512,
      truncated: true,
      warnings: ["diff truncated: 1 of 2 files"],
    });
    expect(JSON.stringify(record)).not.toContain(diffBody);
    expect(JSON.stringify(record)).not.toContain("src/a.ts");
  });

  it("stringifies a non-Error throwable into failure.message", async () => {
    const { store, saved } = createCapturingRunStore();
    const result: RunReviewResult = {
      state: "engine-error",
      failure: { stage: "parse", error: { code: 42, token: "s3cr3t" } },
      cleanup: { attempted: false },
    };

    await persistRun(
      {
        repoName: "solo",
        startedAtEpochMs: 0,
        request: createRunRequest(),
        result,
      },
      { store, now: () => 0 },
    );

    const record = expectSingleRecord(saved);
    expect(record.failure?.stage).toBe("parse");
    expect(typeof record.failure?.message).toBe("string");
    expect(record.failure?.message).toBe("[object Object]");
  });

  it("normalises the alias to a single-segment storage key", async () => {
    const { store, saved } = createCapturingRunStore();
    const base: RunReviewResult = {
      state: "ok",
      verdict: "approve",
      cleanup: { attempted: false },
    };

    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 0,
        request: createRunRequest(),
        result: base,
      },
      { store, now: () => 0 },
    );
    await persistRun(
      {
        repoName: "no-separator",
        startedAtEpochMs: 0,
        request: createRunRequest(),
        result: base,
      },
      { store, now: () => 0 },
    );

    expect(saved.map((record) => record.repoName)).toEqual([
      "owner__repo",
      "no-separator",
    ]);
  });

  it("falls back to request.engineName and omits engine when neither side carries one", async () => {
    const { store, saved } = createCapturingRunStore();
    const result: RunReviewResult = {
      state: "timeout",
      failure: { stage: "engine", error: new Error("timed out") },
      cleanup: { attempted: false },
    };

    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 0,
        request: createRunRequest({ engineName: "opencode" }),
        result,
      },
      { store, now: () => 0 },
    );
    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 0,
        request: createRunRequest(),
        result,
      },
      { store, now: () => 0 },
    );

    expect(saved[0]?.engine).toBe("opencode");
    expect(saved[1]?.engine).toBeUndefined();
    expect(saved[1] && "engine" in saved[1]).toBe(false);
  });

  it("never reports a negative duration when the clock moves backwards", async () => {
    const { store, saved } = createCapturingRunStore();

    await persistRun(
      {
        repoName: "owner/repo",
        startedAtEpochMs: 5_000,
        request: createRunRequest(),
        result: {
          state: "ok",
          verdict: "approve",
          cleanup: { attempted: false },
        },
      },
      { store, now: () => 4_000 },
    );

    expect(expectSingleRecord(saved).durationMs).toBe(0);
  });

  it("propagates a rejection from store.save unchanged", async () => {
    const failure = new Error("disk full");
    const store: RunStore = {
      save(_record: RunRecord): Promise<string> {
        return Promise.reject(failure);
      },
      list(_repoName: string): Promise<readonly RunSummary[]> {
        throw new Error("not used by persistRun");
      },
      get(_repoName: string, _id: string): Promise<RunRecord> {
        throw new Error("not used by persistRun");
      },
    };

    await expect(
      persistRun(
        {
          repoName: "owner/repo",
          startedAtEpochMs: 0,
          request: createRunRequest(),
          result: {
            state: "ok",
            verdict: "approve",
            cleanup: { attempted: false },
          },
        },
        { store },
      ),
    ).rejects.toBe(failure);
  });
});
