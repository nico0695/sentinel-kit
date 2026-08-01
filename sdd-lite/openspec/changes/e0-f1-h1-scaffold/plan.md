# Plan

## Execution Digest

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- digest_summary: 3 stages — S1 tree+configs (13 placeholder `.ts`, 3 `.gitkeep`, 4 root configs, contents verbatim in design.md), S2 `npm install` + gates green (`check` exit 0, `dev` exit 0; TS 7.0.2→5.9.3 fallback decision point lives here), S3 docs placeholder replacement (8 lines, 3 files) + final gate re-run.
- stage_plan_digest: S1 → S2 (hard dependency); S3 independent of tooling but ordered last; each stage one executor invocation.
- validation_digest: final gate = `npm run check` exit 0 (D1: `biome check . && tsc --noEmit`); intermediate checks are file-existence/grep/exit-code only.

## Summary

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: ready-for-executor

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Create full file tree and root configs exactly as design.md specifies: 13 placeholder `.ts` files (doc comment + `export {};` per D2 pattern), `harnesses/`/`skills/`/`fixtures/` `.gitkeep`, `package.json`, `tsconfig.json`, `biome.json`, `.gitignore` — contents verbatim from design.md §Design Overview | — | New files only; no installs, no docs edits | `git status` shows exactly the expected additions; spot-read one core + one adapter placeholder for D2 honesty (AC-01, AC-02, AC-04, AC-06 static half) | yes | pre-approved (ckp-001) | pending |
| S2 | Install pinned devDeps and turn the gates green: `npm install` (commits lockfile), then `npm run check` and `npm run dev`. **Decision point (pre-authorized A-level):** if typescript 7.0.2 fails install or misbehaves on any §5.2 flag / `--noEmit`, re-pin to 5.9.3, re-install, and record the deviation in execution-log.md and as a state.yaml decision | S1 | Edits limited to `package.json` (only if fallback fires) + generated `package-lock.json` + `node_modules/` (ignored) | `npm run check` exit 0 (AC-03, gate); `npm run dev` exit 0 (AC-08); devDeps-only tree (AC-07); lockfile present (D3) | yes | pre-approved (ckp-001) | pending |
| S3 | Replace the 8 docs placeholder occurrences with `@nico0695/sentinel` (D4; all 8 are full package form per design evidence — backlog L43/L379, prd L279, setup L34/L35/L38/L76/L153), then re-run the final gate | — (independent; ordered last to keep gate runs unperturbed) | Edits only to the 8 lines in `docs/{backlog,prd,setup}*.md` | `grep -r "@<scope>\|@<your-scope>" docs/` → zero matches; `git diff docs/` touches only those lines (AC-05); `npm run check` still exit 0 (final gate) | no (docs only) | pre-approved (ckp-001) | pending |

## Validation Strategy

- Final gate: `npm run check` exit 0 with `check` = `biome check . && tsc --noEmit` (D1). First real run is in S2; re-run at S3 close as the closing gate.
- Intermediate validations are deliberately cheap: file-listing/`git status` after S1, exit codes after S2, grep + diff inspection after S3 — no test framework exists this story (spec non-goal: `build`/`test` fail by design; do not run them as validation).
- AC-06 (guard-clean placeholders) is validated by construction in S1 (zero imports anywhere) — no tooling needed.
- AC-09 (PR) is orchestrator-owned, outside this plan.

## Dependencies And Sequencing

- S2 strictly depends on S1 (tooling needs `package.json` and real tsc/biome inputs).
- S3 has no technical dependency (biome's allowlist never scans `docs/`) but runs last so the S2 gate result is not interleaved with unrelated edits.
- Suggested commit boundaries (orchestrator-owned): one commit after S1+S2 (`feat: scaffold hexagonal structure and toolchain`), one after S3 (`docs: replace npm scope placeholders`) — or a single commit; either is fine, conventional-commit format required.

## Planner Stop Note

- Objective is `new-feature` on `continue-lite`: not planner-terminal. Execution follows via `sddl-executor`, one stage per invocation, in order S1 → S2 → S3.

## Approval Notes

- ckp-001/dec-001 (auto mode) pre-approves all three stages, including the code-touching ones; no per-stage pause is required.
- The only conditional is the S2 typescript fallback — pre-bounded and pre-authorized in design.md (A-level). If it fires, the executor must record it in `execution-log.md` and as a new `state.yaml` decision before continuing; silent re-pinning is not allowed.
- Any deviation beyond that fallback (e.g. biome 2.5.6 install failure, unexpected check errors not fixable within design's stated configs) escalates per A/B/C — stop and route back to the orchestrator rather than improvising.

## Budget Notes

- ~480 words plus tables; config/file contents intentionally not duplicated — design.md §Design Overview is the verbatim source the executor reads.
