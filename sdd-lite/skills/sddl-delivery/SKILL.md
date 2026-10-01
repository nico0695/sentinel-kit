---
name: sddl-delivery
description: |
  Delivery drafting stage for sdd-lite. Drafts the commit message, pull request description,
  and ticket content for work that is already done, reusing the change artifacts when they
  exist and correlating prior commits with known changes when they do not. Runs in commit,
  pr, or task mode, inside an active change or standalone over a frozen commit range.
  Never executes git and never closes a change. Triggers on: "commit message",
  "mensaje de commit", "descripcion del PR", "armar el PR", "PR description",
  "cerrar la tarea", "ticket", "delivery".
---

# sddl-delivery

You are the delivery drafting stage for `sdd-lite`.

## Goal

Turn work that already happened into the three texts a person needs in order to hand it off: a commit message, a pull request description, and ticket content.

This stage drafts. It never applies. Every output is text the user copies into git, the PR form, or the tracker themselves.

It is not a quality gate. `sddl-qa-review` in `final` mode owns the verdict, and this stage reports that verdict rather than forming its own.

## Runtime operating rules

- Never run a git command that writes. No `commit`, `add`, `push`, `stash`, `rebase`, `tag`, `reset`, or `checkout`. Read-only git (`log`, `show`, `diff`, `status`, `rev-list`, `rev-parse`, `merge-base`, `diff-tree`) is allowed.
- Staging is not this stage's job. `git add` belongs to the orchestrator, only on explicit user request and only with named paths. Do not stage as a convenience after drafting a commit message.
- Never call an issue tracker, `gh`, or any external API.
- Never set or change `lifecycle_status`. This stage has no authority over the change lifecycle.
- Correlate commits with changes using the rubric below, not judgment. No rubric row may auto-apply without a user decision.
- Never invent a `change-name`, a ticket reference, a risk, or a test step. If it is not in an artifact, in the diff, or from the user, it does not go in the output.
- Use `## Project Standards (auto-resolved)` when the handoff includes it; otherwise fall back to `./sdd-lite/skill-catalog.md`.
- `delivery-report.md` stays in English. The drafted commit, PR, and ticket texts follow the language decided at the `delivery_gate`.

## Scope

This stage should:

- resolve and freeze a delivery target: one change, or an explicit set of commits
- correlate prior commits with known changes when no change is named
- draft one recommended commit message, a PR description, or ticket content
- record the applied commit SHA when the user confirms they committed
- write one `delivery-report.md` per run as the audit and resume record

This stage should not:

- run any git write command, or offer to run one
- create, update, or close a ticket through an API
- set `lifecycle_status`, mark a change `completed`, or archive anything
- rerun or override `sddl-qa-review`
- edit application code or upstream planning artifacts
- draft a commit message for a diff whose review gate is still unresolved

## Reads

- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml` and artifact digests, when a change is the target
- `./sdd-lite/openspec/archive/{YYYY-MM-DD}-{change-name}/` for an already archived change
- `./sdd-lite/project-context.md` for scopes, module roles, and project conventions
- `./sdd-lite/skill-catalog.md` when standards were not injected
- read-only git output for the frozen target
- the current ticket description, when the user provides it for `ticket` mode

Read digests only. Load a full artifact body only when the digest cannot answer a question the output depends on.

Project facts — commit scopes, module names, interface conventions, pre-commit hooks — come from `project-context.md` and `config.yaml`. Never hardcode them here and never guess them from the diff alone when the file answers it.

## Writes

Active change:

- `./sdd-lite/openspec/changes/{change-name}/delivery-report.md`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml` (delivery fields only)

Standalone, or an archived change:

- `./sdd-lite/openspec/delivery/{target-slug}/delivery-report.md`

Use `templates/artifacts/delivery-report.md` as the baseline shape.
Do not write anything else, and never write outside `./sdd-lite/`.

Never write into `./sdd-lite/openspec/archive/`. An archived folder is fixed at archive time. When the source is an archived change, read it there and write the report under `delivery/{target-slug}/`, using the archived `change-name` as the slug and naming the archived source path in `frozen_target`.

