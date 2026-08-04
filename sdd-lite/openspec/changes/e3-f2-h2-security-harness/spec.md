# Spec

## Routing Digest

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Security factory harness with composable security skill, same output contract as pr-review.
- scope_digest: 4 new content files under harnesses/security/ and skills/; no code changes.
- acceptance_digest: Same verdict format, security skill composable, vulnerability domains covered.

## Summary

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- spec_status: approved

## Scope Boundary

### In Scope

- `harnesses/security/harness.md` — role, review domains, and review guidelines for security-focused reviews (~80-120 lines)
- `harnesses/security/output.md` — verdict and findings output contract (same content as pr-review's output.md)
- `harnesses/security/skills.yaml` — skill references (`["security"]`, contextMode `inline`)
- `skills/security.md` — composable security checklist (~60-90 lines) covering secrets, injection, authz, dependencies, and data handling

### Out Of Scope

- Any TypeScript code changes (loaders, assembler, schemas, ports)
- Modifications to existing pr-review harness or code-quality skill
- Adding the security skill to pr-review's skills.yaml (users can do this via repos.yaml)
- Test files (content-only deliverables, no testable code)

### Non-Goals

- Runtime security scanning or SAST tool integration
- Dependency vulnerability database lookups
- Automated fix suggestions for security findings

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `loadHarness("security")` | Returns Harness with security instructions, output contract, and skills: ["security"] | Same loading infrastructure as pr-review |
| `assemblePrompt` with security harness | Produces prompt with security role + security skill + output contract + diff | Deterministic assembly per E3.F1.H2 |
| Security review produces verdict | Output follows VERDICT: approve/request-changes/comment + [SEV] findings format | Identical output.md contract |
| Other harness references security skill | skills.yaml with `["code-quality", "security"]` loads both skills | Composability via skill reference |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `harnesses/security/harness.md` exists with security-focused role and review domains | File present, ~80-120 lines, uses REJECT/REQUIRE/PREFER keywords | required |
| AC-2 | `harnesses/security/output.md` exists with same verdict contract as pr-review | Content matches pr-review output.md format (VERDICT + findings + severity + summary) | required |
| AC-3 | `harnesses/security/skills.yaml` references `["security"]` with contextMode `inline` | Valid YAML matching HarnessSkillsSchema | required |
| AC-4 | `skills/security.md` exists as a composable security checklist | File present, ~60-90 lines, covers secrets/injection/authz/dependencies/data-handling | required |
| AC-5 | Security skill is composable by other harnesses | Another harness's skills.yaml can list "security" and loadSkill resolves it | required |
| AC-6 | Output contract matches pr-review (same VERDICT + findings format) | Verdict line, severity levels, file:line format, summary section all present | required |
| AC-7 | Review domains focus on vulnerability detection | Domains cover secrets, injection, authz, dependencies, data handling — not general code quality | required |
| AC-8 | Harness follows PRD section 5.2 conventions | REJECT/REQUIRE/PREFER keywords, ~100-200 lines total, actionable rules | required |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Overlap between security and code-quality domains | Low | By design: security harness covers vulnerability-specific patterns; code-quality covers general patterns. Minimal overlap at error handling. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | Pattern fully established by E3.F2.H1 | n/a | resolved |

## Approval Notes

- User indicated advancement. Implicitly approved to continue with design.
