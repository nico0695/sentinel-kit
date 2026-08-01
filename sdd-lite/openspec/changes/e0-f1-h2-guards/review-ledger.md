# Review Ledger

## Review Digest

- target_identity: git range `4b43813..9e124e2` (HEAD 9e124e2)
- review_mode: 4r
- judgment_target_kind: code
- tier: standard
- scope: change:e0-f1-h2-guards
- round: 0
- counts: confirmed=0 suspect=0 escalated=0 info=3
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: no severe findings — proceed to sddl-qa-review (final mode); the three info rows are future-layout boundary gaps, candidates for a follow-up story, never blocking
- updated_at: 2026-08-01T20:20:00Z

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: full story diff of `[E0.F1.H2]` — new `.dependency-cruiser.cjs` (98 lines, 5 guard rules + options), biome.json allowlist entry, package.json (check script gains `depcruise src`, devDeps: dependency-cruiser 18.1.0 added, typescript 7.0.2 → 5.9.3 per dec-011)
- target_kind: diff
- paths_or_diff_reference: `git diff 4b43813..9e124e2 -- . ':!package-lock.json' ':!sdd-lite'`
- changed_lines: 109 hand-written (generated `package-lock.json` and sdd-lite process artifacts excluded from the count, same exclusion rule as the H1 review)
- immutable_reference: 9e124e2 (story base: 4b43813, the main merge of PR #47)
- created_at: 2026-08-01T20:00:00Z

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R3-001 | reliability | .dependency-cruiser.cjs:76 | WARNING | info | deterministic | introduced | no | `adapters-isolated` silently exempts adapter files at direction level (`src/adapters/driving/*.ts`): the `from` regex requires depth >= 3, so a direction-level file can import any other adapter with a green check | live probe: `src/adapters/driving/shared.ts` importing `../driven/git/index.js` → exit 0, "no dependency violations found" (replica tree, dc 18.1.0, same config) |
| R3-002 | reliability | .dependency-cruiser.cjs:60 | WARNING | info | deterministic | introduced | no | `core-modules-via-index` silently exempts files directly under `src/core/`: the `from` regex never matches `src/core/<file>.ts`, so such a file can deep-import module internals (rules 1-2 still apply to it; the via-index contract does not) | live probe: `src/core/util.ts` importing `./shared/internal.js` → exit 0. Likelihood lowered by the PRD layout (no direct core files) and the no-utils-in-core convention |
| R3-003 | reliability | .dependency-cruiser.cjs:89-93 | WARNING | info | deterministic | introduced | no | Unanchored prefix regexes (`^src/main`, `^src/core`, `^src/(adapters\|main)`) misbehave on hypothetical sibling dirs sharing a name prefix: `src/mainframe` bypasses `wiring-only-in-main` silently; `src/maintenance` false-fires it | live probes: `src/mainframe/x.ts` importing `../main/cli.js` → exit 0 (silent bypass); adapter importing `src/maintenance/x.ts` → error `wiring-only-in-main` (false positive). Requires a top-level dir the PRD layout does not sanction; fix is `(/|$)` anchoring |

Triage rationale (orchestrator): not `trivial` (the diff creates the executable guard config — the extraction guarantee itself); not `full-4r` (109 hand-written lines < 400; no auth/security/data surface; the hot-path concern concentrates in one config whose primary contracts already carry S2 red-proof evidence). `standard` tier → exactly one lens; dominant defect class is a silently permissive rule (correctness) → `reliability`.

Lens evidence summary (worker, read-only): target verified immutable (HEAD 9e124e2, clean porcelain before/after; reads via `git show`). Static review of all 5 rules, options block, severity levels, check-chain ordering (depcruise last — cannot be masked), exact pins. 12 live probes on a scratchpad replica (symlinked node_modules; baseline reproduced the commit's 13-modules evidence exactly): bare `fs` and uninstalled-npm branches of `core-no-io-libs` fire (S2 only proved `node:fs`); `zod` and `zod/v4` allowed (whitelist subpath form works); same-module deep import allowed ($1 substitution correct); nested-subdir cross-module deep import fires at any depth; nested `sub/index.ts` not whitelisted (anchoring correct); `import type` fires (dec-008 delivered); main → adapters allowed; dynamic `import()` of a builtin fires. Residual gap recorded honestly: the `^node_modules/zod(/|$)` resolved-path whitelist branch stays unproven until zod is installed (risk-003, E1+).

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|

Not applicable — standard tier has no refuter pass; all three findings are `info` (below the severity floor) and deterministic (live-probe evidence), so no corroboration path applies.

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|

None used (0 of 2). Severity floor: WARNING rows are recorded once as `info` and never enter the fix loop.

## Verdict Rationale

- Zero BLOCKER/CRITICAL findings; the 5 guards' primary contracts are empirically verified twice over (S2 red proofs + 12 independent lens probes). Three WARNING rows document boundary-shape gaps that only activate on file layouts the PRD does not sanction (direction-level adapter files, direct `src/core/` files, prefix-sharing sibling dirs) — real weaknesses, tolerable short-term, recorded as `info`. Verdict: `pass_with_warnings`.

## Next Recommended Action

- Route to `sddl-qa-review` in final mode; this ledger is closure evidence. No fix routing. Suggested follow-up (non-blocking, user's call): a small hardening story anchoring the rule regexes with `(/|$)` and extending `adapters-isolated`/`core-modules-via-index` to depth-1 files, seeded from R3-001..R3-003.

## Budget Notes

- Budgets used: 1 lens sweep of 1 allowed (standard); 0 refuter passes (not permitted in standard); 0 of 2 fix rounds.
