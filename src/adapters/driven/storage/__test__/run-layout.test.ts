/**
 * `run-layout.ts` pure-function suite (AC-4, AC-9, AC-10, AC-14's timestamp
 * half, AC-18). No fs, no temp directory — every function under test is
 * deterministic and side-effect free.
 */
import { describe, expect, it } from "vitest";
import type { RunRecord } from "../../../../core/history/index.js";
import {
  classifyRunDirEntry,
  deriveRunPaths,
  formatRunTimestamp,
  parseRunTimestamp,
  serializeRunMetadata,
} from "../run-layout.js";

function baseRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    repoName: "sentinel-kit",
    startedAtEpochMs: 1787404200123,
    durationMs: 42137,
    harness: "pr-review",
    baseRef: "main",
    targetRef: "feature/x",
    state: "ok",
    ...overrides,
  };
}

describe("formatRunTimestamp (AC-14 determinism, AC-9 sortability)", () => {
  it("renders a known epoch as compact ISO-8601 UTC with no separators", () => {
    expect(formatRunTimestamp(1787404200123)).toBe("20260822T131000123Z");
  });

  it("is a pure function: the same epoch always yields the same string", () => {
    const epoch = 1700000000000;
    expect(formatRunTimestamp(epoch)).toBe(formatRunTimestamp(epoch));
  });

  it("sorts lexicographically in chronological order across a millisecond, a day, a month and a year boundary", () => {
    const t0 = formatRunTimestamp(Date.parse("2026-08-22T13:10:00.123Z"));
    const t1 = formatRunTimestamp(Date.parse("2026-08-22T13:10:00.124Z"));
    const t2 = formatRunTimestamp(Date.parse("2026-08-23T00:00:00.000Z"));
    const t3 = formatRunTimestamp(Date.parse("2026-09-01T00:00:00.000Z"));
    const t4 = formatRunTimestamp(Date.parse("2027-01-01T00:00:00.000Z"));
    const ordered = [t0, t1, t2, t3, t4];
    expect(ordered).toEqual([...ordered].sort());
  });
});

describe("deriveRunPaths (AC-11, AC-12)", () => {
  it("derives repoDir, finalDir and stagingDir as siblings under the same repoDir", () => {
    const paths = deriveRunPaths(
      "/runs",
      "sentinel-kit",
      "20260822T131000123Z",
    );
    expect(paths.repoDir).toBe("/runs/sentinel-kit");
    expect(paths.finalDir).toBe("/runs/sentinel-kit/20260822T131000123Z");
    expect(paths.stagingDir).toBe(
      "/runs/sentinel-kit/.partial-20260822T131000123Z",
    );
  });

  it("names the staging directory deterministically from the same ts, so a retry targets the same path", () => {
    const first = deriveRunPaths(
      "/runs",
      "sentinel-kit",
      "20260822T131000123Z",
    );
    const second = deriveRunPaths(
      "/runs",
      "sentinel-kit",
      "20260822T131000123Z",
    );
    expect(first.stagingDir).toBe(second.stagingDir);
  });
});

