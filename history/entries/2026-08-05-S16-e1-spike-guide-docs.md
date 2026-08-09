# S16 — E1 spike working guide (docs/todo/E1)

- **Date**: 2026-08-05
- **Branch**: `claude/project-status-backlog-ocdf7f`
- **Scope**: E1 preparation (issues #7, #8, #9, #10) — guide documents only, no story implementation
- **sdd-lite changes**: —

## Objective

Review project status after E3 closed, then produce a complete working guide for Epic E1
(Engine Spike) under `docs/todo/E1/`, since the user will execute E1 manually (the spikes
require real, authenticated CLI sessions on the user's machine).

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S16-D1 | Guide docs live in `docs/todo/E1/` (README + 00-prerequisites + one doc per story) | Single monolithic doc | User request (folder location); per-story docs with a shared skeleton are easier to follow | `user` |
| S16-D2 | Spike *results* (canonical invocation docs) go to `docs/engines/<engine>.md`, not into the todo docs | Fill templates in place under `docs/todo/` | Permanent deliverable referenced by E4 should not live in a "todo" folder; templates embedded in guides | `claude→user` |
| S16-D3 | Include the optional E1.F1.H4 guide doc (04-context-modes.md) | Skip per workflow rule 7 | User confirmed "etapa 1 completa" includes preparing H4; executing it remains optional | `claude→user` |
| S16-D4 | Added shared `00-prerequisites.md` (test repo with planted findings, worktree + merge-base diff, engine auth checks, version pinning) | Duplicate setup in each spike doc | Both spikes need the identical environment; single setup avoids drift | `claude` |
| S16-D5 | CLI flags in guides presented as candidates to verify, never as fact | Assert known flags as canonical | PRD risk #1 (breaking changes in delegated CLIs); the spike verifies against the installed version | `claude` |
| S16-D6 | Proposed fixtures layout: `fixtures/<engine>/<case>.{json,txt}` + per-engine `META.md` (version, invocation, exit codes, sanitization log) | Flat files, no metadata | Contract tests (E4) reference cases by stable name; bytes alone can't record exit codes/signals | `claude` |
| S16-D7 | Guide authoring treated as sdd-lite-exempt documentation work | Run as sdd-lite change | Not a story implementation (the stories are the spikes themselves, executed by the user); recorded here per audit policy | `claude` |

## Deviations

—

## Work done

- Verified project status: E0/E2/E3 merged; E1 not started; nothing of E4 begun (only E0-era
  ports/FakeEngine exist in `src/core/run` and `src/adapters/driven/engines`).
- Deep analysis of E1 against `docs/backlog-mvp-sentinel.md`, `docs/prd-sentinel.md` §6,
  the `ReviewEngine` port, FakeEngine, and the shared contract suite.
- Created `docs/todo/E1/`: `README.md` (index, epic summary, E1→E4 dependency map, port
  contract, DoD checklist), `00-prerequisites.md`, `01-spike-claude-code.md`,
  `02-spike-opencode.md`, `03-capture-fixtures.md`, `04-context-modes.md`. Each story doc
  follows the same skeleton: objective → context → what to resolve → protocol → alternatives
  with recommendation → result template → checklist.

## Pending and next steps

- User executes E1 manually following the guides (H1/H2 in any order → H3; H4 optional),
  producing `docs/engines/claude-code.md`, `docs/engines/opencode.md`, and `fixtures/`.
- After E1: E4 unblocks fully. E4.F1.H1 (`runReview` vs FakeEngine) could start in parallel
  with E1 if desired — it does not depend on it.

## Open questions for the user

—
