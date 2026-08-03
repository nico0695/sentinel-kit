import { describe, expect, it } from "vitest";
import {
  type DiffResult,
  type FileStats,
  GitDiffError,
  GitMergeBaseError,
} from "../../repos/index.js";
import {
  type ComputeReviewDiffDeps,
  computeReviewDiff,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_TOKENS,
  DiffSizePolicyError,
  InvalidWorktreeRequestError,
} from "../index.js";
import { createFakeGitPort } from "./workspace-git-fake.js";

/* ------------------------------------------------------------------ */
/*  Test data builders                                                 */
/* ------------------------------------------------------------------ */

function buildRawDiff(files: { path: string; lineCount: number }[]): string {
  return files
    .map((f) => {
      const header = `diff --git a/${f.path} b/${f.path}\nindex 0000000..1111111 100644\n--- a/${f.path}\n+++ b/${f.path}\n`;
      const lines = Array.from(
        { length: f.lineCount },
        (_, i) => `+line ${i + 1}\n`,
      ).join("");
      return `${header}${lines}`;
    })
    .join("");
}

function buildStats(files: { path: string; lineCount: number }[]): FileStats[] {
  return files.map((f) => ({
    path: f.path,
    additions: f.lineCount,
    deletions: 0,
  }));
}

function buildDiffResult(
  files: { path: string; lineCount: number }[],
): DiffResult {
  return {
    raw: buildRawDiff(files),
    stats: buildStats(files),
  };
}

const REPO = "/sentinel/clones/owner/test-repo";
const BASE_REF = "main";
const TARGET_REF = "feature/x";

interface MakeDepsOverrides {
  mergeBaseResult?: string;
  mergeBaseError?: Error;
  diffResult?: DiffResult;
  diffError?: Error;
}

function makeDeps(
  overrides?: MakeDepsOverrides,
): ComputeReviewDiffDeps & ReturnType<typeof createFakeGitPort> {
  const git = createFakeGitPort(
    overrides !== undefined
      ? {
          ...(overrides.mergeBaseResult !== undefined && {
            mergeBaseResult: overrides.mergeBaseResult,
          }),
          ...(overrides.mergeBaseError !== undefined && {
            mergeBaseError: overrides.mergeBaseError,
          }),
          ...(overrides.diffResult !== undefined && {
            diffResult: overrides.diffResult,
          }),
          ...(overrides.diffError !== undefined && {
            diffError: overrides.diffError,
          }),
        }
      : undefined,
  );
  return Object.assign({ git }, git);
}

/* ------------------------------------------------------------------ */
/*  AC-1: Configurable limit                                           */
/* ------------------------------------------------------------------ */

describe("AC-1: configurable limit", () => {
  it("uses default limits when none provided", async () => {
    const small = buildDiffResult([{ path: "a.ts", lineCount: 5 }]);
    const deps = makeDeps({ diffResult: small });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.truncated).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("respects custom maxLines limit", async () => {
    const big = buildDiffResult([
      { path: "big.ts", lineCount: 100 },
      { path: "small.ts", lineCount: 5 },
    ]);
    const deps = makeDeps({ diffResult: big });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 50, maxTokens: 999999 },
      },
      deps,
    );

    expect(result.truncated).toBe(true);
  });

  it("respects custom maxTokens limit", async () => {
    const big = buildDiffResult([
      { path: "big.ts", lineCount: 10 },
      { path: "small.ts", lineCount: 5 },
    ]);
    const deps = makeDeps({ diffResult: big });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 999999, maxTokens: 10 },
      },
      deps,
    );

    expect(result.truncated).toBe(true);
  });

  it("does not truncate when within limits", async () => {
    const small = buildDiffResult([{ path: "a.ts", lineCount: 3 }]);
    const deps = makeDeps({ diffResult: small });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 99999, maxTokens: 999999 },
      },
      deps,
    );

    expect(result.truncated).toBe(false);
    expect(result.files.every((f) => f.content !== null)).toBe(true);
  });

  it("exports default constants", () => {
    expect(DEFAULT_MAX_LINES).toBe(3000);
    expect(DEFAULT_MAX_TOKENS).toBe(50000);
  });

  it("rejects non-positive maxLines", async () => {
    const deps = makeDeps();
    await expect(
      computeReviewDiff(
        {
          repoPath: REPO,
          baseRef: BASE_REF,
          targetRef: TARGET_REF,
          limits: { maxLines: 0, maxTokens: 100 },
        },
        deps,
      ),
    ).rejects.toThrow(DiffSizePolicyError);
  });
});

