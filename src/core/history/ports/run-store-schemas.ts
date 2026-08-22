/**
 * Core module: history — zod schema for `RunStore`'s path-sensitive fields.
 *
 * Validates ONLY `repoName` and `startedAtEpochMs`: the two `RunRecord`
 * fields that become filesystem path segments. Every other field is a
 * TypeScript union or primitive already guaranteed at compile time —
 * re-declaring those as zod enums would duplicate literal lists and
 * reintroduce the drift hazard `[E4.F2.H3]`'s shared `EngineNameSchema`
 * removed. This file imports only `zod` (core I/O whitelist, guard 2).
 */
import { z } from "zod";

/** Shared by every schema below: a string safe to use as one path segment. */
const PathSegmentSchema = z
  .string()
  .min(1)
  .refine((v) => !v.includes("/") && !v.includes("\\"), {
    message: "must not contain path separators",
  })
  .refine((v) => !v.startsWith("."), {
    message: "must not start with '.'",
  });

export const RunRecordPathFieldsSchema = z.object({
  repoName: PathSegmentSchema,
  startedAtEpochMs: z.number().int().nonnegative().finite(),
});

export type RunRecordPathFields = z.infer<typeof RunRecordPathFieldsSchema>;

/**
 * Validates `list`/`get`'s inputs before any fs access (`[E5.F2.H2]` AC-13).
 * `id`'s ts-FORMAT is deliberately NOT checked here — that is the adapter's
 * `parseRunTimestamp` (D5), so the on-disk layout's format stays out of the
 * port contract. This schema only guarantees `id` is safe to use as a path
 * segment, same as `repoName`.
 */
export const RunQueryFieldsSchema = z.object({
  repoName: PathSegmentSchema,
  id: PathSegmentSchema,
});

export type RunQueryFields = z.infer<typeof RunQueryFieldsSchema>;