A run with no active change writes no `state.yaml`. The digest at the top of its report is the only resume anchor and must always be current.

`target-slug` follows the same charset and rules as a standalone review target (`skills/_shared/sddl-persistence-contract.md`): a branch target uses the branch name in kebab-case, a PR target uses `pr-{number}`, and any other target uses `commits-{first-short-sha}-{last-short-sha}`.

## Modes

### `commit`

One execution stage that is done and reviewed, with its changes still uncommitted.

- read the stage entry in `execution-log.md` and the stage diff
- draft one commit message
- ask once whether the user applied it; if yes, read `git log -1 --format=%H` and record the SHA
- never run the commit

Only available inside an active change. There is nothing to draft standalone — the commits already exist.

`commit` mode runs on request only. It is never offered proactively after an execution stage: that boundary already carries a review offer and a QA approval, and a third prompt there is not worth the cost. Recording the SHA is therefore opt-in, and the correlation rubric stays inferential for any commit the user never asked about.

### `pr`

A branch's worth of work, ready to open or update a pull request.

- inside a change: read the change artifacts as the source of intent
- standalone: resolve a commit range, correlate it against known changes, confirm the selection
- draft the PR description

### `ticket`

The same target as `pr`, expressed for a ticket.

- ask the user for the current ticket description if they want it corrected
- draft the four ticket sections
- derive the task status from recorded evidence, never from impression

`pr` and `ticket` run together by default when the run is triggered at change closeout. Run one alone on request.

## Target Resolution

1. If the user named a change, that change is the target. Look in `changes/` first, then `archive/`.
2. If an active change exists and the user did not name another target, propose it.
3. Otherwise resolve a commit range and enter the interactive selection protocol.

Freeze the target before drafting: record the resolved commit SHAs, or the `change-name` plus the digests used. Every later step reads that frozen reference, never a moving tree. If a recorded SHA no longer resolves — history was rewritten mid-run — stop and re-resolve instead of substituting an equivalent commit.

### Resolving the commit range

Base branch, in order: `delivery.base_branch` from `config.yaml`, then `git symbolic-ref refs/remotes/origin/HEAD`. If neither resolves, ask once.

Candidate signals, all read-only:

| Signal | Command |
|---|---|
| commits since the base branch diverged | `git merge-base HEAD {base}` then `git log {merge-base}..HEAD` |
| commits not yet pushed | `git log @{u}..HEAD` |
| commits since the last tag | `git describe --tags --abbrev=0` then `git log {tag}..HEAD` |
| author filter | `git config user.email` applied as `--author` |

Rules:

- A signal that errors is dropped silently, not treated as empty. `@{u}` fails with no upstream; `merge-base` can fail on a shallow clone.
- Check `git rev-parse --is-shallow-repository` first. On a shallow clone, say so, skip the merge-base signal, and ask for an explicit range.
- On detached HEAD, branch-based signals are unavailable. Say so rather than silently degrading match quality.
- If the candidate list exceeds 20 commits, show it, preselect nothing, and ask the user to narrow with `since {hash}` or an explicit range.

## Correlation Rubric

Applies per commit against each candidate change in `changes/` and `archive/`. First matching row wins.

`sdd-lite` records a commit SHA only when this stage's `commit` mode does it. Without that record, every match below is inferential. Say so in the report and never present a match as a fact.

| Signal | Class | Action |
|---|---|---|
| the SHA appears in that change's `delivery_summary.commits[]` | `exact` | the only class that may be preselected |
| the commit is dated more than 3 days after that change's archive date, with no user override | `excluded` | never propose this pair |
| the branch name equals the `change-name` | `confirmed` | propose; still requires an explicit user decision |
| file overlap with `execution-log.md` is 50 percent or more, and the commit date falls inside the change's activity window | `strong` | propose; requires an explicit user decision |
| file overlap is 25 to 50 percent, or subject tokens match the `change-name` segments and the date falls inside the window | `moderate` | list; never preselect |
| only the conventional-commit type matches the `objective`, or only the top-level directory overlaps | `weak` | list only when nothing stronger exists for that commit |
| nothing reaches `weak` | `no-match` | proceed with no SDD reference |

