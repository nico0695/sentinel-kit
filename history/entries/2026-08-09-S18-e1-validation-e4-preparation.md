# S18 — E1 validation and E4 preparation

- **Date**: 2026-08-09
- **Branch**: `claude/validar-e1-preparar-e4-m1xkhl`
- **Scope**: project-state validation after the E1 merge · bootstrap refresh · seeding of the first E4 change
- **sdd-lite changes**: [`e4-f1-h1-run-review/`](../../sdd-lite/openspec/changes/e4-f1-h1-run-review/) (seeded, stage `sddl-proposal` pending)

## Objective

Validate the user's claim that E1 was complete and the project was ready for E4, then prepare
everything needed to open the first E4 sdd-lite change.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S18-D1 | Report E1 as complete-but-unmerged rather than accepting "E1 done" at face value | Trusting the session premise and going straight to E4 preparation | Issues #7-9 were open and `fixtures/` was empty on `main`; the work existed only in the unmerged PR #63. 4 of 5 E4 stories depend on it | `claude` |
| S18-D2 | User merged PR #63; re-validated afterwards instead of assuming the merge was clean | Proceeding on the user's confirmation alone | `main` moved to `f294af2`; re-ran the full gate against the merged tree — `npm run check` clean, `npm test` 163/163 | `claude→user` |
| S18-D3 | Close issues #7, #8 and #9 manually as `completed` | Leaving them open; asking first | PR #63 had an auto-generated title and no `Closes` footer, so the merge did not close them. Reversible (reopen) and unambiguously the residue of merged work | `claude` |
| S18-D4 | Refresh the stale sdd-lite bootstrap surgically instead of regenerating with `sddl-init` | Full `sddl-init` run (recommended to the user); proceeding without any refresh | Asked the user, got no answer. Chose the lower-blast-radius option: it avoids re-injecting the `CLAUDE.md` wrapper block and rewriting three files wholesale, and is reversible via git. Stated the assumption explicitly in chat | `claude` |
| S18-D5 | Scope the first E4 change to `[E4.F1.H1]` alone | Bundling `[E4.F1.H2]` (verdict parser) into the same change | Separate issues (#26, #27) with different risk profiles: H1 orchestrates against FakeEngine, H2 does defensive parsing against real E1 fixtures. Bundling would put both behind one approval gate | `claude` |
| S18-D6 | Execution mode for the session: `interactive` (sdd-lite contract default) | `auto` | Asked, no answer; took the contract's documented default and said so | `claude` |

## Deviations

- **Session premise was partially wrong.** The user opened with "I just completed E1", but on `main`
  E1 did not exist: PR #63 was open, unmerged, with issues #7-9 still open. The work itself was
  complete and green — the gap was purely the merge. Reported before doing any E4 preparation.
- **`history/INDEX.md` had drifted.** Entries S09, S10 and S13 existed under `history/entries/` but
  had no index rows. Restored in `5380fbb`. Cause unknown (predates this session).
- **Bootstrap preflight read `stale`, materially so.** `config.yaml` and `skill-catalog.md` still
  claimed vitest and tsup were not installed, recorded typescript as 7.0.2 (actual: 5.9.3), had
  `test_roots: []`, and listed the E1 engine spikes as unresolved unknowns in `risk_zones`. The
  orchestrator contract forbids starting code-touching execution on a materially stale bootstrap,
  so this was fixed before seeding the change rather than after.
- **Two consultations went unanswered** (bootstrap strategy, execution mode). Proceeded on the
  lower-risk option and the documented default respectively, both stated explicitly in chat and
  recorded in `state.yaml` checkpoint `cp-change-seed`.

## Work done

- **Validation against `main` @ `f294af2`**: `npm run check` clean (71 files, 51 modules, 88
  dependencies, 0 guard violations) and `npm test` 163/163 across 14 files. Epic status: E0 ✅,
  E1 ✅ (merged this session), E2 ✅, E3 ✅ — only ⚪ optional stories (#10, #16, #25) remain
  outside E4+.
- **Reviewed the E1 deliverable in PR #63 before the merge**: `docs/engines/claude-code.md` and
  `docs/engines/opencode.md` answer all four PRD §6.2 questions per engine; 6 fixtures per engine
  (criterion was ≥4); scanned all 12 fixtures for personal paths, tokens and emails — clean,
  anonymized to `/home/reviewer/...`.
- Closed issues [#7](https://github.com/nico0695/sentinel-kit/issues/7),
  [#8](https://github.com/nico0695/sentinel-kit/issues/8),
  [#9](https://github.com/nico0695/sentinel-kit/issues/9) as `completed`.
- `5380fbb` `docs(history): restore missing S09, S10 and S13 rows in the session index`
- `013355d` `chore(sddl): refresh stale bootstrap and seed e4-f1-h1-run-review change` — surgical
  refresh of `project-context.md`, `skill-catalog.md` and `openspec/config.yaml` against reality,
  plus the seeded change `state.yaml` (complexity assessment `continue-lite`/high, one resolved
  checkpoint, one pending `stage_approval`, two decisions, three open risks).
- No PR opened this session — nothing implementable landed yet.

## Pending and next steps

- **User**: approve launching `sddl-proposal` for `[E4.F1.H1]` (issue #26), or redirect
  (full `sddl-init` refresh, `auto` mode, or a different first E4 story).
- **Claude**, once approved: run the canonical lite flow (proposal → spec → design → plan →
  executor → QA) for `e4-f1-h1-run-review`, then `[E4.F1.H2]` (#27), then E4.F2 (#28-30).
- **Three open risks** recorded in `state.yaml` for the spec stage to resolve: terminal-state test
  coverage (`validation-failed` belongs to E5, `engine-error`/`timeout` are adapter concerns),
  the cleanup-on-error guarantee, and where the E5 validations seam is left open.
- **⚪ optional and untouched**: #10 (context-mode measurement), #16 (remove/update registration),
  #25 (auto-include target repo `AGENTS.md`).

## Open questions for the user

- Approval to launch `sddl-proposal` for `[E4.F1.H1]` — the session stops here until then.
- Confirm or override the two unanswered choices: surgical bootstrap refresh (vs. full `sddl-init`)
  and `interactive` execution mode (vs. `auto`).
