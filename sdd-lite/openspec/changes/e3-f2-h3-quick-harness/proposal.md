# Proposal

## Routing Digest

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Create the quick factory harness -- a lightweight, fast-feedback review harness that focuses only on blockers and majors (Correctness + Critical Design domains).
- feasibility_signal: high -- follows established harness pattern from pr-review and security harnesses
- scope_sketch_digest: 3 new files under harnesses/quick/ (harness.md, output.md, skills.yaml), no code changes

## Summary

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: false

## Problem And Desired Outcome

The sentinel CLI needs a fast-feedback review option. The existing pr-review harness (~100 lines) is thorough but slow. Users need a "quick lane" that finds only blockers and major issues (correctness bugs and critical design flaws), skipping minors, nits, maintainability, testing, and documentation concerns. The quick harness must produce the same verdict + findings output contract as pr-review, enabling consistent downstream processing regardless of which harness was used.

## Initial Scope Sketch

### Likely In Scope

- `harnesses/quick/harness.md` (~40-60 lines): lightweight review instructions covering only Correctness and Critical Design domains
- `harnesses/quick/output.md`: identical to pr-review output contract (VERDICT + findings format)
- `harnesses/quick/skills.yaml`: empty skills list with inline context mode

### Likely Out Of Scope

- New composable skills
- Code changes to src/
- Changes to existing harnesses

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Pattern exists | pr-review and security harnesses establish the 3-file pattern | high |
| Output contract reusable | output.md is identical across harness types | high |
| Content-only change | No code, no dependencies, no build impact | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| None | Scope is fully determined by story description and existing patterns | resolved |

## Approval Notes

- Implicitly approved via orchestrator handoff with full context.