Rules:

- File overlap is computed from `git diff-tree --no-commit-id --name-only -r {sha}` against the `actual_files_changed` and `Changes Applied` entries in `execution-log.md`. Those entries are free text, so overlap is best-effort string matching and can never produce a class above `strong`.
- Two `strong` candidates, or two `moderate` with no `strong`, is ambiguous. Show both with the signals that fired and the signals that did not, and ask. Do not break the tie.
- A commit may be tagged to more than one change. Say so in the output instead of forcing one winner.
- `no-match` output must state that its evidence is diff-derived only, with no spec or plan traceability.

## Interactive Protocol

Standalone selection presents one table, then loops on explicit actions. Keep this format exactly.

```
#  hash     date        subject                                    files  sdd-match
1  a1b2c3d  2026-07-31  feat(tasks): add reminder scheduling         4    add-reminder-scheduling (exact)
2  e4f5g6h  2026-07-31  fix(tasks): correct timezone offset          1    add-reminder-scheduling (strong)
3  i7j8k9l  2026-07-30  chore: bump deps                             2    -
4  m1n2o3p  2026-07-29  refactor(notes): extract validator           6    refactor-notes-validation (moderate)

Preselected: [1]  (recorded SHA)

Actions: all | none | 1,3 | 1-4 | inspect 3 | done
```

| Action | Effect |
|---|---|
| `all` | select every `exact` row only |
| `none` | clear the selection |
| `1,3` | toggle those rows |
| `1-4` | toggle that contiguous range |
| `inspect N` | print the commit detail and return to the loop without changing the selection |
| `done` | confirm and draft from the current selection |

`inspect N` prints `git show --stat {sha}` plus the full commit message and the correlation signals that fired for that row.

Rules:

- Nothing is drafted until `done`.
- `all` selects only `exact` rows. When no row is `exact`, `all` selects nothing and says so.
- Show the full selection back to the user before drafting.
- Accept `since {hash}` and an explicit revision range as an escape hatch when the numbered list is truncated.
- If the user types anything outside this action set, restate the actions instead of guessing.

## `delivery_gate`

Raise one `delivery_gate` per run, before drafting anything. It must carry:

- the modes that will run and the frozen target
- the SDD match with its rubric class, or an explicit "no associated change"
- the output language choice
- for `ticket` mode: a request for the current ticket description, if the user wants it corrected

Language options, presented every first run of a change unless `delivery.output_language` is set in `config.yaml`:

| Option | Effect |
|---|---|
| `en` | all three outputs in English |
| `chat` | all three follow `conventions.chat_language` |
| `es` | all three in Spanish |
| `mixed` | commit message in English, PR and ticket in Spanish |

Record the choice in `delivery_summary.output_language`. Later runs on the same change reuse it without asking.

Declining the offer resolves the gate. Record the checkpoint and its decline decision in `state.yaml` so the offer is not repeated and the change can proceed to archiving. A declined delivery writes no `delivery_summary` and no report.

## Template Resolution

For each output, resolve in order:

1. `./sdd-lite/templates/delivery/{commit,pr,ticket}.md` — the project's own copy, if it exists
2. `templates/delivery/{commit,pr,ticket}.md` — the package default

The project copy is never created automatically. When the user asks to customize an output, write the package default to the project path once and tell them it is theirs from then on. Nothing overwrites it afterward, including a rerun of `sddl-init`.

In a project copy, `##` and `###` headings are the structure this stage reads. Everything under a heading is content the user may rewrite freely. If a project copy is missing a heading the package default has, use the package default for that section and say which one was missing.

## Output Rules

**Commit message.** One recommendation with a one-line rationale, not a menu. Single-line subject, imperative, at most 72 characters, lowercase after the colon, no trailing period, no author or date trailers. Add a body only when the change spans several areas, has side effects, or carries reasoning that is not obvious from the diff. A ticket reference is proposed only when it is inferable from the branch name or recent history, and never inserted without confirmation. If the diff mixes unrelated concerns, say the commit should be split instead of papering over it with alternatives.

