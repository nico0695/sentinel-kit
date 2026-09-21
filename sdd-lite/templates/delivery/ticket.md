<!-- sddl-editable: content only; keep ## headings -->

# Ticket Template

Headings in this file are the structure `sddl-delivery` reads. Everything under a heading is content you may rewrite.
Section bodies are guidance for drafting, not text to copy into the ticket.
The drafted content follows `output_language`, including its section headings; this file stays in English.

The four sections below are delivered separately so each can be pasted into a different field of the tracker.

## Corrected Description

Take the ticket description the user pasted and return it with structure, grammar, and clarity fixed.

Rules:

- Never add scope the original did not have. Rewriting is not re-specifying.
- Never remove a requirement because the implementation skipped it. That is a `concerns` status, not an edit.
- Keep the author's intent and register. This is their ticket.
- Add a short `Correction notes:` line only when a change was material — a contradiction resolved, an ambiguity that needed a decision. Skip it for cosmetic fixes.
- When the user provides no description, skip this section entirely rather than inventing one.

## Development Evidence

What was actually built, grouped by concern.

Rules:

- Same grouping rule as the PR: by concern, never by file, never by commit.
- When several commits are grouped into one ticket, produce one bullet per logical grouping. A commit-by-commit dump is not evidence, it is a log.
- Less technical register than the PR description. The reader may be a PM or a tester, not a reviewer.
- Source the content from `execution-log.md` when a change is associated, cross-checked against the commit diffs.
- When no SDD change is associated, say the evidence is derived from the diff only, with no spec or plan traceability.

## How To Test

Three to six numbered steps.

Rules:

- Steps, not concepts. Each one is something a person does.
- Key paths only. Do not enumerate every branch of every case.
- Name the expected result for each step.
- Never write a step that amounts to "check that it works".
- Include the preconditions that are not obvious: required role, feature flag, seed data.

## Status

```
- item type: task | story | bug | feature | other
- complete: yes | no | partial
- pending: <what is left, when partial>
- new configuration: yes | no — <what was added>
- points of attention: <what QA or the reviewer should know, or "none">
```

Status is derived from recorded evidence, not from impression:

| Evidence | Status |
|---|---|
| QA verdict `pass` and no open risk at `medium` or above | `complete` |
| QA verdict `pass_with_warnings`, or an open risk at `medium` or higher | `partial` with the risk named under `pending` |
| no QA review ran | say so plainly; do not report a status the evidence does not support |

`new configuration` is `yes` when the diff touches config roots, environment files, or migration directories. It is independent of the status — a task can be complete and still have added configuration.
