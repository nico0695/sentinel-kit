# sddl-user-interaction-contract

This contract defines how `sdd-lite` asks the user for decisions without turning the workflow into a questionnaire.

## Core rules

- Ask only when the answer changes scope, risk, direction, quality, or the chosen execution path.
- Do not ask for facts already recoverable from `config.yaml`, `state.yaml`, bootstrap artifacts, maintained docs, or executable project files.
- Keep prompts short, contextual, and explicit about why the question matters.
- Persisted keys, artifact content, and structured decision records stay in English even when chat uses Spanish.

## Checkpoint types

| Type | When to use it | Required |
|---|---|---|
| `language_selection` | bootstrap cannot infer `es` or `en` confidently | conditional |
| `missing_context` | essential context cannot be recovered safely | conditional |
| `scope_change` | the requested work expands or redirects materially | conditional |
| `risk_review` | two viable paths have meaningful trade-offs | conditional |
| `phase_validation` | between formalization phases to confirm output before advancing | conditional — skip when the user already approved advancement implicitly |
| `stage_approval` | immediately before a code-touching execution stage | mandatory when code will change |
| `macro_plan_review` | the best lite path is to stop and write `macro-plan.md` first | conditional |
| `review_gate` | offering a post-execution code review, approving a review fix round, or adjudicating a judge contradiction | conditional — mandatory before any fix round and for every judge contradiction |
| `escalation_review` | the request no longer fits safe lite execution | conditional |
| `final_review` | final QA found warnings, blockers, or a closeout decision is still needed | conditional |
| `archive_review` | confirming which changes get archived and with which disposition | mandatory before any archive move |
| `delivery_gate` | confirming the delivery target, its change correlation, and the output language before drafting | mandatory before `sddl-delivery` drafts anything |

## Standard checkpoint shape

Each checkpoint should be representable with:

- a short summary
- a concrete question
- 2 to 4 options when options are useful
- one recommended option when the system has a justified preference
- free-form input allowed

## `phase_validation` minimum content

Each `phase_validation` checkpoint should include:

- phase name and artifact written
- a concise summary of the artifact content
- the next phase that would follow

Recommended options:

- approve and continue
- revise this phase
- stop

Smart behavior:

- If the user already indicated advancement (e.g., "continue with spec", "go ahead"), skip the checkpoint and record it as implicitly approved.
- If there is ambiguity in scope, risk, or multiple plausible interpretations, always present the checkpoint.
- If the artifact contains open questions or risks above medium severity, always present the checkpoint.

## `stage_approval` minimum content

Each `stage_approval` checkpoint should include:

- stage id
- stage goal
- expected file or module scope
- whether the stage touches code
- the quick validation planned after the stage

Recommended options:

- approve this stage
- pause
- revise the plan first

## `macro_plan_review` minimum content

Each `macro_plan_review` checkpoint should include:

- why the request is too large for direct execution
- the expected output of `macro-plan.md`
- what work would remain after the macro plan

Recommended options:

- create the macro plan
- narrow the scope
- stop

## `review_gate` minimum content

Each `review_gate` checkpoint should include:

- the review protocol (`sddl-code-review` or `sddl-judgment-day`) and target
- the gate purpose: offer review, approve a fix round, or adjudicate a contradiction
- the current ledger digest (counts and verdict) when a ledger exists
- for fix rounds: the confirmed ledger ids and the suggested fix route
- for contradictions: both judges' claims and evidence, side by side

Recommended options by purpose:

- offer review: run the review / skip / run judgment-day instead
- fix round: approve the fix route / defer findings / stop
- contradiction: accept judge A / accept judge B / dismiss both / investigate manually

## `escalation_review` minimum content

Each `escalation_review` checkpoint should include:

- why lite is no longer the safe path
- the recommended escalation target
- the unresolved risks or unknowns driving the escalation

Recommended options:

- escalate to `sdd-v2`
- narrow the request and stay in lite
- stop

## `final_review` minimum content

Each `final_review` checkpoint should include:

- the QA verdict
- remaining warnings or blockers
- the recommended next action

Recommended options:

- accept and close
- return for fixes
- hold for review

## `archive_review` minimum content

Each `archive_review` checkpoint should include:

- the candidate changes with `change-name`, lifecycle status, age, QA verdict, and proposed disposition
- the rubric class behind each proposal, so the user can see why it was proposed
- any detected related-change cluster, labelled as informational only
- for `batch` mode: the action set (`all`, `none`, indices, ranges, `inspect N`, `skip N`, `done`)

Recommended options for `single` mode:

- archive with the proposed disposition
- change the disposition
- keep the change active

Rules:

- Nothing moves before the user resolves this checkpoint.
- Only `ready` candidates may be preselected. `stale-candidate` and `blocked-candidate` rows require an individual confirmation.
- A change proposed as `abandoned` needs a one-line reason from the user before it executes.
- `inspect N` answers from persisted digests and returns to the same checkpoint without changing the selection.
- Unrecognized input restates the action set instead of being interpreted.

## `delivery_gate` minimum content

Each `delivery_gate` checkpoint should include:

- the modes that will run (`commit`, `pr`, `ticket`) and the frozen target
- the correlated `change-name` with its rubric class, or an explicit statement that no change is associated
- the output language question, unless `delivery.output_language` is set in `config.yaml`
- for `ticket` mode: a request for the current ticket description, when the user wants it corrected
- for a commit range: the action set (`all`, `none`, indices, ranges, `inspect N`, `done`)

Output language options:

| Option | Effect |
|---|---|
| `en` | all three outputs in English |
| `chat` | all three follow `conventions.chat_language` |
| `es` | all three in Spanish |
| `mixed` | commit message in English, pull request and ticket in Spanish |

Recommended options for a named change:

- draft with the proposed modes
- change the modes
- stop

Rules:

- Nothing is drafted before the user resolves this checkpoint.
- Only commits whose correlation class is `exact` may be preselected. Every other class requires an explicit decision.
- An ambiguous correlation is presented with both candidates and the signals that fired for each. It is never resolved by the system.
- The output language is recorded once per change and reused on later runs without asking again.
- `inspect N` answers from read-only git output and returns to the same checkpoint without changing the selection.
- Unrecognized input restates the action set instead of being interpreted.
- This gate confirms drafting only. Nothing it resolves applies a commit, opens a pull request, or writes to a tracker.
- Declining the offer resolves the gate and is recorded as a decision. A declined delivery is a resolved delivery: the offer is not repeated, and downstream routing may proceed.

## Decision recording

`state.yaml` should record checkpoints under `checkpoints[]` with at least:

- `id`
- `type`
- `stage`
- `summary`
- `question`
- `options`
- `free_input_allowed`
- `created_at`
- `resolved_at`

`state.yaml` should record decisions under `decisions[]` with at least:

- `id`
- `checkpoint_id`
- `selected_option_id`
- `free_text`
- `rationale`
- `recorded_at`

## Result rules

- Use `blocked` when no safe next step exists without a decision.
- Use `partial` when useful work exists but the next safe move still depends on the user.
- The recommended next action must make the unblock path explicit.

## Avoided patterns

- asking the user to restate repository facts already in bootstrap
- requiring confirmation for obvious mechanical choices
- offering too many weak options when only one or two are defensible
