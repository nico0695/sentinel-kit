# QA Report — e0-f1-h3-ci-pipeline (final mode)

## Verdict

- mode: final
- verdict: **pass** (with one explicitly-owned pending observable: AC-07, post-push)
- completion_allowed: yes
- reviewed_at: 2026-08-01T21:45:00Z
- target: branch `claude/e0-f1-h3-ci-pipeline-2gliny`, story commits e34d8eb (S1) + e3e87e5 (S2); effective story baseline 5057e41 (H2 tip after PR #48 review fixes)

> Execution note: this final QA ran **inline in the orchestrator**, not as a fresh delegated worker — the delegated `sddl-qa-review` worker terminated on an API spend-limit error mid-run (after confirming the diff bound, before the red-demo cycle). Per the CLAUDE.md fresh-context degradation policy, the loss of context isolation is recorded here explicitly; every AC below was re-verified with fresh independent command evidence and state was persisted immediately.

## Acceptance criteria — fresh evidence

| AC | Verdict | Fresh evidence (this QA pass) |
|---|---|---|
| AC-01 | pass | `.github/workflows/ci.yml` read: exactly 3 jobs. check = `npm ci` → `npm run check`; test = matrix → `npm ci` → `npm test`; build = `npm ci` → `npm run build` → `node dist/cli.js --version`. Jobs call npm scripts, never raw tools. |
| AC-02 | pass | `on:` block = `pull_request:` (unfiltered — fires on the stacked PR whose base is the H2 feature branch) + `push: branches: [main]`. |
| AC-03 | pass | check + build `node-version: 22`; test `strategy.matrix.node: [22, 24]` (dec-005). |
| AC-04 | pass | `npm test` → "No test files found, exiting with code 0", exit 0. `package.json` test script = `vitest run --passWithNoTests`; `vitest` pinned `4.1.10` exact (no `^`/`~`). |
| AC-05 | pass | `npm run build` → `ESM dist/cli.js 785.00 B`, build success. `node dist/cli.js --version` → `0.0.0`, exit 0, equal to `node -p "require('./package.json').version"` → `0.0.0`. `tsup` pinned `8.5.1` exact. Smoke command shape matches ci.yml build step verbatim. |
| AC-06 | pass | Evidence chain complete. (a) check job runs `npm run check` verbatim. (b) H2 recorded red proofs. (c) QA re-ran the local red demo independently: forbidden `import { readFileSync } from "node:fs"` in `src/core/shared/index.ts` → `npm run check` exit 1 with `error core-no-io-libs: src/core/shared/index.ts → fs` (biome + tsc passed, **depcruise** failed — the guard reddens the pipeline); reverted → check green (14 modules, 0 violations); porcelain clean. The naive-append biome trip (dev-001) was reproduced first, then the biome-clean replace variant reached the depcruise step — both consistent with the execution log. No broken commit ever pushed. |
| AC-07 | **pending (owned)** | 3 jobs green on the real stacked PR — not verifiable pre-push. Owned by orchestrator post-plan mechanics: open the PR (base = H2 branch), then watch the checks tab (risk-008/dec-011 chain). This is the expected shape for a CI story; the pipeline itself is byte-verified and locally equivalent. |
| AC-08 | pass | At branch tip: `npm run check` green (biome 18 files, tsc clean, depcruise 14 modules/0 violations) and `npm test` green. `tsup.config.ts` present in `biome.json` `files.includes` (18 files checked incl. it). |
| AC-09 | pass (amended) | `git diff --stat 5057e41 HEAD` (excl. package-lock.json + sdd-lite/**) = exactly: `.github/workflows/ci.yml`, `biome.json`, `package.json`, `src/main/cli.ts`, `tsconfig.json`, `tsup.config.ts`. Amendment dec-009: `tsconfig.json` (`resolveJsonModule: true`) extends the original AC-09 list — recorded, in-bound, surfaced. Nothing under `src/core/` or `src/adapters/`. |
| AC-10 | pass | `src/main/cli.ts` read: node-builtin-free at runtime — uses a static JSON import attribute (`import pkg from "../../package.json" with { type: "json" }`, esbuild-inlined) + a `--version` branch; no core imports. depcruise green (the file is under `src/main`, guard-clean). |

## Deviations / amendments validated for visibility

- **dec-008** — concurrency block (cancel superseded PR runs only; main pushes never cancelled) goes beyond the setup §6 sketch. Justified in design.md; PR description must surface it.
- **dec-009** — `tsconfig.json resolveJsonModule: true` extends the AC-09 diff bound by one file. Required for the JSON import attribute to typecheck under NodeNext strict. Recorded, in-bound.
- **dev-001** — the red-demo forbidden import was injected as a biome-clean *replace* of the empty export (not a raw append), because an appended import trips biome `noUselessEmptyExport` before depcruise runs. QA independently reproduced both behaviors. Evidence contract (depcruise-attributed red) satisfied.
- **risk-004** (medium, future duty) — E0.F2.x MUST remove `--passWithNoTests` when it lands the real vitest projects config; otherwise an empty/misconfigured test glob would pass silently. Must reach the PR description as a handoff note.

## Gaps recorded honestly

- AC-07 is the only AC not locally verifiable; it is conditionally passed pending the post-push checks, explicitly owned by the orchestrator. The rest of the pipeline is byte-exact and command-level equivalent to the locally-green scripts.
- ci.yml has no authoritative *local* validation (no actionlint installed); mitigated by byte-exact copy from design §1, the dec-011 structural checklist (8/8), YAML parse validity, and the AC-07 watch (risk-008).

## Next action

Completion allowed. Route to orchestrator post-plan mechanics: the QA + review artifacts are already committed; open the stacked PR (base `claude/scaffold-hexagonal-structure-dfq16n`, title `[E0.F1.H3] CI pipeline`, `Closes #4`, surfacing dec-008 / dec-009 / risk-004), then verify the 3 checks green on the PR (AC-07), and write the history entry before closing.
