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

const TS_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/;
const PARTIAL_PREFIX = ".partial-";

/**
 * Inverse of `formatRunTimestamp`. Returns `null` for anything not shaped
 * like a run directory name, rather than throwing — every caller treats a
 * non-ts directory entry as data to classify, not an error (`[E5.F2.H2]`
 * D9). Round-trip exactness with `formatRunTimestamp` verified with node
 * during spec revision 2.
 */
export function parseRunTimestamp(name: string): number | null {
  const m = TS_PATTERN.exec(name);
  if (m === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second, ms] = m;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
  const epochMs = Date.parse(iso);
  return Number.isNaN(epochMs) ? null : epochMs;
}

/** One `readdir` entry, classified per `[E5.F2.H2]` D9's three-way rule. */
export type RunDirEntryKind =
  | { readonly kind: "final"; readonly id: string; readonly epochMs: number }
  | { readonly kind: "partial"; readonly id: string; readonly epochMs: number }
  | { readonly kind: "other" };

/**
 * `id` is always the directory's ts (never the `.partial-` prefix) — D5's
 * addressing contract, so a `list()` caller can pass a `partial` entry's
 * `id` straight to `get()`. Not a directory at all is `"other"`, same as an
 * unrecognized name — this function receives only the entry's name and
 * whether it's a directory, so a stray file with a ts-shaped name still
 * classifies as `"other"` when `isDirectory` is false.
 */
export function classifyRunDirEntry(
  name: string,
  isDirectory: boolean,
): RunDirEntryKind {
  if (!isDirectory) {
    return { kind: "other" };
  }
  if (name.startsWith(PARTIAL_PREFIX)) {
    const id = name.slice(PARTIAL_PREFIX.length);
    const epochMs = parseRunTimestamp(id);
    return epochMs === null
      ? { kind: "other" }
      : { kind: "partial", id, epochMs };
  }
  const epochMs = parseRunTimestamp(name);
  return epochMs === null
    ? { kind: "other" }
    : { kind: "final", id: name, epochMs };
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
