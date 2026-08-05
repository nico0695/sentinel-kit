# Design

## Routing Digest

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- digest_summary: 4 content files following the pr-review pattern. No code, no interfaces, no state changes.
- affected_areas_digest: harnesses/security/ (new directory, 3 files), skills/security.md (new file)
- interfaces_digest: None — uses existing Harness, Skill, HarnessSkillsConfig types unchanged.

## Summary

- change_name: e3-f2-h2-security-harness
- objective: new-feature
- route: continue-lite
- design_status: approved

## Design Overview

This is a pure content-authoring change. The technical approach mirrors E3.F2.H1 (pr-review harness) exactly:

1. Create `harnesses/security/` directory with three files following the established structure.
2. Create `skills/security.md` as a composable checklist.
3. No code changes — the existing `loadHarness`, `loadSkill`, and `assemblePrompt` infrastructure handles new harnesses and skills by convention (directory name = harness type, filename = skill name).

The security harness differentiates from pr-review by focusing its review domains exclusively on vulnerability detection rather than general code quality. The five security domains are: secrets and credentials, injection vulnerabilities, authentication and authorization, dependency security, and data handling.

The output contract (`output.md`) is identical to pr-review's — same VERDICT line, same severity levels, same findings format. This ensures all harness types produce uniform output that the verdict parser (E4.F1.H2) and run store (E5.F2.H1) handle identically.

The security skill (`skills/security.md`) is designed for composability: it is self-contained and does not assume it runs inside the security harness. Any harness can add `"security"` to its skills.yaml to gain security awareness.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `harnesses/security/harness.md` | New file: security review role + 5 vulnerability domains + review guidelines | None — new directory |
| `harnesses/security/output.md` | New file: same content as pr-review output.md | None — proven contract |
| `harnesses/security/skills.yaml` | New file: `{ skills: ["security"], contextMode: "inline" }` | None — validated schema |
| `skills/security.md` | New file: composable security checklist (~60-90 lines) | None — follows code-quality.md pattern |

## Interfaces, Data, And State

No interface, data, or state changes. The new files conform to existing types:

- `harness.md` content becomes `Harness.instructions` (string)
- `output.md` content becomes `Harness.outputContract` (string)
- `skills.yaml` is parsed against `HarnessSkillsSchema` (zod)
- `security.md` content becomes `Skill.content` (string)

All types defined in `src/core/review/ports/harness-schemas.ts` remain unchanged.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Share output.md via symlink or reference | Rejected: duplicate the file | Simplicity — each harness is self-contained; avoids symlink issues across platforms and in npm package |
| Include code-quality skill in security harness | Rejected: security skill only | Security harness is specialized; mixing general code quality dilutes the focus. Users can compose both via repos.yaml. |
| Single large security harness without a separate skill | Rejected: separate skill | Composability is an acceptance criterion. The skill must be independently referenceable. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| None | Pure content authoring, all technical patterns resolved | n/a | resolved |

## Approval Notes

- User indicated advancement. Implicitly approved to continue with plan.
- A-level decision: duplicate output.md rather than share via symlink (reversible, aligned with pr-review pattern).
- A-level decision: security-only skill list for the harness (specialized focus, composability preserved via repos.yaml).
