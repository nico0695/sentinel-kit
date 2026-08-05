# Plan

## Execution Digest

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Single-stage content authoring — create 4 files in one atomic step.
- stage_plan_digest: 1 stage, 4 files, no code, no tests.
- validation_digest: File existence, content conventions (REJECT/REQUIRE/PREFER), skills.yaml schema, composability check.

## Summary

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: approved

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Create security harness and security skill | none | `harnesses/security/harness.md`, `harnesses/security/output.md`, `harnesses/security/skills.yaml`, `skills/security.md` | AC-1 through AC-8: files exist, conventions followed, output contract matches pr-review, skill composable | no | yes | pending |

## Validation Strategy

After S1 completes, validate:

1. **File existence**: all 4 files present at their expected paths.
2. **Harness conventions (AC-1, AC-8)**: `harness.md` uses REJECT/REQUIRE/PREFER keywords, is ~80-120 lines, has a clear role statement and security-specific review domains.
3. **Output contract (AC-2, AC-6)**: `output.md` contains the VERDICT line requirement, severity levels (blocker/major/minor/nit), findings format with file:line, summary section, and ambiguity rule. Content matches pr-review's output.md.
4. **Skills config (AC-3)**: `skills.yaml` is valid YAML with `skills: ["security"]` and `contextMode: inline`, conforming to `HarnessSkillsSchema`.
5. **Security skill (AC-4, AC-5)**: `skills/security.md` is ~60-90 lines, covers secrets, injection, authz, dependencies, and data handling as distinct sections. File is self-contained (composable).
6. **Vulnerability focus (AC-7)**: review domains in harness.md are security-specific, not duplicating code-quality concerns.
7. **Quality gate**: `npm run check` passes (no TypeScript changes, but confirms no regressions).

## Dependencies And Sequencing

- Single stage with no internal dependencies.
- External dependency: E3.F2.H1 (pr-review harness) is complete and on this branch. Its output.md content is the source for the security harness output.md.
- No code changes means no risk of breaking existing loaders or tests.

## Planner Stop Note

- Objective is `new-feature`, not `planner`. Execution proceeds after stage approval.

## Approval Notes

- User indicated advancement. Stage approval required before execution per canonical rules.
- Single-stage plan is proportional to the low complexity of content-only authoring.
