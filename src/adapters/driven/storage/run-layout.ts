/**
 * Driven adapter: storage — pure `RunStore` layout helpers.
 *
 * No fs, no `RunStore` import — every function here is a deterministic
 * string/object transform, directly unit-testable without a temp directory.
 * `serializeRunMetadata` is the single most consequential function in the
 * change: it is written as an explicit field-by-field construction, never
 * `{...record}` and never `JSON.stringify(record)`, because that is what
 * makes "exactly the declared field set" (AC-4), "no diff bodies" (AC-10)
 * and "no decoy leak" (AC-18) structurally true rather than merely
 * currently true — a field `RunRecord` grows later does not silently
 * start being persisted.
 */
import { join } from "node:path";
import type { RunRecord } from "../../../core/history/index.js";

/**
 * Compact ISO-8601 UTC with milliseconds, separators stripped — filesystem-
 * legal on Windows (no colons), human-readable, and lexicographically
 * sortable as chronological (verified: two timestamps a millisecond, a day,
 * a month and a year apart all sort in wall-clock order under plain string
 * comparison, since every field is fixed-width and big-endian).
 *
 * Pure function of `epochMs` — the adapter that calls this never reads the
 * system clock itself (D7), so the same record always maps to the same run
 * directory.
 */
export function formatRunTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().replaceAll(/[-:.]/g, "");
}

export interface RunPaths {
  readonly repoDir: string;
  readonly finalDir: string;
  readonly stagingDir: string;
}

/** `<runsRoot>/<repoName>/<ts>` and its `.partial-<ts>` staging sibling. */
export function deriveRunPaths(
  runsRoot: string,
  repoName: string,
  ts: string,
): RunPaths {
  const repoDir = join(runsRoot, repoName);
  return {
    repoDir,
    finalDir: join(repoDir, ts),
    stagingDir: join(repoDir, `.partial-${ts}`),
  };
}

/**
 * The exact `metadata.json` shape (spec.md's Expected Behavior table).
 * Optional record fields become omitted keys, never `null` — `undefined`
 * properties are dropped by `JSON.stringify`, which gives that for free
 * everywhere except `diff.warnings`, `usage` and `failure`, whose absence
 * is expressed by omitting the whole sub-object rather than emitting an
 * empty one.
 */
export function serializeRunMetadata(record: RunRecord): string {
  const metadata: Record<string, unknown> = {
    version: 1,
    repo: record.repoName,
    startedAt: new Date(record.startedAtEpochMs).toISOString(),
    durationMs: record.durationMs,
    engine: record.engine,
    harness: record.harness,
    baseRef: record.baseRef,
    targetRef: record.targetRef,
    state: record.state,
    verdict: record.verdict,
    diff:
      record.diff !== undefined
        ? {
            fileCount: record.diff.fileCount,
            totalLines: record.diff.totalLines,
            estimatedTokens: record.diff.estimatedTokens,
            truncated: record.diff.truncated,
            ...(record.diff.warnings.length > 0
              ? { warnings: record.diff.warnings }
              : {}),
          }
        : undefined,
    usage: record.usage,
    failure:
      record.failure !== undefined
        ? { stage: record.failure.stage, message: record.failure.message }
        : undefined,
  };
  return `${JSON.stringify(metadata, null, 2)}\n`;
}