describe("serializeRunMetadata (AC-4, AC-10, AC-18)", () => {
  it("emits exactly the declared field set with no data, and nothing more", () => {
    const parsed = JSON.parse(serializeRunMetadata(baseRecord()));
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "baseRef",
        "durationMs",
        "harness",
        "repo",
        "startedAt",
        "state",
        "targetRef",
        "version",
      ].sort(),
    );
    expect(parsed.version).toBe(1);
    expect(parsed.repo).toBe("sentinel-kit");
    expect(parsed.startedAt).toBe("2026-08-22T13:10:00.123Z");
    expect(parsed.durationMs).toBe(42137);
    expect(parsed.harness).toBe("pr-review");
    expect(parsed.baseRef).toBe("main");
    expect(parsed.targetRef).toBe("feature/x");
    expect(parsed.state).toBe("ok");
  });

  it("omits engine/verdict/diff/usage/failure as absent keys, never as null, when not supplied", () => {
    const parsed = JSON.parse(serializeRunMetadata(baseRecord()));
    for (const key of ["engine", "verdict", "diff", "usage", "failure"]) {
      expect(key in parsed).toBe(false);
    }
  });

  it("includes each optional field verbatim when supplied", () => {
    const record = baseRecord({
      engine: "claude-code",
      verdict: "approve",
      usage: { inputTokens: 4800, outputTokens: 900, totalTokens: 5700 },
      failure: { stage: "engine", message: "Engine exited with code 1" },
    });
    const parsed = JSON.parse(serializeRunMetadata(record));
    expect(parsed.engine).toBe("claude-code");
    expect(parsed.verdict).toBe("approve");
    expect(parsed.usage).toEqual({
      inputTokens: 4800,
      outputTokens: 900,
      totalTokens: 5700,
    });
    expect(parsed.failure).toEqual({
      stage: "engine",
      message: "Engine exited with code 1",
    });
  });

  it("persists diff as the summary shape only — fileCount/totalLines/estimatedTokens/truncated/warnings — never diff bodies (AC-10)", () => {
    const record = baseRecord({
      diff: {
        fileCount: 3,
        totalLines: 412,
        estimatedTokens: 5100,
        truncated: true,
        warnings: ["diff truncated: kept 400 of 900 lines across 2 of 3 files"],
      },
    });
    const serialized = serializeRunMetadata(record);
    const parsed = JSON.parse(serialized);
    expect(parsed.diff).toEqual({
      fileCount: 3,
      totalLines: 412,
      estimatedTokens: 5100,
      truncated: true,
      warnings: ["diff truncated: kept 400 of 900 lines across 2 of 3 files"],
    });
    // The serializer's input type is RunDiffSummary, not ReviewDiff — there is
    // no `files` array to accidentally include, so this is also a structural
    // proof, not just a content check: a per-file "content" field cannot
    // appear because the type given to serializeRunMetadata has no such field.
    expect(Object.keys(parsed.diff).sort()).toEqual(
      [
        "estimatedTokens",
        "fileCount",
        "totalLines",
        "truncated",
        "warnings",
      ].sort(),
    );
  });

  it("omits diff.warnings when the array is empty, rather than emitting an empty array", () => {
    const record = baseRecord({
      diff: {
        fileCount: 1,
        totalLines: 10,
        estimatedTokens: 100,
        truncated: false,
        warnings: [],
      },
    });
    const parsed = JSON.parse(serializeRunMetadata(record));
    expect("warnings" in parsed.diff).toBe(false);
  });

  it("plants a decoy token in every field whose contract is NOT to be written into metadata.json, and asserts it never appears in the output (AC-18)", () => {
    const decoy = "DECOY-SECRET-TOKEN-DO-NOT-PERSIST";
    const record = baseRecord({
      prompt: `prompt containing ${decoy}`,
      engineOutput: `engine output containing ${decoy}`,
      validationOutput: [`validation log containing ${decoy}`],
    });
    const serialized = serializeRunMetadata(record);
    expect(serialized).not.toContain(decoy);
  });

  it("does NOT plant the decoy in failure.message: that field's contract is to be written INTO metadata.json, so a decoy there would be a false positive for AC-18, not evidence of a leak", () => {
    const decoy = "DECOY-SECRET-TOKEN-DO-NOT-PERSIST";
    const record = baseRecord({
      failure: { stage: "engine", message: `failed near ${decoy}` },
    });
    const parsed = JSON.parse(serializeRunMetadata(record));
    // The decoy appearing here is correct — failure.message is metadata's
    // own carrier field. Sanitizing its content is the caller's duty (D4),
    // not this serializer's.
    expect(parsed.failure.message).toContain(decoy);
  });

  it("returns a JSON string ending in a single trailing newline", () => {
    const serialized = serializeRunMetadata(baseRecord());
    expect(serialized.endsWith("}\n")).toBe(true);
    expect(serialized.endsWith("}\n\n")).toBe(false);
  });

  it("is round-trippable: JSON.parse(serializeRunMetadata(record)) never throws", () => {
    expect(() => JSON.parse(serializeRunMetadata(baseRecord()))).not.toThrow();
  });
});

describe("parseRunTimestamp (AC-2, inverse of formatRunTimestamp)", () => {
  it("round-trips exactly against formatRunTimestamp for a known epoch", () => {
    const epoch = 1787404200123;
    expect(parseRunTimestamp(formatRunTimestamp(epoch))).toBe(epoch);
  });

  it("round-trips for epochs spanning a day, a month and a year boundary", () => {
    const epochs = [
      Date.parse("2026-08-22T13:10:00.123Z"),
      Date.parse("2026-08-23T00:00:00.000Z"),
      Date.parse("2026-09-01T00:00:00.000Z"),
      Date.parse("2027-01-01T00:00:00.000Z"),
    ];
    for (const epoch of epochs) {
      expect(parseRunTimestamp(formatRunTimestamp(epoch))).toBe(epoch);
    }
  });

  it("returns null for a malformed or non-ts name, rather than throwing", () => {
    for (const name of [
      "",
      "not-a-timestamp",
      "20260822T131000123",
      "20260822T131000123Y",
      "2026-08-22T13:10:00.123Z",
      ".partial-20260822T131000123Z",
    ]) {
      expect(parseRunTimestamp(name)).toBeNull();
    }
  });
});

describe("classifyRunDirEntry (AC-5, AC-12, D9's three-way rule)", () => {
  it("classifies a ts-named directory as final, with the name itself as id", () => {
    const result = classifyRunDirEntry("20260822T131000123Z", true);
    expect(result).toEqual({
      kind: "final",
      id: "20260822T131000123Z",
      epochMs: 1787404200123,
    });
  });

  it("classifies a .partial-<ts> directory as partial, with the prefix stripped from id", () => {
    const result = classifyRunDirEntry(".partial-20260822T131000123Z", true);
    expect(result).toEqual({
      kind: "partial",
      id: "20260822T131000123Z",
      epochMs: 1787404200123,
    });
  });

  it("classifies a non-directory entry as other, even with a ts-shaped name", () => {
    expect(classifyRunDirEntry("20260822T131000123Z", false)).toEqual({
      kind: "other",
    });
  });

  it("classifies a stray file/dir with an unrecognized name as other", () => {
    for (const name of [".DS_Store", "notes.txt", "some-other-dir", ".git"]) {
      expect(classifyRunDirEntry(name, true)).toEqual({ kind: "other" });
    }
  });

  it("classifies a .partial- directory with a malformed suffix as other, not partial", () => {
    expect(classifyRunDirEntry(".partial-not-a-timestamp", true)).toEqual({
      kind: "other",
    });
  });
});
