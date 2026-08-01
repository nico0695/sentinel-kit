# S04 — Story [E0.F1.H3]: CI pipeline with quality + guard enforcement

- **Date**: 2026-08-01
- **Branch**: `claude/e0-f1-h3-ci-pipeline-2gliny`
- **Scope**: [E0.F1.H3] (issue #4, PR #49) — stacked on [E0.F1.H2]
- **sdd-lite changes**: [e0-f1-h3-ci-pipeline](../../sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/)

## Objective

Land the GitHub Actions `ci.yml` (setup §6) so nothing enters `main` without passing the quality gate + architecture guards: 3 jobs (check / test matrix 22·24 / build + `sentinel --version` smoke), broken guard = red pipeline. Stacked on H2 (guards) which was still under review at kickoff.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S04-D1 | Minimal tooling enablement is in H3 scope: install vitest + tsup, add a minimal `--version` | Leave test/build jobs referencing uninstalled tools (would fail); defer to E0.F2.x | Story AC requires all 3 jobs green on this PR; the story text itself names vitest, tsup, and the bin smoke | `claude` |
| S04-D2 | `vitest run --passWithNoTests`, no vitest config file | Commit a minimal vitest projects config now | Keeps the projects config a clean E0.F2.x deliverable; flag exits 0 today, fails correctly once real tests land | `claude` |
| S04-D3 | `--version` reads package.json via a static JSON import attribute (esbuild-inlined) | `createRequire`+require (breaks from dist/ path); fs.readFile + import.meta.url | Immune to the dist(-1)-vs-src(-2) path difference; guard-clean, dependency-free, passes NodeNext strict | `claude` |
| S04-D4 | check + build on Node 22; test matrixes [22, 24] | Full matrix on all jobs | Matches setup §6 verbatim; 22 is the engines floor | `claude` |
| S04-D5 | vitest `4.1.10` + tsup `8.5.1`, exact pins (registry-verified) | Caret ranges | Repo convention (all devDeps exact); compat verified vs Node 22/24 + TS 5.9.3 | `claude` |
| S04-D6 | Concurrency cancels superseded **PR** runs only, not main pushes | No concurrency block (setup §6 sketch omits it) | Saves CI on PR churn without cancelling protected main builds; recorded as beyond-sketch (change dec-008) | `claude` |
| S04-D7 | Open PR #49 against `main` directly (not the H2 branch) | Base = `claude/scaffold-hexagonal-structure-dfq16n` per kickoff | PR #48 merged to main (merge commit) mid-session; H2 tip is now an ancestor of main, so the diff vs main is already exactly the 6 H3 files — the destination the kickoff anticipated on H2 merge | `claude` |
| S04-D8 | Run final QA inline instead of a fresh delegated worker | Retry the delegated worker | The delegated qa worker died on an API spend-limit error mid-run; CLAUDE.md degradation policy permits inline with recorded loss of isolation + persisted evidence | `claude` |

## Deviations

- **H2 branch moved mid-session (review fixes).** PR #48 received `5057e41` (segment-anchored guard regexes from Copilot review). Per the kickoff rule, merged the updated H2 branch into this branch (`69eb284`) before continuing; re-verified `npm run check` green. The effective story diff-bound baseline became `5057e41`, superseding the plan's `b7f5e98` (recorded as a note in the executor log, not a deviation).
- **PR #48 merged to main during QA.** Merged as a merge commit (`4871aba`), so H2 history is in main and the H3 diff vs main is clean — PR opened against main (S04-D7).
- **Red-demo biome short-circuit (change dev-001).** A naive appended forbidden import trips biome `noUselessEmptyExport` before depcruise runs. Used a biome-clean *replace* variant so the red proof is attributed to depcruise (`error core-no-io-libs`, exit 1). Reproduced independently in QA.
- **Spend-limit interruption (S04-D8).** The delegated final-QA worker terminated on an API monthly-spend-limit error; QA completed inline with fresh evidence, degradation recorded in `qa-report.md`.
- **`tsconfig.json` added to the diff bound (change dec-009).** `resolveJsonModule: true` needed for the JSON import attribute under NodeNext strict — one file beyond the minimal ci.yml footprint.

## Work done

- sdd-lite change `e0-f1-h3-ci-pipeline` run full-flow (proposal → spec → design → plan → executor S1+S2 → 4R review → final QA), each stage as a fresh delegated worker except final QA (inline, S04-D8). Commits: `1818e69` proposal, `8bef7bd` spec, `5d45b7e` design, `2e00906` plan, `e34d8eb` feat S1 (vitest/tsup + `--version`), `e3e87e5` feat S2 (ci.yml), `8a9a859` 4R review ledger, `f9b711d` QA closeout. Merge: `69eb284` (H2 review fixes).
- **PR #49** opened → `main`, `Closes #4`, dec-008/dec-009/risk-004 surfaced. https://github.com/nico0695/sentinel-kit/pull/49
- Validations: `npm run check` green (biome 18 files, tsc, depcruise 14 modules/0 violations), `npm test` green (`passWithNoTests`), `npm run build` + smoke `node dist/cli.js --version` → `0.0.0`, `npm run dev` exit 0. Guard red-proof: forbidden `node:fs` in `src/core/shared/index.ts` → check exit 1 at depcruise, reverted → green.
- **4R review**: standard tier, reliability lens, 0 findings, verdict pass ([ledger](../../sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/review-ledger.md)). **Final QA**: pass ([report](../../sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/qa-report.md)).
- **AC-07 verified post-push**: all 4 CI check runs on PR #49 green — check, test (22), test (24), build (Actions run 30720103831).

## Pending and next steps

- **User**: review and merge PR #49 (Claude never merges). — owner: user
- **E0.F2.x hand-off duty**: when the real vitest projects config lands, **remove `--passWithNoTests`** or an empty test glob passes silently (change risk-004). — owner: whoever picks up E0.F2.x
- E0.F1 is now fully in review/merged (H1 #47 merged, H2 #48 merged, H3 #49 open). Next feature E0.F2 (base contracts: `ReviewEngine` port + `FakeEngine` contract suite). — owner: user to direct

## Open questions for the user

—
