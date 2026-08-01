# Spec

## Routing Digest

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- digest_summary: `.github/workflows/ci.yml` with jobs check / test / build on `pull_request` (any base) and push to main, plus minimal tool enablement (vitest exact-pin + `--passWithNoTests`, tsup exact-pin + `tsup.config.ts`, minimal `--version` in `src/main/cli.ts`) so all 3 jobs are green on the stacked PR (base = H2 branch).
- scope_digest: In: ci.yml, vitest devDep + test-script flag, tsup devDep + root config, minimal `--version`, biome allowlist entry for the new config, lockfile. Out: release.yml/pr-title/dependabot, E0.F2.x vitest projects and test content, E6.F1.x CLI wiring.
- acceptance_digest: 3 jobs green on the real stacked PR; `npm run check` and `npm test` green locally pre-PR; `node dist/cli.js --version` prints the package.json version and exits 0; broken guard = red pipeline proven by command-level equivalence + H2 red proofs; diff bounded to the listed files.

## Summary

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- spec_status: complete — all five proposal questions pinned as A-level decisions (dec-002…dec-006)

## Scope Boundary

### In Scope

- `.github/workflows/ci.yml`: job `check` (npm ci → `npm run check`), job `test` (Node matrix 22/24 → `npm test`), job `build` (npm ci → `npm run build` → bin smoke). Triggers: `pull_request` with **no branch filter** (must fire for the stacked PR whose base is `claude/scaffold-hexagonal-structure-dfq16n`, and for future PRs to main) and `push` to `main` only. Jobs run the npm scripts verbatim (no duplicated tool invocations) and install with `npm ci`.
- vitest installed as exact-pinned devDep; `test` script becomes `vitest run --passWithNoTests` (dec-002). No vitest config file is committed.
- tsup installed as exact-pinned devDep; `tsup.config.ts` at repo root bundling `src/main/cli.ts` → `dist/cli.js` ESM, matching `bin.sentinel`/`bin.snt` = `./dist/cli.js` (dec-003). Config file added to `biome.json` `files.includes` so it sits under the quality gate (repo convention, as `.dependency-cruiser.cjs` in H2).
- Minimal `--version` in `src/main/cli.ts`: built bin prints the package version and exits 0; all other invocations remain a no-op exiting 0 (dec-004).
- `package.json` / `package-lock.json` updates from the above only.

### Out Of Scope

- `release.yml`, PR-title lint, Dependabot/Renovate (setup §6 lists them separately).
- Vitest projects config (core/adapters/e2e), fixtures, any test content — E0.F2.x.
- Real CLI wiring, arg parsing, composition-root behavior beyond `--version` — E6.F1.x.
- Changes to biome/tsc/depcruise rule content (H1/H2 territory); `biome.json` is touched only to allowlist `tsup.config.ts`.
- Any change under `src/core/` or `src/adapters/`.

### Non-Goals

