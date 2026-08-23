/**
 * Core module: history — zod schema for the PERSISTED `metadata.json`
 * document (`[E5.F2.H2]` D6).
 *
 * NOT `RunRecord`'s shape: `serializeRunMetadata` ([E5.F2.H1]) writes a
 * distinct document — `version`, `repo` (not `repoName`), an ISO `startedAt`
 * string (not `startedAtEpochMs`) — and this schema validates exactly that
 * document as read back off disk. Disk data is untrusted, so runtime
 * validation here is not optional the way it was for `RunRecordPathFieldsSchema`
 * (which only validated the two path-sensitive input fields).
 *
 * The `state`/`verdict`/`failure.stage` literal lists duplicate `run`'s
 * unions — the exact drift hazard `run-store-schemas.ts`'s comment warns
 * about — but `[E5.F2.H2]`'s AC-15 forbids moving those unions into
 * `src/core/run` (this module owns them, `run` doesn't need zod). The
 * `satisfies`/`Expect<Exclude<...>>` pair below is a compile-time guard: a
 * rogue literal fails `satisfies` immediately, and a union member missing
 * from the list fails typecheck as soon as `run`'s union grows one. This
 * file imports only `zod` and `run`'s public barrel (core I/O whitelist).
 */
import { z } from "zod";
import type { RunStage, TerminalState, Verdict } from "../../run/index.js";

const TERMINAL_STATES = [
  "ok",
  "ambiguous",
  "engine-error",
  "timeout",
  "validation-failed",
] as const satisfies readonly TerminalState[];

const VERDICTS = [
  "approve",
  "request-changes",
  "comment",
] as const satisfies readonly Verdict[];

const RUN_STAGES = [
  "request",
  "harness",
  "worktree",
  "diff",
  "validations", // [E5.F1.H2] #32: declared-validation execution, between diff and prompt
  "prompt",
  "engine",
  "parse",
] as const satisfies readonly RunStage[];

/** Never instantiated — a type-only exhaustiveness check. */
type Expect<T extends never> = T;
type _AllTerminalStatesCovered = Expect<
  Exclude<TerminalState, (typeof TERMINAL_STATES)[number]>
>;
type _AllVerdictsCovered = Expect<Exclude<Verdict, (typeof VERDICTS)[number]>>;
type _AllRunStagesCovered = Expect<
  Exclude<RunStage, (typeof RUN_STAGES)[number]>
>;

const RunDiffSummarySchema = z.object({
  fileCount: z.number(),
  totalLines: z.number(),
  estimatedTokens: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()).optional(),
});

const ReviewUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

const RunFailureRecordSchema = z.object({
  stage: z.enum(RUN_STAGES),
  message: z.string(),
});

/**
 * Unknown keys are stripped, not rejected: an additive field a future
 * `version: 1` writer adds stays readable, and only a breaking format
 * change needs to bump `version` — which this schema's `z.literal(1)`
 * then correctly classifies as `corrupt` (D1/D6).
 */
export const RunMetadataSchema = z.object({
  version: z.literal(1),
  repo: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
  engine: z.string().optional(),
  harness: z.string(),
  baseRef: z.string(),
  targetRef: z.string(),
  state: z.enum(TERMINAL_STATES),
  verdict: z.enum(VERDICTS).optional(),
  diff: RunDiffSummarySchema.optional(),
  usage: ReviewUsageSchema.optional(),
  failure: RunFailureRecordSchema.optional(),
});

export type RunMetadata = z.infer<typeof RunMetadataSchema>;
