# Plan

## Execution Digest

- change_name: e0-f1-h2-guards
- objective: new-feature
- route: continue-lite
- digest_summary: 2 stages — S1 install `dependency-cruiser@18.1.0` (exact), add `.dependency-cruiser.cjs` verbatim from design.md, set the §5.1 `check` chain, add the config to biome's allowlist, prove the green baseline (contains BOTH decision points: risk-005 TS 7 compatibility → protocol C STOP; risk-006 biome dotfile scanning → bounded formatting/allowlist fallback). S2 runs the five per-rule red proofs (dec-010 attribution protocol, AC-07 negative control, AC-06 full-chain red), full reverts, and closeout (AC-11 clean tree, AC-12 test-gap note).
- stage_plan_digest: S1 → S2 (hard dependency: red proofs need the installed tool and a green baseline); each stage one executor invocation.
- validation_digest: final gate = `npm run check` exit 0 on the clean tree; every red proof = `npx depcruise src` non-zero exit with output naming exactly the target rule; every revert = depcruise back to exit 0.

## Summary

- change_name: e0-f1-h2-guards
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: ready-for-executor

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Install + configs + green baseline: (1) `npm install --save-dev --save-exact dependency-cruiser@18.1.0`; (2) create `.dependency-cruiser.cjs` **verbatim from design.md §".dependency-cruiser.cjs — exact content"** (5 rules, severity error, comments included — they satisfy AC-10); (3) `package.json` `check` → exactly `biome check . && tsc --noEmit && depcruise src`; (4) `biome.json` `files.includes` += `".dependency-cruiser.cjs"`; (5) run the risk-006 and risk-005 checks (see Decision Points), then `npm run check` | — | New file `.dependency-cruiser.cjs`; edits to `package.json`, `package-lock.json` (generated), `biome.json`. No `src/` edits | `npx biome check .dependency-cruiser.cjs` processes the file (risk-006); `npx depcruise src` exit 0 with a "no dependency violations found" summary and no TS-integration errors (risk-005); `npm run check` exit 0 (AC-01..AC-04, AC-10, AC-13) | yes | pre-approved (ckp-001) | pending |
| S2 | Red proofs + reverts + closeout: run the five fixture cycles from design.md §"Red-proof fixtures" table, in AC order, each cycle = apply one-line import → `npx depcruise src` red naming exactly the target rule → revert → `npx depcruise src` exit 0. AC-06 additionally runs full `npm run check` red. AC-07 also runs its negative control (index import → exit 0) and deletes the temp file. Close with AC-11 + AC-12 | S1 | Temporary-only edits: `src/core/run/index.ts`, `src/core/review/index.ts`, `src/adapters/driving/cli/index.ts`, temp `src/core/shared/internal.ts` — all fully reverted | Per-proof expected outputs below; closeout: `git status --porcelain` lists ONLY `.dependency-cruiser.cjs`, `package.json`, `package-lock.json`, `biome.json`; final `npm run check` exit 0; AC-12 gap recorded in execution-log.md | yes (temporary) | pre-approved (ckp-001) | pending |

## Red-Proof Cycles (S2 exact protocol, dec-010)

Fixture lines and files are pinned in design.md §"Red-proof fixtures and attribution protocol" — the executor copies them verbatim, appending as the last line of the target file. Per cycle:

1. Apply the single fixture edit (AC-07 additionally creates `src/core/shared/internal.ts` with the placeholder shape: doc comment + `export {};`).
2. `npx depcruise src` → expected: non-zero exit (dc exits with the error count, so 1), eslint-like output containing `error <rule-name>:` with the fixture's from → to modules, and a summary line of the form `✖ 1 dependency violations (1 errors, 0 warnings)`. The named rule must be **exactly** the target rule and **only** that rule:

   | AC | Expected rule named | From file |
   |---|---|---|
   | AC-05 | `core-no-adapters` | `src/core/run/index.ts` |
   | AC-06 | `core-no-io-libs` (to `node:fs`) | `src/core/run/index.ts` |
   | AC-07 | `core-modules-via-index` | `src/core/review/index.ts` |
   | AC-08 | `adapters-isolated` | `src/adapters/driving/cli/index.ts` |
   | AC-09 | `wiring-only-in-main` | `src/adapters/driving/cli/index.ts` |

