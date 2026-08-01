# Plan

## Execution Digest

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- digest_summary: Two executor stages. S1 = local tool enablement (vitest 4.1.10 + tsup 8.5.1 exact pins, test script flag, tsup.config.ts, tsconfig resolveJsonModule, biome allowlist, cli.ts --version) ending fully green locally. S2 = ci.yml verbatim from design §1 + AC-06c red-proof demo (local, uncommitted) + diff bound check. Commit/PR/post-push AC-07 watch are orchestrator-owned post-plan mechanics, not stages.
- stage_plan_digest: S1 → S2, strictly sequential (S2's red demo and diff bound only make sense on S1's green tree). Every stage ends with `npm run check` green.
- validation_digest: Design's Validation Matrix split across stages: S1 owns AC-04/AC-05/AC-08/AC-10 + risk-006 shebang check + dev-mode intact; S2 owns AC-01/AC-02/AC-03 (structural), AC-06c red demo, AC-09 diff bound. AC-07 is post-push only.

## Summary

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete — all mechanics inherited from design.md exact contents; no reinterpretation needed by the executor

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Local tool enablement: pins, scripts, configs, `--version` — repo builds, tests, and smokes green locally | — | package.json, package-lock.json, tsup.config.ts (NEW), biome.json, tsconfig.json, src/main/cli.ts | check + test + build + smoke + shebang + dev-mode all green; dist/ untracked | yes | yes — satisfied by ckp-001 (auto mode, implicit) | pending |
| S2 | CI workflow + red-proof evidence + diff bound | S1 | .github/workflows/ci.yml (NEW); temporary uncommitted edit to src/core/shared/index.ts (reverted, never committed) | structural YAML checklist vs design §1; red demo non-zero then green after revert; `git diff --stat b7f5e98` = exactly the 7 Affected Areas files | yes | yes — satisfied by ckp-001 (auto mode, implicit) | pending |

## Stage Details

### S1 — local tool enablement

Entry preconditions: branch created from b7f5e98 (H2 tip), `git status --porcelain` empty, baseline `npm run check` green.

Steps (contents are design-owned — copy exactly, do not re-derive):

1. `npm i -D -E vitest@4.1.10 tsup@8.5.1` (design §2, dec-006/dec-007). STOP (protocol C) if install fails or resolves versions other than the pins — registry drift would refute dec-007's verification.
2. `package.json` `scripts.test` → `"vitest run --passWithNoTests"` (design §3, dec-002).
3. Create `tsup.config.ts` exactly per design §4 (dec-010).
4. `biome.json` `files.includes` += `"tsup.config.ts"` (design §6, dec-003). No `.github/**` entry.
5. `tsconfig.json` += `"resolveJsonModule": true` (design §5, dec-009 amendment).
6. Replace `src/main/cli.ts` exactly per design §5 (shebang + JSON import attribute + `--version` branch, dec-009).

Per-step validation (design Validation Matrix rows, all expected exit 0 unless stated):

| Command | Expect |
|---|---|
| `npm run check` | green (biome incl. tsup.config.ts + cli.ts, tsc incl. JSON import, depcruise → AC-10) |
| `npm test` | green with zero test files (AC-04); STOP if non-zero despite the flag |
| `npm run build` | emits `dist/cli.js` (AC-05) |
| `node dist/cli.js --version` | prints exactly `node -p "require('./package.json').version"` output; exit 0 (AC-05) |
| `head -1 dist/cli.js` | `#!/usr/bin/env node` (risk-006). If not: bounded fallback — tsup `banner: { js: "#!/usr/bin/env node" }`, drop source shebang, rebuild, re-validate, record deviation. If the fallback also fails → STOP |
| `npm run dev` and `node --experimental-strip-types src/main/cli.ts --version` | exit 0; second prints the version (dev mode intact) |
| `git status --porcelain` | no `dist/` entries (stays ignored/untracked) |

STOP triggers: any validation above failing without a design-sanctioned fallback; any need to touch a file outside design's Affected Areas (blast-radius expansion, protocol C).

Recording: execution-log.md S1 entry with commands + outcomes; state.yaml stage status.

### S2 — ci.yml + red-proof + diff bound

Entry preconditions: S1 done, tree green (`npm run check` exit 0), only intended S1 modifications present.

Steps:

