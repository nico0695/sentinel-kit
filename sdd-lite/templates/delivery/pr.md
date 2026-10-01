<!-- sddl-editable: content only; keep ## headings -->

# Pull Request Template

Headings in this file are the structure `sddl-delivery` reads. Everything under a heading is content you may rewrite.
Section bodies are guidance for drafting, not text to copy into the PR.
The drafted description follows `output_language`, including its section headings; this file stays in English.

## What Changed

Two to four sentences. What the change does and why it exists.
Describe behavior, not implementation. The reader is deciding whether to review, not reading the diff yet.

## Main Changes

Three to six bullets, grouped by concern, never by file path:

```
- **<concern or area>**: <what changed> — <why, only when it is not obvious>
```

Rules:

- One bullet covers several files when they serve one concern. That is the point of the grouping.
- Omit generated files, lockfiles, and formatting-only churn.
- Do not produce an exhaustive file table. The diff view already lists every file, and repeating it adds nothing.
- Add the why only where a reviewer would otherwise ask. Not every bullet needs one.

## Impact And Risks

Bullets naming the areas a reviewer should think about.

Rules:

- Be specific: name the endpoint, job, or module, not "the module".
- State a confirmed impact plainly. Use conditional wording when the impact is inferred from the diff rather than verified.
- Only real risks. An empty section is better than a hypothetical one — write `none identified` and mean it.
- Flag event handlers, shared singletons, global state, and migrations explicitly when the diff touches them.

## How To Test

Checklist items, each naming what to verify and in what scenario:

```
- [ ] <action or scenario> → <expected result>
```

Never write an item that amounts to "check that it works".

## Additional Context

Optional. Include only when it exists: migration steps, related PRs, known limitations, follow-up work deliberately left out.
Omit the whole section when there is nothing.