3. AC-06 only: also run `npm run check` → expected non-zero, failing at the depcruise step (biome and tsc pass the fixture) — proves the chain wires the failure through.
4. AC-07 only, negative control: change the import to `../shared/index.js` → `npx depcruise src` → expected exit 0 (index imports are allowed); then proceed to revert.
5. Revert the fixture (remove the line; AC-07 also deletes the temp file) → `npx depcruise src` → exit 0.

**Do-not-proceed rule:** if any cycle fails its expectation (rule does not trip, wrong rule name, extra rules fire, or the negative control goes red), STOP the cycle sequence, fix `.dependency-cruiser.cjs` (config-only; fixture lines are design-pinned), record the fix as a deviation in execution-log.md + a state.yaml decision, and re-prove **that rule from step 1** before moving on. Never continue past a failed proof.

## Decision Points (both in S1 — mandatory recording)

| Id | Trigger | Placement | Bounded action | If unresolvable |
|---|---|---|---|---|
| risk-005 (medium) | First `npx depcruise src` after install: TS-integration errors, tsconfig-load failure, or warnings that typescript 7.0.2 is unsupported/falling back | S1 step 5, re-confirmed implicitly by S2 AC-05 red proof (fixtures are acorn-parseable, so failure is observable) | None autonomous — this is verify-only | **STOP, protocol C**: report to orchestrator; the alternative (re-pin typescript) touches H1 scope and is not authorized |
| risk-006 (low) | `npx biome check .dependency-cruiser.cjs` reports no-files-processed, or `biome check .` skips/flags the config | S1 step 5, before the full `npm run check` | Adjust the `files.includes` entry and/or run `npx biome check --write .dependency-cruiser.cjs` (content-neutral formatting only) | If biome cannot be made to scan it at all → STOP (AC-13 unmeetable), escalate B |

**Recording duties (mirror H1):** whenever a decision point fires — including the benign risk-006 fallback — the executor records it in `execution-log.md` (what fired, evidence, action taken) and as a new `state.yaml` decision entry before continuing. Silent fallbacks are not allowed. If neither fires, execution-log notes both checks passed (risk-005/risk-006 closed).

## Validation Strategy

- Green baseline (S1): `npm run check` exit 0 — first run of the complete §5.1 chain. `npx depcruise src` output should also confirm flagless auto-discovery (AC-03): rules loaded from `.dependency-cruiser.cjs` with no `--config`; a "no dependency violations found" line over the 13 placeholder modules.
- Red proofs (S2): per-cycle expectations above; attribution is deterministic because each proof runs `npx depcruise src` directly.
- Closeout (S2): `git status --porcelain` → exactly the four intended files (AC-11); final `npm run check` exit 0; AC-12 (`npm test` not runnable until vitest lands in E0.F2.x — this story verified exclusively via check red/green) written into execution-log.md.
- AC coverage: S1 → AC-01, AC-02, AC-03, AC-04, AC-10, AC-13; S2 → AC-05..AC-09, AC-11, AC-12.

## Dependencies And Sequencing

- S2 strictly depends on S1 (tool installed, config present, baseline green — a red proof against a non-green baseline proves nothing).
- Within S2, cycles run in AC order (AC-05 → AC-09); each cycle ends green before the next starts, so a stray fixture can never contaminate the next attribution.
- Commits/PR/history are orchestrator-owned post-plan mechanics, outside both stages: suggested single commit after S2 (`feat: add dependency-cruiser architecture guards to check gate`), PR `[E0.F1.H2] ...` with `Closes #3`, history S03 entry — per ckp-001 closing requirements.

## Planner Stop Note

- Objective is `new-feature` on `continue-lite`: not planner-terminal. Execution follows via `sddl-executor`, one stage per invocation, S1 → S2.

## Approval Notes

- ckp-001/dec-001 (auto mode) pre-approves both stages, including the temporary `src/` fixture edits; no per-stage pause required. Checkpoint for this plan stage skipped as implicitly approved (ckp-001).
- The only autonomous conditional is the risk-006 formatting/allowlist fallback (content-neutral, pre-bounded above). risk-005 has **no** autonomous fallback: it is a protocol C STOP.
- Any deviation beyond these bounds (install failure, unexpected check errors not attributable to a fixture, blast-radius growth beyond the four intended files) escalates per A/B/C — stop and route back to the orchestrator rather than improvising.
- A real (non-fixture) architecture-guard violation discovered at any point is a BLOCKER, not something to fix inline.

## Budget Notes

- ~700 words plus tables: the red-proof protocol table is the executable core and is kept explicit so `sddl-executor` needs zero reinterpretation; config content intentionally not duplicated — design.md is the verbatim source.
