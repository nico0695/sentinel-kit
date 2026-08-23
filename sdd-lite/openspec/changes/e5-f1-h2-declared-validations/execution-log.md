# Execution Log

## ST-1 — Additive config field: `validationTimeoutMs`

- **Status**: completed
- **Scope**: `src/core/repos/ports/config-schemas.ts` (edit), `src/core/repos/__test__/config-schemas.test.ts` (new)
- **What landed**:
  - `validationTimeoutMs: z.number().optional()` appended to both `GlobalConfigSchema` and `RepoEntrySchema`, each with a doc comment recording *why* there is deliberately no `.default()` and no numeric-range guard here: the single fallback constant (`DEFAULT_VALIDATION_TIMEOUT_MS`) lives in `run`, and the R2-2 numeric-range guard (finite, `> 0`, `≤ 2_147_483_647`) is pinned by spec.md AC-4/design.md D-4 to `runReview`'s stage-1 pre-flight, not to the schema — confirmed by re-reading spec.md's AC-5 text verbatim before writing any code, per the R2-2 instruction in this stage's handoff. `RepoEntry.validations` was left completely untouched — still exactly `z.array(z.string()).optional()`.
  - `src/core/repos/__test__/config-schemas.test.ts` (new — no prior schema test file existed for this module, per spec.md R2-6's legal-home finding): 7 tests across `GlobalConfigSchema` and `RepoEntrySchema` — a pre-story document still parses with `validationTimeoutMs` `undefined` (and no own-property present, ruling out a hidden default), a document carrying the field parses with the value preserved, and one explicit assertion that `validations` stays unwidened (accepts a string array, rejects an object-shaped entry).
- **Validation**:
  - `npx vitest run --project core -t "config-schemas"`: `Test Files 1 passed | 16 skipped (17)`, `Tests 7 passed | 202 skipped (209)`.
  - `npm run check` (`biome check . && tsc --noEmit && depcruise src`): `Checked 115 files in 252ms. No fixes applied.` / `tsc --noEmit` clean (no output) / `✔ no dependency violations found (80 modules, 164 dependencies cruised)`.
- **Deviations**: none. The R2-2 guard-placement question in the handoff was resolved by reading spec.md's AC-5 text directly ("The config schema deliberately does **not** enforce this... the stage-1 pre-flight is the only gate") rather than assumed — the schema field is correctly a bare `.optional()` on both schemas, and no validation logic was added at this stage.