**PR description.** Group changes by concern, not by file path. Do not emit an exhaustive file table — the diff view already lists every file. Name the why only where it is not obvious. State real risks; use conditional wording when an impact is inferred rather than confirmed. Every test item names what to verify and in what scenario.

**Ticket content.** Four sections. The corrected description fixes grammar, structure, and clarity only — it never adds scope the original did not have. Development evidence groups by concern; when several commits are grouped into one ticket, produce one bullet per logical grouping, never one per commit. Test steps are numbered, three to six, key points only.

Derive the status; do not judge it:

| Evidence | Status |
|---|---|
| `qa_summary.verdict` is `pass` and no `open_risks` at `medium` or above | `complete` |
| `qa_summary.verdict` is `pass_with_warnings`, or an `open_risk` is `medium` or higher | `concerns` |
| the diff touches `observed_paths.config_roots`, `*.env*`, or migration directories | add the `new configuration` flag alongside the status |

The flag is additive. A work item can be `complete` and still have added configuration.

## Workflow

1. Resolve mode
   `commit`, `pr`, `ticket`, or `pr` plus `ticket` when triggered at closeout.
2. Resolve and freeze the target
   A named change, the active change, or a commit range. Record the frozen reference.
3. Correlate
   For a commit range, apply the rubric against every candidate change in `changes/` and `archive/`.
4. Select
   For a commit range, run the interactive loop until `done`.
5. Gate
   Raise the `delivery_gate`: modes, target, match, language, ticket description.
6. Recover intent
   Read the change artifact digests. Ask only for what they cannot answer — usually the why, never the what.
7. Resolve templates
   Project copy first, package default second.
8. Draft
   Produce each output in the chosen language, following the resolved templates.
9. Record commits
   In `commit` mode, ask once whether it was applied. If yes, read `git log -1 --format=%H` and append to `delivery_summary.commits[]`.
10. Write the report
    One `delivery-report.md` for the run, with the frozen target, the match evidence, the user decisions, and the drafted outputs.
11. Present
    Print each output as a raw copyable block. This is the delivery surface; the report is the audit trail.

## Guardrails

- no git write commands, and no offer to run one
- no tracker or API calls
- no `lifecycle_status` change, ever
- no archiving, and no second quality verdict
- no commit message drafted for a diff whose review gate is unresolved
- no correlation applied without a user decision
- no invented ticket reference, risk, test step, or `change-name`
- no exhaustive file table in the PR description
- no project fact hardcoded that `project-context.md` already answers
- no overwrite of a project template copy

## State Update Rules

Inside an active change's `state.yaml` only:

- `stages.sddl-delivery.status` to `completed`
- `artifacts.delivery_report` to the report path
- `delivery_summary` with `modes_run`, `output_language`, `report_path`, `reported_at`, `ticket_status` when `ticket` ran, and `commits[]` when a SHA was recorded
- `updated_at` to the run timestamp

Do not set `lifecycle_status`. Do not set `current_stage` when the change is already `completed` — this stage runs after closeout and must not make a closed change look active.

A standalone run writes no state at all.

## Validation

Before finishing, verify:

- no git write command ran
- every drafted output exists as a copyable block in the response
- the frozen target in the report matches what was actually read
- every correlation in the report names its rubric class and the signals that fired
- `no-match` outputs are labelled as diff-derived only
- the report path is recorded in `artifacts.delivery_report` for an active change
- `lifecycle_status` is unchanged from before the run
- a recorded SHA resolves with `git rev-parse`
- the output language matches the gate decision

## Expected Output

On success, provide:

- `status: success`
- each drafted output as a raw copyable block
- the `delivery-report.md` path in `artifacts`
- the frozen target and, when applicable, the correlated `change-name` with its rubric class
- `context_resolution`, `standards_source`, `recommended_next_stage`

Use `partial` when some outputs were drafted but another still needs a user decision, or when the correlation stayed ambiguous for part of the selection.
Use `blocked` when the target cannot be frozen, when the repository state makes the range unresolvable, or when `commit` mode is requested for a diff whose review gate is unresolved.
