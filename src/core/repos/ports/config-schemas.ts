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
});

export type RepoEntry = z.infer<typeof RepoEntrySchema>;

export const RepoRegistrySchema = z.record(z.string(), RepoEntrySchema);

export type RepoRegistry = z.infer<typeof RepoRegistrySchema>;
