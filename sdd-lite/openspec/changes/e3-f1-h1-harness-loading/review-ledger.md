# Review Ledger

## Review Digest

- target_identity: 52d896d (feat(review): implement HarnessLoader port, adapter, and domain logic [E3.F1.H1])
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e3-f1-h1-harness-loading
- round: 0
- counts: confirmed=0 suspect=0 escalated=0 info=8
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: No blocking findings. Proceed to next story or open follow-up for hardening items.
- updated_at: 2026-08-04

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: HarnessLoader port + fs adapter + loadHarnesses use case + resolveHarnessSkills pure function + error hierarchy + tests
- target_kind: diff
- paths_or_diff_reference: src/core/review/, src/adapters/driven/storage/
- changed_lines: 954
- immutable_reference: 52d896d
- created_at: 2026-08-04

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R1-001 | readability, reliability | src/core/review/__test__/fake-harness-loader.ts:36, src/adapters/driven/storage/harness-loader-fs.ts:133 | WARNING | info | deterministic | introduced | no | loadSkill throws HarnessNotFoundError whose .type property and message misidentify a missing skill as a missing harness, producing misleading diagnostics. | harness-errors.ts:17-22, HarnessLoader.contract.ts:201-208 |
| R1-002 | readability | src/adapters/driven/storage/harness-loader-fs.ts:72 | WARNING | info | deterministic | introduced | no | loadHarness throws HarnessValidationError for a non-existent harness type (missing dir), conflating "not found" with "invalid"; callers catching HarnessValidationError for field-level diagnostics get a misleading error. | harness-errors.ts:16-23 (HarnessNotFoundError exists but is unused), HarnessLoader.contract.ts:127-137 |
| R3-001 | risk | src/adapters/driven/storage/harness-loader-fs.ts:49,127 | WARNING | info | deterministic | introduced | no | loadHarness and loadSkill do not validate type/name parameters against path traversal; join() resolves ../ segments, enabling reads outside the intended directory. Current call sites only pass values from listHarnesses/listSkills (safe), but methods are public port API. | harness-loader-fs.ts:49 join(harnessesPath, type), :127 join(skillsPath, name+.md) |
| R4-001 | resilience, risk, reliability | src/adapters/driven/storage/harness-loader-fs.ts:114 | WARNING | info | deterministic | introduced | no | listSkills uses readdir without withFileTypes; a subdirectory named *.md would be returned as a valid skill name, and loadSkill would fail with EISDIR (not caught by isEnoent), propagating as a raw error. | listHarnesses at :38 correctly uses withFileTypes; listSkills at :114 does not |
| R4-002 | resilience | src/core/review/load-harnesses.ts:31-37 | WARNING | info | deterministic | introduced | no | loadHarnesses eagerly loads ALL skill files via Promise.all before checking which are referenced; an I/O failure on any unreferenced skill file crashes the entire operation. | :23-29 allSkillNames is the union of ALL skills, :31-37 Promise.all loads every one |
| R1-003 | readability | src/adapters/driven/storage/harness-loader-fs.ts:38,157 | SUGGESTION | info | deterministic | introduced | no | zodToFields and isEnoent are duplicated verbatim between harness-loader-fs.ts and config-store-yaml.ts. | harness-loader-fs.ts:38-45,157-164 vs config-store-yaml.ts:27-34,153-160 |
| R3-002 | risk, reliability | src/core/review/ports/harness-schemas.ts:4 | SUGGESTION | info | deterministic | introduced | no | HarnessSkillsSchema accepts empty strings and path separators as skill names; downstream map-miss catches them, but parse-time validation would give clearer errors. | z.array(z.string()) with no .min(1) or pattern constraint |
| R1-004 | readability | src/core/review/ports/harness-loader.ts:3 | SUGGESTION | info | inferential | introduced | no | HarnessLoader port name only mentions harnesses but also manages skills (listSkills, loadSkill); naming could be clearer. | harness-loader.ts:3-8 interface has 4 methods across 2 resource types |

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| — | — | — | No BLOCKER/CRITICAL findings; refuter pass not required. |

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|
| — | — | — | — | No fix rounds needed; all findings are info-tier. |

## Verdict Rationale

- All 8 findings are WARNING or SUGGESTION severity, placed at `status: info` per the severity floor.
- No BLOCKER or CRITICAL findings from any of the 4 lenses.
- The most actionable items for future hardening are: R3-001 (path traversal defense-in-depth), R4-001 (listSkills withFileTypes consistency), and R4-002 (eager skill loading).
- R1-001 and R1-002 (error type semantics) are design-level choices that were already partially addressed during QA; the current behavior is consistent across fake, adapter, and contract tests.
- Architecture guards are clean: no core/ I/O imports, no adapter-to-adapter imports, depcruise passes with 0 violations.

## Next Recommended Action

- **Verdict: pass_with_warnings** — no blocking findings.
- Recommended: proceed to next story. Optionally open a follow-up hardening issue for R3-001 (path traversal) and R4-001 (listSkills withFileTypes) as defense-in-depth improvements.

## Budget Notes

- Four lens sweeps (one each: readability, reliability, resilience, risk) — full-4r budget.
- Refuter pass skipped: no BLOCKER/CRITICAL findings to corroborate.
- Zero fix rounds consumed.
