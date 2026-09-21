<!-- sddl-editable: content only; keep ## headings -->

# Commit Message Template

Headings in this file are the structure `sddl-delivery` reads. Everything under a heading is content you may rewrite.
Section bodies are guidance for drafting, not text to copy into the commit.
The drafted message follows `output_language`; this file stays in English.

## Format

```
<type>(<scope>): <summary>

[body]

[footer]
```

## Subject

- one line, always
- imperative mood: `add`, not `added` or `adds`
- at most 72 characters
- lowercase after the colon
- no trailing period
- no author, date, or co-author trailers

## Types

| Type | When |
|---|---|
| `feat` | new behavior or capability |
| `fix` | corrects a defect |
| `refactor` | restructures without changing behavior |
| `perf` | performance |
| `chore` | build, tooling, dependencies |
| `docs` | documentation only |
| `test` | adds or fixes tests |
| `style` | formatting only, no logic |
| `ci` | pipeline configuration |
| `revert` | reverts a prior commit |

## Scope

Take the scope from the module or layer the diff touches, resolved against the `## Important Directories` table in `./sdd-lite/project-context.md`.
When no directory row covers the changed paths, derive the scope from the paths themselves.
Never invent a scope, and never reuse a scope from another project.

## Body

Include a body only when at least one is true:

- the change spans more than one area or layer
- it has side effects that are not visible in the diff
- the reasoning behind the approach is worth preserving

Explain what changed and why. Never how — the diff is the how.
Omit the body entirely for a small, single-area, self-evident change.

## Footer

- `BREAKING CHANGE: <what breaks and what to do instead>`
- `Refs: <TICKET-REF>`

`<TICKET-REF>` is proposed only when it can be read from the branch name or from recent commit history, and it is never written without the user confirming it.

## Presentation

Present exactly one recommended message, followed by one line saying why it took that shape — why this type, this scope, and whether it carries a body.

Do not present a menu of alternatives. Offer to adjust the message instead.

If the diff mixes unrelated concerns, say the commit should be split and name the split, rather than writing one message that covers both.
