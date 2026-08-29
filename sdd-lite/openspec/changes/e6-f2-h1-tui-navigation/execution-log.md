# Execution Log

- change_name: e6-f2-h1-tui-navigation
- executor: sddl-executor (batch 1: S1–S2 approved for this invocation)
- plan source: `plan.md` (Stage Plan table, authoritative)

## Stage Overview

| Stage Id | Goal (short) | Status |
|---|---|---|
| S1 | Pin + install `@clack/prompts` (exact, no `^`), record resolved version | done-flagged (version outside expected line — awaiting orchestrator decision) |
| S2 | Behavior-preserving refactor of `src/main/container.ts` | not-started (held by the S1 flag) |
| S3 | TUI contract + minimal renderer + test doubles | pending |
| S4 | `runTuiFlow`/`createTui` + five behavioral suites | pending |
| S5 | clack prompter, barrel, `createTuiDeps`, argv dispatch | pending |
| S6 | CLAUDE.md closeout (D0/AC-14) | pending |

## S1 — Pin + install `@clack/prompts`

- approval: `stage_approval` granted by the user for S1–S6 (handoff envelope, batch 1 covers S1–S2).
- preparation: `npm ci` restored the baseline toolchain (node_modules was absent in this environment). Succeeded.
- command: `npm install --save-exact @clack/prompts` — succeeded through the configured proxy (risk-e6f2h1-004 did not materialize).
- **resolved version: `1.7.0` (exact-pinned, no `^`)**.
- changed files:
  - `package.json` — adds `"@clack/prompts": "1.7.0"` to `dependencies` (only change).
  - `package-lock.json` — lockfile entries for `@clack/prompts` and its transitive deps.

### FLAG — resolved version outside the expected 0.10–0.11.x line (risk-e6f2h1-001)

design.md §Resolution 1 expected the current line at 0.10–0.11.x and delegated exact-version confirmation to install time. Registry facts gathered as decision evidence:

- `1.x` is now the **stable** line: ten stable releases `1.0.0 … 1.7.0`; `latest` resolves to `1.7.0`.
- The last `0.x` release is `0.11.0`.
- API surface check against the installed `1.7.0` (ESM import): `select`, `confirm`, `spinner`, `isCancel`, `intro`, `outro` are all exported functions — the design's cancel-as-value mechanism (`isCancel` → `PromptOutcome.cancel`) and the S3–S5 interface plan remain mechanically compatible as far as export presence shows. Behavioral API details (option shapes, spinner start/stop signatures) not yet exercised — that happens in S5.
- Options for the orchestrator: (a) keep `1.7.0` — actively maintained stable line, design rationale for the pin ("prompt libraries move fast pre-1.0") arguably *strengthens* the case for the 1.x stable line; (b) pin `0.11.0` to stay inside the design's stated expectation. Recommendation: (a), recorded as the executor's suggestion only — per the handoff, a major jump needs orchestrator eyes, so no stage past S1 was started.

### S1 quick checks

| Command | Outcome |
|---|---|
| `npm install --save-exact @clack/prompts` | success; resolved `1.7.0` |
| `npm run check` (biome + tsc + depcruise) | clean — no lint/type errors, no dependency violations (98 modules, 232 dependencies cruised) |
| `npm test` (full suite) | **39 files passed, 708 tests passed**, 0 failed |

Note on the baseline count: the handoff states 707 tests / 39 files; the suite at current HEAD (`7b4b17b`) runs **708/39 green** with a working tree containing only the two S1 files above, so the extra test predates this stage — the 707 figure in plan/handoff is one off versus HEAD, not a regression. New effective baseline to protect from S2 onward: **708 tests / 39 files**.

- blockers: none technical; stage held at the version flag per handoff ("do not proceed past a flag silently").
- git: no commits performed (orchestrator owns git operations); working tree carries `package.json` + `package-lock.json` modified.

## Next Action

Orchestrator (with the user if B-level): decide the `@clack/prompts` pin — keep `1.7.0` (executor's recommendation) or repin to `0.11.0` (`npm install --save-exact @clack/prompts@0.11.0`). Then re-invoke `sddl-executor` for S2 (container refactor); S2 was **not** started in this invocation.
