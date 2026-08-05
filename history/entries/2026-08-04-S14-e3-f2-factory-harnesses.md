# S14 — E3.F2 factory harnesses: pr-review, security, quick

- **Date**: 2026-08-04
- **Branch**: `claude/epic-e3-factory-harnesses-myl1ra`
- **Scope**: [E3.F2.H1] (issue #22), [E3.F2.H2] (issue #23), [E3.F2.H3] (issue #24) — PR #62
- **sdd-lite changes**:
  - [`e3-f2-h1-pr-review-harness`](../sdd-lite/openspec/changes/e3-f2-h1-pr-review-harness/)
  - [`e3-f2-h2-security-harness`](../sdd-lite/openspec/changes/e3-f2-h2-security-harness/)
  - [`e3-f2-h3-quick-harness`](../sdd-lite/openspec/changes/e3-f2-h3-quick-harness/)

## Objective

Create all three factory harnesses for E3.F2 (pr-review, security, quick) — content-only authoring into the harness loading infrastructure built in E3.F1. Each harness gets `harness.md`, `output.md`, `skills.yaml`, and shared skills where appropriate.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S14-D1 | One `code-quality` skill for pr-review, security deferred to its own skill | Include security tips in code-quality | Separation of concerns; composable skills are more flexible | `claude` |
| S14-D2 | Deterministic verdict mapping: any blocker/major forces `request-changes` | Allow engine discretion on verdict | Prevents engine from approving PRs with listed blockers; deterministic = parseable | `claude` |
| S14-D3 | Verdict selection rules in `output.md`, not `harness.md` | Place in harness.md alongside review instructions | Verdict is an output concern; harness.md covers *what* to review, output.md covers *how to format* | `claude` |
| S14-D4 | Duplicate `output.md` per harness (identical copies) | Symlink or shared reference | Self-contained harnesses; avoids cross-platform symlink issues in npm package | `claude` |
| S14-D5 | Security harness references only `["security"]` skill, not also `code-quality` | Include both skills | Keeps the harness specialized; users compose via `repos.yaml` when needed | `claude` |
| S14-D6 | Quick harness uses REJECT-only (no REQUIRE/PREFER) | Include all three keyword types | REQUIRE produces majors (acceptable) but PREFER produces minor/nit which quick explicitly skips; REJECT-only is internally consistent | `claude` |
| S14-D7 | Quick harness has empty skills list | Reference code-quality | Minimal review = minimal setup; skills add latency and context the quick path doesn't need | `claude` |
| S14-D8 | All three stories share one PR (PR #62) | One PR per story from separate branches | All are same feature (E3.F2), content-only, trivially related — CLAUDE.md allows this | `claude` |

## Deviations

- **S13 missing from INDEX.md**: the history index jumps from S12 to S14. The E3.F1 session (harness loading, prompt assembler, contextMode) and E2.F3 session were logged as S13 in a prior conversation but the index was not updated consistently. No impact on this session's work.

## Work done

- `6e5c31c` chore(sddl): add proposal and spec for e3-f2-h1-pr-review-harness
- `3fddc0f` chore(sddl): add design and plan for e3-f2-h1-pr-review-harness
- `f4bfd20` feat(review): add pr-review factory harness [E3.F2.H1]
- `2f08e0a` chore(sddl): complete final QA review for e3-f2-h1-pr-review-harness
- `10455ee` chore(sddl): add planning artifacts for e3-f2-h2-security-harness
- `65f86a3` feat(review): add security factory harness [E3.F2.H2]
- `ea48c72` chore(sddl): complete final QA review for e3-f2-h2-security-harness
- `30e0090` feat(review): add quick factory harness [E3.F2.H3]
- `5e358bd` chore(sddl): complete final QA reviews for e3-f2-h2 and e3-f2-h3
- PR #62 created and updated to cover all three stories (closes #22, #23, #24)
- All three sdd-lite changes completed (proposal → spec → design → plan → executor → QA, all `completed`)
- `npm run check` passes for all deliverables (0 lint issues, 0 type errors, 0 dependency violations)

### Deliverables summary

| Harness | harness.md | output.md | skills.yaml | Shared skill |
|---------|-----------|-----------|-------------|-------------|
| pr-review | 100 lines, 5 domains, 58 keyword occurrences | 49 lines, VERDICT + findings | `["code-quality"]`, inline | `skills/code-quality.md` (48 lines) |
| security | 80 lines, 5 vulnerability domains, 37 keywords | 49 lines (identical to pr-review) | `["security"]`, inline | `skills/security.md` (61 lines) |
| quick | 40 lines, 2 domains, REJECT-only | 49 lines (identical to pr-review) | `[]`, inline | (none) |

## Pending and next steps

- **PR #62 review and merge** — owner: `user`
- **E3.F2.H4** (AGENTS.md inclusion) — marked ⚪ optional, skipped per workflow contract
- **E3 complete** after PR #62 merges (E3.F1 already merged: PRs #59, #60, #61)
- **Next epic**: E4 (Review engine) — starts with E4.F1.H1 (runReview use case) and E4.F1.H2 (verdict parser)

## Open questions for the user

—
