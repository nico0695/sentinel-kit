# Proposal

## Routing Digest

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- digest_summary: GitHub Actions `ci.yml` with jobs check / test / build on PR and push to main, per backlog [E0.F1.H3] (issue #4) and setup §6, stacked on the H2 branch. Includes the minimal tool enablement (vitest, tsup, `--version` smoke behavior) required for all 3 jobs to be green on this very PR.
- feasibility_signal: high — one workflow file plus bounded devDep enablement; the only real work is pinning the enablement boundary against E0.F2.x and E6.F1.x.
- scope_sketch_digest: In: ci.yml (3 jobs), vitest install (green with zero tests), tsup install + minimal config, minimal `--version` in cli.ts. Out: release.yml, pr-title lint, dependabot, real test projects/content (E0.F2.x), real CLI wiring (E6.F1.x).

## Summary

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- proposal_status: complete
- exploration_performed: true (read `docs/setup-tecnico-sentinel.md` §6 to confirm the ci.yml sketch; all other repo facts injected pre-verified by the orchestrator handoff)

## Problem And Desired Outcome

**Problem.** The quality gate (`npm run check` = biome + tsc + depcruise) and `npm test` are local-only. Nothing enforces them on PRs or on main, so a broken architecture guard could merge silently — contradicting setup §6's "guards in CI from commit 1", which is the extraction guarantee for the core (PRD §4.5/§7). Additionally, two of the three mandated jobs are not currently runnable: vitest and tsup are not installed (scripts exist; `npm test` exits 127, recorded at H2 QA), and `src/main/cli.ts` is a deliberate no-op while `package.json` declares `sentinel`/`snt` bins.

**Desired outcome.** `.github/workflows/ci.yml` runs three jobs — `check` (npm ci → biome check → tsc --noEmit → depcruise src), `test` (Node matrix 22/24 → vitest run), `build` (tsup → bin smoke `sentinel --version`) — on every PR and push to main. A broken guard turns the pipeline red. The pipeline is green on this stacked PR (base = H2 branch `claude/scaffold-hexagonal-structure-dfq16n`, per PR #48 stacking rules — fixed context, not revisited here).

## Initial Scope Sketch

### Likely In Scope

- `.github/workflows/ci.yml` with the 3 jobs from setup §6, triggered on PR and push to main.
- Install **vitest** (exact pin, matching project pin policy) so `npm test` / `vitest run` exits 0 with no tests yet — minimal enablement only.
- Install **tsup** (exact pin) plus the minimal config needed for `npm run build` to emit `dist/cli.js` as the ESM bin.
- Minimal `--version` behavior in `src/main/cli.ts` (just enough for the smoke to pass), since the story description names the smoke explicitly.
- `package-lock.json` update from the devDep installs; `npm run check` stays green.

### Likely Out Of Scope

- `release.yml`, pr-title lint, Dependabot/Renovate (setup §6 lists them separately/optional — explicitly not this story).
- Real vitest configuration with core/adapters/e2e projects, fixtures, and any test content — owned by E0.F2.x.
- Real CLI wiring / composition root behavior beyond the minimal `--version` — owned by E6.F1.x.
- Any change to check-gate tooling (biome, tsc, depcruise configs) — landed in H1/H2.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Workflow shape | setup §6 pins jobs, steps, and matrix verbatim — near-zero design ambiguity for ci.yml itself | high |
| Tool enablement | Story description names vitest, tsup, and the bin smoke, so minimal enablement is in-scope by the story's own text; blast radius is devDeps + one config + a few lines in cli.ts | high |
| Green-on-this-PR constraint | Achievable: check is already green; vitest can pass with zero tests; tsup can bundle the current no-op cli with a `--version` branch added | medium-high |
| Boundary risk | Main risk is scope creep into E0.F2.x (test projects) or E6.F1.x (CLI wiring) — mitigated by pinning "minimal enablement" contracts in spec | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Zero-test strategy for vitest: `--passWithNoTests` flag vs minimal `vitest.config` vs one placeholder smoke test | Determines whether E0.F2.x inherits a clean slate or a stub to replace; affects whether `npm test` script changes | open → spec |
| tsup config shape: `tsup.config.ts` vs inline flags in the `build` script | Public repo-structure decision (protocol B flavor); setup §5.1 only says "tsup — ESM bundle of the bin" | open → spec |
| Minimal `--version` implementation: read version from `package.json` vs hardcode; and how the smoke invokes the bin (`node dist/cli.js --version` vs `npm exec sentinel`) | Boundary with E6.F1.x composition root; hardcoding risks drift, reading package.json touches bundling | open → spec |
| Matrix breadth: does only `test` matrix Node 22/24 (per §6 sketch) while `check` and `build` run on a single version (22)? | Affects CI minutes and failure semantics; §6 sketch matrixes only test — needs explicit confirmation | open → spec |
| Exact version pins for vitest and tsup | Project pins devDeps exactly; picking current stable is protocol-A but must be recorded | open → spec/design |

## Approval Notes

- Whole-change scope and auto mode pre-approved by user kickoff (ckp-001, 2026-08-01): proposal → spec → design → plan → executor → qa, autonomously.
- Phase checkpoint recorded as implicitly approved per ckp-001; open questions above are routed to `sddl-spec` as intended (they are resolution work for spec, not blockers for framing).
- Stacking context (branch from H2 tip b7f5e98, PR base = H2 branch, merge H2 review fixes if PR #48 moves) is fixed input from the kickoff — not a proposal decision.

## Budget Notes

- Kept lightweight per lite mode; spec owns firm boundaries and acceptance criteria.
