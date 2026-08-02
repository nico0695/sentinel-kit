# S07 — Project standards + contributor documentation

- **Date**: 2026-08-02
- **Branch**: `claude/docs-standards`
- **Scope**: non-backlog governance/docs change — a human-first English standards doc set + wiring it to the AI/sdd-lite validators
- **sdd-lite changes**: [docs-standards](../../sdd-lite/openspec/changes/docs-standards/) (`lifecycle_status: completed`, lightweight) — [proposal](../../sdd-lite/openspec/changes/docs-standards/proposal.md) · [spec+design](../../sdd-lite/openspec/changes/docs-standards/design.md) · [plan](../../sdd-lite/openspec/changes/docs-standards/plan.md)

## Objective

With E0 complete, distil the project's now-stable standards into a small,
easy-to-read English documentation set that explains the architecture and the
allowed/forbidden rules, tells a contributor how to work, and is wired so the
AI / sdd-lite validators check work against those same standards — one source of
truth, not a fourth copy that drifts.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S07-D1 | Doc set = `README.md` + `CONTRIBUTING.md` (root) + `docs/architecture.md` + `docs/coding-standards.md` + `docs/testing.md` + wiring; run as lightweight sdd-lite; architecture under `docs/` | Minimal 3-doc set; only the 2 named; full dual-per-stage sdd-lite | User picked the recommended 5-doc set + wiring and the lightweight process (AskUserQuestion), and placed architecture under `docs/` | `user` |
| S07-D2 | Single source of truth — docs explain what/why, `.dependency-cruiser.cjs` enforces, sdd-lite validates against the docs; each doc references, never copies, its source | Copy the rules into the docs standalone | Anti-drift so the doc set scales without desync across the guard file, `CLAUDE.md`, PRD §4, and the docs | `claude` |
| S07-D3 | Skip `LICENSE`, ADRs, `SECURITY.md`/`CODE_OF_CONDUCT.md`, PR/issue templates | Include the classic OSS set | LICENSE is an open PRD decision (issue #44, deferred to E7); `history/` + sdd-lite already are the decision record (ADRs would duplicate); the rest is premature pre-publish | `claude→user` |
| S07-D4 | Author the docs in-session rather than via fresh-context workers; single blind validator at the end | Fresh-context stage workers per doc | Context-rich prose benefits from full-project context; the lightweight protocol calls for one final validation, not dual-per-stage | `claude` |

## Deviations

- **Committer signature** — commits land Unverified (no signing key in this environment); committer email is correct. Same environmental limitation as S05/S06; not actionable.
- **PRD §4.3 wording vs. shipped code** — the port catalog in `architecture.md` shows `ReviewEngine → raw output + usage` (the shipped thin H1 port, dec-004), which refines PRD §4.3's older "raw output + verdict" text. The single validator flagged the tension (INFO); resolved with a clarifying note in `architecture.md` (`4176f94`) so the doc is self-consistent with its "sources win" preamble. Not a rule change — a documentation-accuracy fix.
- No code/guard/PRD/backlog change; docs-only.

## Work done

- **New branch** `claude/docs-standards` from `origin/main` (the E0.F2.H2 PR #51 was already merged; this is fresh, non-backlog work).
- **4 commits** `b08c499`..`4176f94`. `10f7124 docs: project standards + contributor documentation` (7 files, 432 insertions): the 5 docs + the 2 wiring edits (`CLAUDE.md` Source-of-truth pointer, `sdd-lite/skill-catalog.md` Project-Standards lead-in — additive, no injectable bullet deleted). `4176f94` the validator INFO-1 fix. `b08c499` the lightweight sdd-lite planning bundle.
- **Lightweight sdd-lite flow**: proposal → combined spec/design → plan → execute → single final validation. [change artifacts](../../sdd-lite/openspec/changes/docs-standards/).
- **Final validation** (single blind read-only): **PASS**, 0 blocker / 0 warning, 2 INFO. Traceability confirmed against `.dependency-cruiser.cjs`, PRD §4, `tsconfig.json`, `vitest.config.ts`, and the shipped contract code; all five guards match, cross-links resolve, no invented/relaxed rule, no scope leak.
- **Gate green**: `npm run check` exit 0 and `npm test` exit 0 (docs-only; guards/tests undisturbed).
- Branch pushed to `origin/claude/docs-standards`.

## Pending and next steps

- **PR** — offered on the user's request: `docs: project standards + contributor documentation` (non-backlog, no `Closes #N`). **Owner: user** to request/merge. (Never merge / never push main; max 5 open PRs — currently 0.)
- **Next epic** — E0 is closed; E1 (engine spike) / E2 (repos & git) / E3 (harnesses & prompt) are parallel and open. The epic pick was raised (recommendation: E2 or E3, both buildable against FakeEngine without E1). **Owner: user** to choose. **Owner: next session** to execute.

## Open questions for the user

—
