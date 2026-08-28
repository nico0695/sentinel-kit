/**
 * Driving adapter: cli — run-history rendering (`[E6.F1.H1]`, #36; AC-10).
 *
 * Two guarantees hold across every function here:
 *
 * 1. **The repository alias echoed back is the one the caller typed**, never
 *    `RunSummary.repoName` / `RunRecord.repoName`. D7 normalises the alias to
 *    a storage key (`owner/repo` → `owner__repo`) on the way *into* the store
 *    and does not denormalise on the way out, so the objects the store
 *    returns carry the storage key in their own `repoName` field. Printing it
 *    would show `owner__repo` to a user who typed `owner/repo`
 *    (`risk-e6h1-009`). Every function below therefore takes the requested
 *    alias as its first parameter and ignores the stored field.
 * 2. **Absent fields are never fabricated.** A `partial`/`corrupt` entry has
 *    no trustworthy `metadata.json` (`[E5.F2.H2]` D2), so every field below
 *    `status` is optional; it renders as the literal `-` marker, which is a
 *    statement of absence rather than a plausible-looking value.
 */

import type { RunRecord, RunSummary } from "../../../../core/history/index.js";

/** Rendered in place of a field the store could not supply. */
const ABSENT = "-";

/**
 * Renders one scalar field. Tabs and newlines are collapsed to single spaces
 * because they are the record and field separators: a failure message
 * carrying a newline would otherwise split one record across two lines and
 * break the "one record per line" guarantee (AC-10).
 */
function field(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return ABSENT;
  }

  const rendered = String(value)
    .replace(/[\t\r\n]+/g, " ")
    .trim();

  return rendered === "" ? ABSENT : rendered;
}

/**
 * Field order of a `runs list` record. Exported so the tests assert the
 * contract rather than a hand-copied string.
 */
export const RUN_SUMMARY_FIELDS = [
  "repo",
  "id",
  "startedAtEpochMs",
  "status",
  "state",
  "verdict",
  "harness",
  "engine",
  "baseRef",
  "targetRef",
  "durationMs",
] as const;

/**
 * One `runs list` record, tab-separated in {@link RUN_SUMMARY_FIELDS} order.
 *
 * `repoAlias` is the alias the caller passed to `runs list`; `summary.repoName`
 * is deliberately unused (see this module's note 1).
 */
export function formatRunSummaryLine(
  repoAlias: string,
  summary: RunSummary,
): string {
  const values = [
    field(repoAlias),
    field(summary.id),
    field(summary.startedAtEpochMs),
    field(summary.status),
    field(summary.state),
    field(summary.verdict),
    field(summary.harness),
    field(summary.engine),
    field(summary.baseRef),
    field(summary.targetRef),
    field(summary.durationMs),
  ];

  // Indexed by the exported constant, so the declared order IS the rendered
  // order and the two cannot drift apart (`R2-002`) — the same pattern
  // `formatRunRecordBlock` below and `format-review.ts` already use.
  return RUN_SUMMARY_FIELDS.map((_key, index) => values[index] ?? ABSENT).join(
    "\t",
  );
}

/**
 * Scalar `key<TAB>value` lines of a `runs show` block, in fixed order. A
 * consumer reads exactly this many lines and finds the count-prefixed
 * sections after them.
 */
export const RUN_RECORD_FIELDS = [
  "repo",
  "id",
  "startedAtEpochMs",
  "durationMs",
  "state",
  "verdict",
  "harness",
  "engine",
  "baseRef",
  "targetRef",
  "diffFileCount",
  "diffTotalLines",
  "diffEstimatedTokens",
  "diffTruncated",
  "usageInputTokens",
  "usageOutputTokens",
  "usageTotalTokens",
  "promptLineCount",
  "failureStage",
  "failureMessage",
] as const;

function countLines(value: string | undefined): number | undefined {
  return value === undefined ? undefined : value.split("\n").length;
}

/**
 * A count-prefixed section: one `key<TAB>count` line followed by exactly
 * `count` raw lines. Multi-line values (the engine's review output, a
 * validation transcript) cannot be squeezed onto one tab-separated line, and
 * a decorative banner would violate AC-10; a declared line count keeps the
 * block parseable without inventing separators.
 */
function section(key: string, lines: readonly string[]): string[] {
  return [`${key}\t${lines.length}`, ...lines];
}

/**
 * The `runs show` block: the scalar field lines in {@link RUN_RECORD_FIELDS}
 * order, then the `diffWarnings`, `validationOutput` and `engineOutput`
 * sections.
 *
 * `RunRecord` carries neither the run id nor a user-facing alias (its
 * `repoName` is the storage key), so both are echoed from the request the
 * caller made.
 *
 * The `prompt` is reported as a line count rather than printed: it embeds the
 * full diff sent to the engine, and dumping it into `runs show` by default
 * would bury the review it exists to display. The stored `prompt.md` remains
 * the place to read it.
 */
export function formatRunRecordBlock(
  repoAlias: string,
  id: string,
  record: RunRecord,
): readonly string[] {
  const scalars: Array<string | number | boolean | undefined> = [
    repoAlias,
    id,
    record.startedAtEpochMs,
    record.durationMs,
    record.state,
    record.verdict,
    record.harness,
    record.engine,
    record.baseRef,
    record.targetRef,
    record.diff?.fileCount,
    record.diff?.totalLines,
    record.diff?.estimatedTokens,
    record.diff?.truncated,
    record.usage?.inputTokens,
    record.usage?.outputTokens,
    record.usage?.totalTokens,
    countLines(record.prompt),
    record.failure?.stage,
    record.failure?.message,
  ];

  const lines = RUN_RECORD_FIELDS.map(
    (key, index) => `${key}\t${field(scalars[index])}`,
  );

  return [
    ...lines,
    ...section("diffWarnings", record.diff?.warnings ?? []),
    ...section("validationOutput", record.validationOutput ?? []),
    ...section(
      "engineOutput",
      record.engineOutput === undefined ? [] : record.engineOutput.split("\n"),
    ),
  ];
}
