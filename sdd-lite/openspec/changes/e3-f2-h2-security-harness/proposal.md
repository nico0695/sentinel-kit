# Proposal

## Routing Digest

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Create the `security` factory harness and a composable `security` skill for vulnerability-focused code review.
- feasibility_signal: high — identical pattern to pr-review harness (E3.F2.H1), all infrastructure in place.
- scope_sketch_digest: 4 new content files (harness.md, output.md, skills.yaml, skills/security.md), no code changes.

## Summary

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: false

## Problem And Desired Outcome

The sentinel tool needs a security-focused review harness as the second factory harness (after pr-review). The current pr-review harness covers general code quality (correctness, design, maintainability, testing, documentation) but does not specialize in vulnerability detection. Users reviewing security-sensitive code need a dedicated harness that focuses on secrets/credentials in code, injection vulnerabilities, authorization/authentication flaws, dependency security, and sensitive data handling.

The desired outcome is a `security` harness type that: (a) follows the same file structure and output contract as pr-review, (b) provides a composable `security` skill that other harnesses can reference, and (c) delivers vulnerability-focused review instructions using the REJECT/REQUIRE/PREFER keyword convention.

## Initial Scope Sketch

### Likely In Scope

- `harnesses/security/harness.md` — security-focused review role and instructions
- `harnesses/security/output.md` — same verdict contract as pr-review (reuse content)
- `harnesses/security/skills.yaml` — references the `security` skill
- `skills/security.md` — composable security checklist (secrets, injection, authz, dependencies, data handling)

### Likely Out Of Scope

- Changes to existing pr-review harness files
- Code changes to loaders, assembler, or any TypeScript
- Adding the security skill to pr-review's skills.yaml

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Pattern established | pr-review harness (E3.F2.H1) defines the exact file structure and conventions | high |
| Infrastructure ready | loadHarness, loadSkill, assemblePrompt all handle new harnesses without code changes | high |
| Output contract stable | output.md is reusable as-is across harness types | high |
| Content-only change | No TypeScript, no tests, no schema changes required | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| None | All patterns resolved by E3.F2.H1 | resolved |

## Approval Notes

- User already indicated advancement ("produce all 4 sdd-lite artifacts in sequence"). Implicitly approved.