1. Create `.github/workflows/ci.yml` byte-exact from design §1 (dec-008).
2. YAML sanity — pinned acceptable evidence (dec-011): no local linter exists (actionlint not installed, no js-yaml), so evidence = line-by-line comparison against design §1 plus structural checklist: exactly 3 jobs (AC-01); jobs run `npm run check` / `npm test` / `npm run build` verbatim (AC-01, AC-06a); `on:` = unfiltered `pull_request` + `push` to `main` (AC-02); node-version 22 on check/build, matrix [22, 24] on test (AC-03); permissions/concurrency/timeout blocks present (dec-008). The authoritative proof remains the post-push real run (AC-07, risk-008).
3. Red demo (AC-06c, local + uncommitted only): `echo 'import "node:fs";' >> src/core/shared/index.ts` → `npm run check` must exit non-zero at depcruise (`core-no-io-libs`) → `git checkout -- src/core/shared/index.ts` → `npm run check` green again → `git status --porcelain` shows no residue beyond intended change files. STOP (protocol C) if the forbidden import does NOT turn check red — that refutes the AC-06 evidence chain.
4. Final gate at stage end: `npm run check`, `npm test`, `npm run build` + smoke — all green.
5. Diff bound (AC-09 + dec-009 amendment): `git diff --stat b7f5e98` (worktree vs H2 tip) lists exactly the 7 files in design Affected Areas: ci.yml, package.json, package-lock.json, tsup.config.ts, src/main/cli.ts, biome.json, tsconfig.json. Nothing under src/core/ or src/adapters/ modified. STOP on any extra file.

Recording: execution-log.md S2 entry including the full red-demo command/output trail (this IS the AC-06c evidence) and the YAML checklist result; state.yaml stage status.

## AC Coverage

| AC | Covered By |
|---|---|
| AC-01, AC-02, AC-03 | S2 step 2 (structural checklist) + post-push AC-07 run |
| AC-04 | S1 (install + test script + `npm test` green) |
| AC-05 | S1 (build + smoke + version equality check) |
| AC-06 | (a) S2 step 2 verbatim-scripts check; (b) H2 recorded red proofs (referenced, not re-run); (c) S2 step 3 red demo |
| AC-07 | Post-plan mechanics: orchestrator watches the 3 checks green on the stacked PR after push |
| AC-08 | S1 validation + re-confirmed at S2 step 4 (branch tip, pre-PR) |
| AC-09 | S2 step 5 (+ recorded amendments dec-008/dec-009) |
| AC-10 | S1 (`npm run check` depcruise green; cli.ts per design §5, dependency-free) |

## Validation Strategy

- `npm run check` green is mandatory at the end of EVERY stage — the tree is never left red between stages.
- Red proofs stay local and uncommitted; no intentionally broken commit is ever created or pushed.
- Each stage's validation is self-contained and cheap to re-run by QA (commands + expected outcomes above).
- AC-07 is the single post-push criterion; everything else is proven locally first.

## Dependencies And Sequencing

- S1 → S2 strict: S2's red demo and diff bound require S1's green, complete tree.
- No parallelism; one approved stage per executor invocation.
- Post-plan mechanics (orchestrator-owned, NOT executor stages): conventional `feat:` commit(s); merge H2 review fixes into this branch first if PR #48 moved (risk-002); push; open PR with base `claude/scaffold-hexagonal-structure-dfq16n`, title `[E0.F1.H3] ...`, `Closes #4`, description surfacing both amendments (dec-008 concurrency, dec-009 tsconfig) and the `--passWithNoTests` removal duty for E0.F2.x (risk-004); watch the 3 checks green (AC-07); history entry via history-log before closing.

## Planner Stop Note

- Objective is new-feature on continue-lite: plan is NOT terminal. Execution follows via sddl-executor, one approved stage per invocation.

## Approval Notes

- Phase checkpoint implicitly approved per ckp-001 auto mode (recorded as ckp-004 in state.yaml).
- S1 and S2 stage approvals are likewise satisfied by ckp-001's whole-change pre-approval; the executor records each as implicitly approved at stage start.
- dec-011 (plan): two-stage decomposition + ci.yml evidence policy (structural self-check locally, post-push run as authoritative proof). risk-008 records the residual: ci.yml has no authoritative local validation.
- Amendments carried forward for QA/PR visibility: dec-008 (concurrency vs spec non-goal), dec-009 (tsconfig in AC-09 bound).

## Budget Notes

- Above the 300–500 word lite target: the handoff mandate requires per-stage preconditions, per-step validation commands, STOP triggers, and an AC coverage table so the executor runs without reinterpretation; tables carry most of the weight.