- No caching/optimization tuning beyond setup-node's standard npm cache; no concurrency groups, no badges.
- Not making `--passWithNoTests` permanent: E0.F2.x MUST remove the flag when the real projects config lands (recorded hand-off duty, see risks).
- No proof-by-broken-commit on the PR: guard red-proof is by evidence chain (AC-06), never by pushing a failing commit.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| PR opened/updated (any base branch, incl. stacked H2 base) | ci.yml fires; jobs check, test (22 and 24), build all run and pass | GitHub checks UI on the real PR |
| Push to main (post-merge) | Same 3 jobs run | Workflow `on.push.branches: [main]` |
| `npm test` today (zero test files) | Exit 0 via `--passWithNoTests` | Local + CI test job |
| A real failing test exists later | `npm test` exits non-zero (flag only tolerates *absence* of tests, never failures) | Contract of dec-002; validated by vitest semantics |
| Forbidden import added (e.g. core → adapters) | `npm run check` fails at depcruise → check job red → pipeline red | Evidence chain AC-06; H2 recorded local red proofs |
| `npm run build` then `node dist/cli.js --version` | Prints the exact `version` from package.json, exit 0 | Smoke step in build job; no hardcoded duplicate literal |
| `node dist/cli.js` (no args) | No-op, exit 0 | Minimal enablement; real UX is E6.F1.x |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-01 | `.github/workflows/ci.yml` defines exactly 3 jobs (check, test, build); check = npm ci → `npm run check`; test = Node matrix [22, 24] → npm ci → `npm test`; build = npm ci → `npm run build` → smoke | Read workflow; jobs call npm scripts, not raw tools | must |
| AC-02 | Triggers: `pull_request` unfiltered (fires on the stacked PR) and `push` limited to `main` | Workflow `on:` block; PR checks appear on the stacked PR | must |
| AC-03 | check and build jobs run on Node 22 only; test matrixes [22, 24] (dec-005) | Workflow node-version fields | must |
| AC-04 | `npm test` exits 0 today with zero test files, via `vitest run --passWithNoTests` in the test script; vitest is an exact-pinned devDep | Run locally; inspect package.json (no `^`/`~`) | must |
| AC-05 | `npm run build` emits `dist/cli.js` (ESM) from `tsup.config.ts`; tsup exact-pinned; `node dist/cli.js --version` prints the package.json version and exits 0 — this exact command shape is the CI smoke step | Run locally; compare output to `node -p "require('./package.json').version"` | must |
| AC-06 | Guard red-proof evidence chain accepted: (a) check job runs `npm run check` verbatim (command-level equivalence), (b) H2's recorded red proofs that a forbidden import fails depcruise locally, (c) executor re-runs the local red demonstration once (temporary uncommitted forbidden import → `npm run check` non-zero → revert) | execution-log records (c); no broken commit ever pushed | must |
| AC-07 | All 3 jobs green on the real stacked PR (GitHub checks) — verified post-push before closing the story | GitHub PR checks tab | must |
| AC-08 | `npm run check` and `npm test` green locally before the PR opens; `tsup.config.ts` is in biome's `files.includes` and passes the gate | Local run at branch tip | must |
| AC-09 | Diff bounded to: `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `tsup.config.ts`, `src/main/cli.ts`, `biome.json` (allowlist entry only). Nothing under `src/core/` or `src/adapters/` | `git diff --stat` against H2 tip b7f5e98 | must |
| AC-10 | `src/main/cli.ts` stays dependency-free (node builtins / JSON import at most; no core imports) and passes all architecture guards | depcruise green; read the file | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `--passWithNoTests` lingering after E0.F2.x could mask an empty test glob | medium (future) | Pinned as explicit hand-off duty: E0.F2.x removes the flag with the projects config. Recorded here + will be echoed in PR description |
| `tsup.config.ts` under tsc `--noEmit` | low | Design must verify tsconfig include/exclude so `npm run check` stays green (type-check it or keep it outside tsconfig scope deliberately) |
| vitest/tsup concrete versions unknown until design | low | dec-006 pins exact-pin policy; design verifies compatibility (vitest ↔ Node 22/24 + TS 5.9.3; tsup ↔ esbuild-based, TS version mostly irrelevant — recorded) |
| Stacked PR base moves (H2 review fixes) | low | Kickoff rule: merge H2 fixes into this branch before opening/updating PR (risk-002, unchanged) |
| CI green depends on GitHub runner state (post-push AC-07) | low | Only verifiable after push; all other ACs are locally verifiable first |

## Open Questions And Decisions

All five proposal questions are resolved as A-level decisions (autonomous, reversible, aligned with setup §6 and repo conventions); recorded in state.yaml continuing from dec-002.

| Item | Decision | Rationale | Status |
|---|---|---|---|
| Zero-test strategy | dec-002: `vitest run --passWithNoTests` in the `test` script; no vitest config file committed | Leaves E0.F2.x a clean slate (no throwaway config to replace, no biome allowlist churn); contract holds: exit 0 with zero tests today, non-zero the moment a failing test exists. Flag removal is a pinned E0.F2.x duty | decided (A) |
| tsup config shape | dec-003: `tsup.config.ts` at repo root, added to biome `files.includes`; exact contents design-owned | Typed and discoverable; matches repo convention of explicit root config files (biome.json, tsconfig.json, .dependency-cruiser.cjs — the latter needed the same allowlist treatment in H2). package.json field is untyped and less visible | decided (A) |
| `--version` + smoke shape | dec-004: printed version must equal package.json `version` from a single source of truth (no duplicated hardcoded literal; mechanism — JSON import, createRequire, or build-time define — design-owned); smoke command pinned as `node dist/cli.js --version`; everything else stays no-op exit 0 | Single-source rule prevents drift without absorbing E6.F1.x wiring; `node dist/cli.js` avoids npm-link/`npm exec` indirection and is deterministic in CI | decided (A) |
| Matrix breadth | dec-005: test job matrixes [22, 24]; check and build run on Node 22 only | Matches setup §6 sketch verbatim (matrix only on test). 22 = engines floor: lint/typecheck/guards are Node-version-independent tooling, and building + smoking on the floor proves the bin works on the minimum supported runtime; saves CI minutes | decided (A) |
| Exact pins | dec-006: vitest and tsup installed with exact pins (`npm i -D -E`); concrete versions chosen in design with compatibility check (vitest ↔ Node 22/24, TS 5.9.3; tsup ↔ TS 5.9.3 — tsup bundles via esbuild so the TS version is mostly irrelevant, recorded for the audit) | Consistent with existing exact pins (biome 2.5.6, depcruise 18.1.0, typescript 5.9.3); versions are design mechanics, policy is spec contract | decided (A) |

No open questions remain for design; remaining unknowns (concrete versions, tsconfig treatment of tsup.config.ts, exact workflow YAML) are design-owned mechanics inside pinned behavior.

## Approval Notes

- Whole-change auto mode pre-approved (ckp-001). This phase checkpoint recorded as implicitly approved per ckp-001 (ckp-002 in state.yaml); the five pins are A-level under the decision protocol, each recorded with rationale.
- Stacking context (branch from b7f5e98, PR base = H2 branch) is fixed kickoff input, restated here only as AC context.

## Budget Notes

- Slightly above the 300–500 word lite target because the spec absorbs five decision records; tables keep it scannable for design/QA.