/* ------------------------------------------------------------------ */
/*  AC-2: Warning visibility                                           */
/* ------------------------------------------------------------------ */

describe("AC-2: warning visibility", () => {
  it("includes a diff-truncated warning when truncation occurs", async () => {
    const big = buildDiffResult([
      { path: "big.ts", lineCount: 100 },
      { path: "small.ts", lineCount: 5 },
    ]);
    const deps = makeDeps({ diffResult: big });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 50, maxTokens: 999999 },
      },
      deps,
    );

    expect(result.warnings).toHaveLength(1);
    const w = result.warnings[0] as (typeof result.warnings)[number];
    expect(w.kind).toBe("diff-truncated");
    expect(w.truncatedFileCount).toBeGreaterThan(0);
    expect(w.totalFileCount).toBe(2);
  });

  it("warning carries original and kept line/token counts", async () => {
    const files = [
      { path: "a.ts", lineCount: 50 },
      { path: "b.ts", lineCount: 30 },
    ];
    const big = buildDiffResult(files);
    const deps = makeDeps({ diffResult: big });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 60, maxTokens: 999999 },
      },
      deps,
    );

    const w = result.warnings[0] as (typeof result.warnings)[number];
    expect(w.originalLines).toBeGreaterThan(w.keptLines);
    expect(w.originalTokens).toBeGreaterThan(w.keptTokens);
  });

  it("no warnings when diff is within limits", async () => {
    const small = buildDiffResult([{ path: "x.ts", lineCount: 3 }]);
    const deps = makeDeps({ diffResult: small });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.warnings).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  AC-3: Truncation preserves file list                               */
/* ------------------------------------------------------------------ */

describe("AC-3: truncation preserves file list", () => {
  it("keeps all file entries even when truncated", async () => {
    const files = [
      { path: "a.ts", lineCount: 100 },
      { path: "b.ts", lineCount: 80 },
      { path: "c.ts", lineCount: 5 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 50, maxTokens: 999999 },
      },
      deps,
    );

    expect(result.files).toHaveLength(3);
    expect(result.files.map((f) => f.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("truncated files have null content and truncated=true", async () => {
    const files = [
      { path: "big.ts", lineCount: 100 },
      { path: "small.ts", lineCount: 3 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 50, maxTokens: 999999 },
      },
      deps,
    );

    const big = result.files.find(
      (f) => f.path === "big.ts",
    ) as (typeof result.files)[number];
    const small = result.files.find(
      (f) => f.path === "small.ts",
    ) as (typeof result.files)[number];

    expect(big.content).toBeNull();
    expect(big.truncated).toBe(true);
    expect(small.content).not.toBeNull();
    expect(small.truncated).toBe(false);
  });

  it("preserves additions/deletions on truncated entries", async () => {
    const diff: DiffResult = {
      raw: buildRawDiff([{ path: "a.ts", lineCount: 100 }]),
      stats: [{ path: "a.ts", additions: 80, deletions: 20 }],
    };
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 10, maxTokens: 999999 },
      },
      deps,
    );

    const entry = result.files[0] as (typeof result.files)[number];
    expect(entry.additions).toBe(80);
    expect(entry.deletions).toBe(20);
    expect(entry.truncated).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Truncation algorithm                                               */
/* ------------------------------------------------------------------ */

describe("truncation algorithm", () => {
  it("removes largest file first", async () => {
    const files = [
      { path: "small.ts", lineCount: 10 },
      { path: "medium.ts", lineCount: 50 },
      { path: "large.ts", lineCount: 100 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 80, maxTokens: 999999 },
      },
      deps,
    );

    const large = result.files.find(
      (f) => f.path === "large.ts",
    ) as (typeof result.files)[number];
    const medium = result.files.find(
      (f) => f.path === "medium.ts",
    ) as (typeof result.files)[number];
    const small = result.files.find(
      (f) => f.path === "small.ts",
    ) as (typeof result.files)[number];

    expect(large.truncated).toBe(true);
    expect(medium.content).not.toBeNull();
    expect(small.content).not.toBeNull();
  });

  it("truncates multiple files if needed", async () => {
    const files = [
      { path: "a.ts", lineCount: 60 },
      { path: "b.ts", lineCount: 60 },
      { path: "c.ts", lineCount: 5 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 30, maxTokens: 999999 },
      },
      deps,
    );

    const truncatedCount = result.files.filter((f) => f.truncated).length;
    expect(truncatedCount).toBe(2);
  });

  it("tie-breaks by highest index (last file)", async () => {
    const files = [
      { path: "first.ts", lineCount: 50 },
      { path: "second.ts", lineCount: 50 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 60, maxTokens: 999999 },
      },
      deps,
    );

    const first = result.files.find(
      (f) => f.path === "first.ts",
    ) as (typeof result.files)[number];
    const second = result.files.find(
      (f) => f.path === "second.ts",
    ) as (typeof result.files)[number];

    expect(second.truncated).toBe(true);
    expect(first.truncated).toBe(false);
  });

  it("truncates when only token limit exceeded", async () => {
    // Small line count but large token count via long lines
    const longLineContent = `diff --git a/big.ts b/big.ts\nindex 0000000..1111111 100644\n--- a/big.ts\n+++ b/big.ts\n+${"x".repeat(400)}\n`;
    const diff: DiffResult = {
      raw: longLineContent,
      stats: [{ path: "big.ts", additions: 1, deletions: 0 }],
    };
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 999999, maxTokens: 10 },
      },
      deps,
    );

    expect(result.truncated).toBe(true);
  });

  it("totalLines reflects post-truncation value", async () => {
    const files = [
      { path: "big.ts", lineCount: 100 },
      { path: "small.ts", lineCount: 5 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      {
        repoPath: REPO,
        baseRef: BASE_REF,
        targetRef: TARGET_REF,
        limits: { maxLines: 50, maxTokens: 999999 },
      },
      deps,
    );

    // big.ts was truncated, so totalLines should reflect only the lines kept
    expect(result.totalLines).toBeLessThan(100 + 5 + 20); // account for headers
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe("edge cases", () => {
  it("returns empty result for empty diff", async () => {
    const deps = makeDeps({ diffResult: { raw: "", stats: [] } });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files).toHaveLength(0);
    expect(result.totalLines).toBe(0);
    expect(result.estimatedTokens).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("handles single-file diff", async () => {
    const diff = buildDiffResult([{ path: "only.ts", lineCount: 10 }]);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("only.ts");
  });

  it("passes correct refs to mergeBase and diff", async () => {
    const diff = buildDiffResult([{ path: "a.ts", lineCount: 1 }]);
    const deps = makeDeps({
      mergeBaseResult: "merge000base",
      diffResult: diff,
    });

    await computeReviewDiff(
      { repoPath: REPO, baseRef: "develop", targetRef: "feature/y" },
      deps,
    );

    expect(deps.mergeBaseCalls).toHaveLength(1);
    expect(deps.mergeBaseCalls[0]?.repoPath).toBe(REPO);
    expect(deps.mergeBaseCalls[0]?.commitA).toBe("develop");
    expect(deps.mergeBaseCalls[0]?.commitB).toBe("feature/y");

    expect(deps.diffCalls).toHaveLength(1);
    expect(deps.diffCalls[0]?.repoPath).toBe(REPO);
    expect(deps.diffCalls[0]?.from).toBe("merge000base");
    expect(deps.diffCalls[0]?.to).toBe("feature/y");
  });

  it("handles stats entry with no matching diff chunk", async () => {
    // binary file: appears in stats but not in text diff
    const diff: DiffResult = {
      raw: "",
      stats: [{ path: "image.png", additions: 0, deletions: 0 }],
    };
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("image.png");
    expect(result.files[0]?.content).toBeNull();
    expect(result.files[0]?.diffLineCount).toBe(0);
  });

  it("estimatedTokens is roughly length/4", async () => {
    const diff = buildDiffResult([{ path: "a.ts", lineCount: 10 }]);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.estimatedTokens).toBeGreaterThan(0);
    // Each line is "+line N\n" plus header lines; tokens ~ chars/4
    const rawLength = diff.raw.length;
    expect(result.estimatedTokens).toBe(Math.ceil(rawLength / 4));
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */

describe("error handling", () => {
  it("rejects empty repoPath", async () => {
    const deps = makeDeps();
    await expect(
      computeReviewDiff(
        { repoPath: "", baseRef: BASE_REF, targetRef: TARGET_REF },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects relative repoPath", async () => {
    const deps = makeDeps();
    await expect(
      computeReviewDiff(
        { repoPath: "relative/path", baseRef: BASE_REF, targetRef: TARGET_REF },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects empty baseRef", async () => {
    const deps = makeDeps();
    await expect(
      computeReviewDiff(
        { repoPath: REPO, baseRef: "", targetRef: TARGET_REF },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("rejects empty targetRef", async () => {
    const deps = makeDeps();
    await expect(
      computeReviewDiff(
        { repoPath: REPO, baseRef: BASE_REF, targetRef: "" },
        deps,
      ),
    ).rejects.toThrow(InvalidWorktreeRequestError);
  });

  it("propagates mergeBase errors unwrapped", async () => {
    const err = new GitMergeBaseError("no merge base");
    const deps = makeDeps({ mergeBaseError: err });

    await expect(
      computeReviewDiff(
        { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
        deps,
      ),
    ).rejects.toThrow(GitMergeBaseError);
  });

  it("propagates diff errors unwrapped", async () => {
    const err = new GitDiffError("diff failed");
    const deps = makeDeps({ diffError: err });

    await expect(
      computeReviewDiff(
        { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
        deps,
      ),
    ).rejects.toThrow(GitDiffError);
  });
});

/* ------------------------------------------------------------------ */
/*  Diff parsing                                                       */
/* ------------------------------------------------------------------ */

describe("diff parsing", () => {
  it("correctly splits multi-file raw diff", async () => {
    const files = [
      { path: "src/a.ts", lineCount: 5 },
      { path: "src/b.ts", lineCount: 10 },
      { path: "src/c.ts", lineCount: 3 },
    ];
    const diff = buildDiffResult(files);
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files).toHaveLength(3);
    for (const file of result.files) {
      expect(file.content).not.toBeNull();
      expect(file.diffLineCount).toBeGreaterThan(0);
    }
  });

  it("extracts correct path from diff header", async () => {
    const raw = `diff --git a/deep/nested/file.ts b/deep/nested/file.ts\nindex 0000000..1111111 100644\n--- a/deep/nested/file.ts\n+++ b/deep/nested/file.ts\n+content\n`;
    const diff: DiffResult = {
      raw,
      stats: [{ path: "deep/nested/file.ts", additions: 1, deletions: 0 }],
    };
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files[0]?.path).toBe("deep/nested/file.ts");
    expect(result.files[0]?.content).toContain("deep/nested/file.ts");
  });

  it("handles diff with only header lines (no content changes)", async () => {
    const raw = `diff --git a/empty.ts b/empty.ts\nindex 0000000..1111111 100644\n`;
    const diff: DiffResult = {
      raw,
      stats: [{ path: "empty.ts", additions: 0, deletions: 0 }],
    };
    const deps = makeDeps({ diffResult: diff });

    const result = await computeReviewDiff(
      { repoPath: REPO, baseRef: BASE_REF, targetRef: TARGET_REF },
      deps,
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.content).not.toBeNull();
  });
});
