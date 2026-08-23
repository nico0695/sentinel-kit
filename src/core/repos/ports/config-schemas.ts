/**
 * Core module: repos — zod schemas for config.yaml and repos.yaml.
 *
 * Domain types are inferred via `z.infer` — no manual duplication (AC-3).
 * This file imports only `zod` (core I/O whitelist, guard 2).
 */
import { z } from "zod";

/**
 * Single source of truth for known engine names (PRD §3.1-D cascade). Reused
 * by both cascade levels modeled here and by `run/resolve-engine.ts`'s
 * per-run override validation — never redeclared as a second literal list.
 */
export const EngineNameSchema = z.enum(["claude-code", "opencode"]);

export type EngineName = z.infer<typeof EngineNameSchema>;

export const DiffLimitsSchema = z.object({
  maxLines: z.number(),
  maxTokens: z.number(),
});

export const GlobalConfigSchema = z.object({
  defaultEngine: EngineNameSchema.default("claude-code"),
  defaultBaseBranch: z.string().default("main"),
  diffLimits: DiffLimitsSchema.optional(),
  // Default wall-clock budget for the engine invocation of a review, in
  // milliseconds. Deliberately no `.default()` — the single fallback constant
  // (`DEFAULT_REVIEW_TIMEOUT_MS`) lives in `run`, so an absent field stays
  // absent after parsing and the effective value is decided in exactly one
  // place: `resolveReviewRequest`'s `--timeout` > config > constant cascade
  // (spec.md AC-8, [E6.F1.H1] D3).
  reviewTimeoutMs: z.number().optional(),
  // Per-script validation timeout, in milliseconds. Deliberately no
  // `.default()` — the single fallback constant (`DEFAULT_VALIDATION_TIMEOUT_MS`)
  // lives in `run`, and the numeric range guard lives at `runReview`'s stage-1
  // pre-flight, not here (spec.md AC-4/AC-5, [E5.F1.H2]).
  validationTimeoutMs: z.number().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const RepoEntrySchema = z.object({
  url: z.string(),
  localPath: z.string().optional(),
  baseBranch: z.string().optional(),
  defaultHarness: z.string().optional(),
  defaultEngine: EngineNameSchema.optional(),
  extraSkills: z.array(z.string()).optional(),
  validations: z.array(z.string()).optional(),
  // Per-script validation timeout, in milliseconds. Deliberately no
  // `.default()` — the single fallback constant (`DEFAULT_VALIDATION_TIMEOUT_MS`)
  // lives in `run`, and the numeric range guard lives at `runReview`'s stage-1
  // pre-flight, not here (spec.md AC-4/AC-5, [E5.F1.H2]).
  validationTimeoutMs: z.number().optional(),
});

export type RepoEntry = z.infer<typeof RepoEntrySchema>;

export const RepoRegistrySchema = z.record(z.string(), RepoEntrySchema);

export type RepoRegistry = z.infer<typeof RepoRegistrySchema>;
