# Plan — docs-standards

Single execution stage (docs are low-risk, cohesive). No `npm ci` precondition
needed for authoring; the gate re-run at the end uses the already-installed
toolchain.

## Stage S1 — write the docs + wiring (in order)

1. `docs/architecture.md` — the anchor; other docs link to it.
2. `docs/coding-standards.md` — links to architecture + testing.
3. `docs/testing.md` — the contract-suite walkthrough.
4. `CONTRIBUTING.md` (root) — links to the three docs above.
5. `README.md` (root) — links to everything; written last so its map is final.
6. `sdd-lite/skill-catalog.md` — add the SSoT lead-in + "see <doc>" pointers to
   the "Project Standards (auto-resolved)" section (keep the existing bullets).
7. `CLAUDE.md` — one-line pointer to the standards docs (no rule moved).

## Acceptance gate

- `npm run check` exit 0 and `npm test` exit 0 (docs-only must not disturb the
  gate; biome only lints files in its `files.includes`, which does not include
  `*.md` — confirm no unintended lint scope).
- `git diff --name-only` touches only: the 5 docs, `sdd-lite/skill-catalog.md`,
  `CLAUDE.md`, and the sdd-lite change artifacts. No `src/`, no
  `.dependency-cruiser.cjs`, no PRD/backlog.
- Single blind read-only validator confirms AC-1..AC-6 (traceability,
  English-only, links resolve, no invented/relaxed rule, no scope leak).

## Traceability

| AC | Proven by |
|---|---|
| AC-1 | S1 steps 1–5 (five docs at agreed paths, English, outlined sections) |
| AC-2 | S1 step 1 (guards as ALLOWED/FORBIDDEN + examples + source refs) |
| AC-3 | Validator traceability check (every rule → PRD/guard/CLAUDE source) |
| AC-4 | S1 steps 6–7 (skill-catalog + CLAUDE.md reference the docs) |
| AC-5 | Validator link check |
| AC-6 | Gate: `npm run check` + `npm test` green; diff-scope check |

## Rollback

Delete the 5 new docs; revert the `sdd-lite/skill-catalog.md` and `CLAUDE.md`
edits. No code touched, so the gate is unaffected either way.

## Notes

- Not a backlog story → no `Closes #N`. The PR (on request) is titled e.g.
  `docs: project standards + contributor docs`.
- Never merge / never push main; max 5 open PRs (currently 0).
