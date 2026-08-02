# Proposal — docs-standards

## Problem

The project's standards exist but are scattered and agent-first. Today the rules
live in `.dependency-cruiser.cjs` (executable), `CLAUDE.md` (agent guidance), and
`docs/prd-sentinel.md` §4 (origin). There is no human-first, distilled,
canonical layer a contributor (or a fresh reviewer) can read to answer "how is
this project structured, what may I do, what may I not, and how do I work here".
E0 is now complete (scaffold, guards, CI, the `ReviewEngine` port, FakeEngine +
contract suite), so the standards are stable enough to distill.

## Desired outcome

A small, English, easy-to-read documentation set that (a) explains the
architecture and the allowed/forbidden rules that keep order as the codebase
scales, (b) tells a contributor how to work (setup, commands, branch/PR
workflow), and (c) is wired so the AI / sdd-lite validators check work against
these same standards — one source of truth, not a fourth copy that drifts.

## Scope sketch

IN (this change):
- `README.md` (root) — entry point: what sentinel is, current status, links out.
- `CONTRIBUTING.md` (root) — minimal: prerequisites, install, the commands, the
  branch/PR workflow, a pointer to sdd-lite and the standards docs.
- `docs/architecture.md` — the hexagonal structure, the border rule, the five
  guards as ALLOWED / FORBIDDEN with concrete examples, port/adapter rules,
  naming, the review-flow shape. Strict but not exhausting.
- `docs/coding-standards.md` — naming, error handling, terminal states, testing
  taxonomy, TypeScript strictness — the code standards the AI validates against.
- `docs/testing.md` — the vitest projects, how to run one project/test, the
  contract-suite pattern (how a new engine adapter reuses it), fixtures.
- Wiring: reference these docs from `CLAUDE.md` and
  `sdd-lite/skill-catalog.md`'s "Project Standards (auto-resolved)" so per-stage
  validators cite them; keep `.dependency-cruiser.cjs` as the enforcement.

OUT (non-goals):
- `LICENSE` — an open PRD decision (MIT vs. private, issue #44 / PRD §8 open-6),
  deferred to E7; creating it now pre-empts that decision.
- ADRs (`docs/adr/`) — `history/` + sdd-lite change artifacts already are the
  decision record; an ADR tree would duplicate.
- `SECURITY.md` / `CODE_OF_CONDUCT.md` — premature (pre-publish); revisit at E7.
- PR/issue templates — optional, not part of this change.
- Any code change, guard-rule change, or PRD/backlog edit. Docs distill existing
  rules; they do not invent or relax any.

## Single-source-of-truth principle

Docs explain the WHAT/WHY; `.dependency-cruiser.cjs` is the enforced WHAT;
sdd-lite validates against the docs + guards. Each doc references, never copies,
the authoritative source (PRD §4, the guard file). This is the anti-drift rule
that lets the doc set scale.

## Feasibility

High. Pure documentation + two reference edits; fully reversible; no code, no
gate risk. Content is a faithful distillation of PRD §4/§5, §9 glossary, the
guard file, `CLAUDE.md`, and `docs/setup-tecnico-sentinel.md` §5.4.

## Mode

Lightweight sdd-lite (user decision): proposal → combined spec/design → plan →
execute → single final validation. Not a backlog story (governance/docs), so no
`E*.F*.H*` id. Authoring is done in-session (context-rich prose benefits from
full-project context) rather than via fresh-context workers; the final
consistency check runs as one blind read-only validator.

## Open questions

- Placement: `README.md` + `CONTRIBUTING.md` at root (GitHub special files),
  the three content docs under `docs/`. `architecture.md` under `docs/` per the
  user. Recommendation adopted; no blocking question.
