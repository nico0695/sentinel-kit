# Design

## Routing Digest

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Create 3 files under harnesses/quick/ following the established harness pattern. harness.md is a distilled version of pr-review covering only Correctness + Critical Design with REJECT-level rules.
- affected_areas_digest: harnesses/quick/ (new directory, 3 new files)
- interfaces_digest: No code interfaces -- content-only files consumed by prompt assembly

## Summary

- change_name: e3-f2-h3-quick-harness
- objective: new-feature
- route: continue-lite
- design_status: approved

## Design Overview

The quick harness follows the same 3-file structure as pr-review and security harnesses:

1. **harness.md** (~40-60 lines): Distilled from pr-review, keeping only Correctness and Critical Design (subset of Design) domains. Only REJECT-level rules are included -- REQUIRE and PREFER rules are omitted to keep focus on blockers/majors. The Review Guidelines section is compressed to the essentials. The Role section explicitly instructs the reviewer to skip minor/nit findings.

2. **output.md** (49 lines): Exact duplicate of `harnesses/pr-review/output.md`. The verdict + findings contract is universal across all harness types.

3. **skills.yaml** (2 lines): Empty skills list with inline context mode. The quick harness stands alone without composable skills.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `harnesses/quick/harness.md` | New file, ~40-60 lines | low -- content only |
| `harnesses/quick/output.md` | New file, duplicate of pr-review/output.md | none -- exact copy |
| `harnesses/quick/skills.yaml` | New file, 2 lines | none -- trivial |

## Interfaces, Data, And State

- No code interfaces affected. These are content files consumed by the prompt assembly pipeline (not yet implemented -- lands in E4).
- The output contract (VERDICT + findings) is shared across all harness types, ensuring consistent downstream parsing.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Include REQUIRE rules too | Rejected | REQUIRE rules add length and shift focus toward thoroughness, contradicting the "fast lane" goal |
| Include Maintainability domain | Rejected | Story specifies only Correctness + Critical Design |
| Reference skills | Rejected | Story specifies no skills for minimal overhead |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | Design is fully determined by established patterns | n/a | resolved |

## Approval Notes

- Implicitly approved via orchestrator handoff.
