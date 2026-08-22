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

export const RunRecordPathFieldsSchema = z.object({
  repoName: z
    .string()
    .min(1)
    .refine((v) => !v.includes("/") && !v.includes("\\"), {
      message: "repoName must not contain path separators",
    })
    .refine((v) => !v.startsWith("."), {
      message: "repoName must not start with '.'",
    }),
  startedAtEpochMs: z.number().int().nonnegative().finite(),
});

export type RunRecordPathFields = z.infer<typeof RunRecordPathFieldsSchema>;
