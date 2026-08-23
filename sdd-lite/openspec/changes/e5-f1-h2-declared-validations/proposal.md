# Proposal

## Routing Digest

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- digest_summary: Story `[E5.F1.H2]` (issue #32) closes the loop PRD §3.1-E describes: repo-declared scripts run **in the review worktree**, and their output becomes review context. Every structural piece it needs already exists on `main` — `RepoEntry.validations?: string[]` (`repos/ports/config-schemas.ts:38`), the `ProcessRunner` port + execa adapter (`[E5.F1.H1]`, merged), `assemblePrompt`'s `validationOutput` seam rendering `<validation-output>` (`review/assemble-prompt.ts:80-87`), `runReview`'s passthrough of `request.validationOutput` with a literal `/* --- 5. (E5 validations seam …) --- */` placeholder (`run/run-review.ts:363`), and `RunRecord.validationOutput` persisted one-file-per-entry as `validations/NNN.log` (`history/ports/run-store.ts:59`). What is missing is the thing in the middle: nothing reads `validations`, nothing invokes `ProcessRunner`, and nobody turns a declared string into a runnable `(command, args)` pair.
- feasibility_signal: high on mechanics, medium on decisions — the code surface is small and every collaborator is merged and tested, but the story carries an unusually high ratio of genuine forks per line of code (seven decision candidates below, three of them B-level), plus one cross-module compile-time ripple that is invisible until you try it.
- scope_sketch_digest: IN = a validations execution unit in `src/core/run` consuming `ProcessRunner`, tokenization of declared strings under `shell: false`, wiring into `runReview`'s reserved stage 5, the evidence shape fed to `assemblePrompt`/`RunStore`, and the `classifyFailure` gap `[E5.F1.H1]`'s spec recorded. OUT = composition-root wiring (E6.F1), any auto-detection, parallel execution, CLI/TUI surface, retrofitting the engine seams, process-group kill hardening.

## Summary

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (seven decision candidates, three B-level)
- exploration_performed: true

## Problem And Desired Outcome

PRD §3.1-E is two bullets, and both are unimplemented:

> - ✅ Scripts declared per repo (lint/test/typecheck) executed in the worktree, output injected into context
> - ✅ Only scripts explicitly in config — never auto-detection

`repos.yaml` can already declare them (`RepoEntrySchema.validations: z.array(z.string()).optional()`), the prompt can already render them, the run store can already persist them — but the declaration is inert. `grep` over `src/` finds exactly one production reference to `validations` outside the schema line itself, and it is the seam comment in `run-review.ts` naming this story.

Concretely, the four gaps this story closes:

1. **Nobody reads `RepoEntry.validations`.** The value round-trips through `ConfigStore` and stops.
2. **Nobody calls `ProcessRunner.run`.** `[E5.F1.H1]` shipped the port and adapter deliberately uncalled; `src/core/run/index.ts`'s own header says "no caller yet".
3. **Declared strings are not runnable.** The port takes `command` + `args` separately and the adapter pins `shell: false` (`adapters/driven/exec/process-runner-exec.ts:66` — verified directly, the predecessor spec's claim holds). `"npm test"` is one string; nothing turns it into `("npm", ["test"])`, and doing it wrong is how a shell-injection surface gets reintroduced through the back door.
4. **A failed validation has no defined effect on the run.** The backlog is explicit — *"validation failures don't abort the review (they are reflected)"* — but `runReview`'s `classifyFailure` (`run-review.ts:423-439`) currently maps neither `InvalidProcessRequestError` nor `ProcessSpawnError`, so both fall through to `engine-error`. This is the gap `[E5.F1.H1]`'s spec recorded as a downstream constraint; **verified still present on `main`** at `beb5d48`.

Desired outcome: a repo that declares `validations: ["npm run lint", "npm test"]` gets those two commands run in order inside the review worktree, each under its own timeout, with their output visible in the persisted prompt and in `validations/*.log` — and a red test suite produces a *better* review, never an aborted one.

## Initial Scope Sketch

### Likely In Scope

- **A validations execution unit in `src/core/run`** — the module that owns `ProcessRunner`. Runs declared entries **sequentially, in declaration order**, one `ProcessRunner.run` per entry, each with its own budget, collecting evidence rather than throwing on non-zero exit. Whether it is a standalone exported use case or an internal helper of `runReview` is decision candidate **DC-1**.
- **Declared-string → `(command, args)` conversion**, with the `shell: false` invariant preserved by construction (**DC-3**). This is the story's security-load-bearing line.
- **Wiring into `runReview`'s reserved stage 5** — between diff and prompt, so the assembled prompt (and therefore the persisted prompt, PRD §9) contains the evidence. The `validationOutput` parameter already threaded through `RunReviewRequest` → `assemblePrompt` is the delivery channel; the question is who fills it (**DC-1**).
- **The evidence shape** — what one `validationOutput` entry actually contains (**DC-7**). Not cosmetic: `RunStore`'s fs adapter writes one `validations/NNN.log` per array element, and `assemblePrompt` joins the array with newlines inside a single `<validation-output>` block. The array's granularity is a persisted format decision, already load-bearing in merged code.
- **Closing the `classifyFailure` gap** — `InvalidProcessRequestError` (and a decision on `ProcessSpawnError`, **DC-4**) added to the `validation-failed` branch. The `terminal-state.ts` union already has `validation-failed` and nothing currently produces it from a validation.
- **A prompt-facing output budget** (**DC-6**). The adapter's default capture budget is 1,000,000 characters (`process-runner-exec.ts:27`) — sized for capture, not for a token-budgeted prompt.
- **Tests** — core unit tests with an in-memory `ProcessRunner` fake (the existing `run-review.test.ts` fake-deps pattern), covering: order preserved, non-zero exit continues, unspawnable script handled per DC-4, only declared entries reachable, output present in the returned `prompt`.

### Likely Out Of Scope

- **Composition-root wiring** — `E6.F1`. This story ships the behavior reachable through `runReview`'s deps, not a `sentinel review` that runs validations end to end. Consistent with every prior story's deferral.
- **Any form of auto-detection** — reading `package.json` scripts, sniffing a Makefile, defaulting to `npm test`. PRD §3.1-E forbids it in as many words. A repo with no `validations` key runs zero validations, silently and correctly.
- **Parallel validation execution.** The backlog says "in order". Sequential is also what makes the per-entry `NNN.log` numbering meaningful.
- **CLI/TUI flags** (`--skip-validations`, `--validation-timeout`) — E6/E7 surface, and none is named in #32.
- **Retrofitting the two engine `process-runner.ts` seams or `git-cli.ts` onto `ProcessRunner`** — carried forward as `[E5.F1.H1]` risk-004, still a follow-up backlog item, still not this story.
- **Process-group kill hardening** (`[E5.F1.H1]` risk-007: a forking validation can leave grandchildren past the timeout). Real and now *actually reachable* for the first time, since this story is what finally spawns user-declared commands — but fixing it means changing the merged adapter's `detached`/kill strategy, which is a hardening pass with its own test surface, not a line of this story. **Spec should decide whether to escalate it rather than silently inherit it.**
- **Secret redaction of captured output.** `[E5.F1.H1]` spec explicitly deferred "a declared script that prints its environment leaks into prompt and disk" to this story's decision about *what reaches the prompt*. In scope only as far as DC-6's budget/marker policy goes; a detection heuristic is not proposed.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Collaborators all merged | `ProcessRunner` + execa adapter (#31, PR #71, merged at `beb5d48`), `runReview` (#27/#26), `assemblePrompt`'s `validationOutput` seam, `RunRecord.validationOutput` + `validations/NNN.log` writer. Nothing this story needs is speculative. | high |
| Injection point pre-built | `run-review.ts:363` is a comment-only stage 5 placeholder sitting exactly between diff and prompt, and `RunReviewRequest.validationOutput` is documented as "E5 seam. Forwarded verbatim to `assemblePrompt`; this story runs no validations of its own". The predecessor left the socket wired. | high |
| Config shape already shipped | `validations: z.array(z.string()).optional()` is merged and exported. In scope-neutral terms this is good (no schema migration needed) — but it also means the flat-string shape was chosen before this story examined it, and there is **no per-script timeout field anywhere** in `RepoEntry` or `GlobalConfig`, while #32 explicitly requires "per-script timeout". Something has to give (**DC-2**). | medium |
| Tokenization under `shell: false` | Verified directly: the adapter pins `shell: false`. So `"npm test 2>&1"` cannot mean what its author thinks — a naive whitespace split would pass `2>&1` to npm as a literal argument and the misparse would be silent. The conversion needs an explicit, tested policy, not a `.split(" ")`. | medium |
| Cross-module compile-time ripple | If the spec adds a `"validations"` member to `RunStage` (so `failure.stage` can name it honestly), `src/core/history/ports/run-metadata-schemas.ts:54` breaks typecheck: `_AllRunStagesCovered` is an `Expect<Exclude<RunStage, …>>` exhaustiveness guard over a hand-maintained `RUN_STAGES` list, and `[E5.F2.H2]`'s AC-15 pinned that list's location deliberately. Discovered by reading, not by compiling — flagging it now so spec does not meet it at execution time (**DC-5**). | medium |
| Decision density | Seven real forks (below) over what will be a few hundred lines of code. The risk in this story is not writing it, it is choosing wrong and persisting the choice in a prompt format and an on-disk log layout that `[E5.F2.H1]` already froze. | medium |

## Open Questions For Spec — Decision Candidates

Each is a real fork with a real trade-off; the recommendation is this stage's opinion, not a resolution.

| # | Question | Alternatives | Recommendation | Level |
|---|---|---|---|---|
| **DC-1** | **Who runs the validations — `runReview`, or a use case beside it?** | (a) A new stage inside `runReview`, with an optional `deps.processRunner`; the use case gains a stage and `RunReviewRequest` gains a `validations` input. (b) A standalone exported use case (`runValidations`) the *caller* runs before `runReview`, feeding the existing `request.validationOutput` — zero change to `runReview`. (c) Both: a standalone, independently unit-testable `runValidations` that `runReview` calls at stage 5 when a `processRunner` dep is present. | **(c).** (b) alone leaves AC "output visible in the persisted prompt" dependent on a caller that does not exist until E6, and makes it possible to run a review that silently skipped validations. (a) alone buries the logic in the pipeline's `try`, where the "must not abort the review" guarantee is one refactor away from breaking. (c) keeps the guarantee testable in isolation and still makes the wired-up path the default. | **B** |
| **DC-2** | **Where does the per-script timeout come from?** #32 requires one; `RepoEntry.validations` is `string[]` and neither `RepoEntry` nor `GlobalConfig` has any timeout field. | (a) Keep `string[]`; add a single `validationTimeoutMs` to `GlobalConfig` and/or `RepoEntry`, applied to every script. (b) Widen the schema to `(string \| { command: string; timeoutMs?: number; name?: string })[]` — backward-compatible union, per-script control. (c) Hard-code a constant in the run module, no config at all. | **(a)** for this story. It satisfies "per-script timeout" literally (each script gets its own budget, they just share a value), needs one additive optional field, and does not fork the config format on the first story that touches it. (b) is the better long-term shape but it changes a **public config format** — B-level on its own, and re-litigating `validations`' shape one story after it shipped deserves the user's call. (c) rejected: an unconfigurable budget will be wrong for `npm test` on somebody's repo. | **B** |
| **DC-3** | **How does a declared string become `(command, args)` with no shell?** | (a) Whitespace split. (b) A quote-aware shell-like tokenizer (handles `"a b"`, still never spawns a shell). (c) Require array form in config (`[["npm","test"]]`) — a schema change. (d) Whitespace split **plus** rejecting any entry containing shell metacharacters (`\| & ; < > $ \` ( ) { } * ?`) with a clear `validation-failed`. | **(d).** The danger is not injection (`shell: false` makes that structurally impossible) — it is **silent misinterpretation**: `"npm test 2>&1"` or `"a && b"` would be passed as literal arguments and fail in a confusing way, and a user would reasonably read the failure as sentinel being broken. Refusing what we cannot honor is honest; (b)'s quote handling can be added later without breaking (d). | **B** |
| **DC-4** | **Does a validation failure ever influence the terminal state?** | (a) Never — every validation outcome, including "binary not found", is evidence; the review always proceeds. (b) A malformed *declaration* (empty entry, rejected metacharacters, non-absolute cwd) fails pre-flight → `validation-failed`; a *runtime* failure (non-zero exit, `ProcessSpawnError` for a missing binary) is evidence and the review proceeds. (c) Any `ProcessSpawnError` aborts as `validation-failed`. | **(b).** It draws the line where the user's intent is: a declaration we cannot even parse is the user's config being wrong (fail fast, before a worktree exists); a script that ran and failed — or a `npm` that isn't installed — is exactly the situation #32's third AC describes as "review continues with the evidence". Concretely: add `InvalidProcessRequestError` to `classifyFailure`'s `validation-failed` branch, and deliberately **do not** add `ProcessSpawnError`, since under (b) it never reaches the classifier. | **B** |
| **DC-5** | **Does `RunStage` gain a `"validations"` member?** | (a) Yes — `failure.stage` can name the stage honestly; requires also updating `RUN_STAGES` in `history/ports/run-metadata-schemas.ts` or typecheck breaks (`_AllRunStagesCovered`), a deliberate cross-module diff in a story that does not own `history`. (b) No — a validation pre-flight fault reports as stage `"request"`. | **(a)**, with the history-side list update called out explicitly in the plan as an intentional two-module change and a one-line note in `run-metadata-schemas.ts`'s existing comment. (b) is cheaper but persists a wrong stage into `metadata.json`, which `[E5.F2.H2]`'s listing then shows to a human. Cheap now, misleading forever. | A/B |
| **DC-6** | **Is captured output truncated before prompt injection, and how?** | (a) No truncation here — pass the adapter's capture through (default budget 1,000,000 chars **per stream, per script**). (b) A per-script prompt budget with a visible marker, head-only. (c) head + tail window (first N / last N lines), marker in between. | **(c)**, with a modest per-script line budget. A failing test suite's diagnostic value is concentrated at both ends — the run header and the failure summary — and a head-only cut throws away the half that matters most; `builtin-verdict-extraction.ts` already uses a tail-window idea for a related reason. (a) is not viable: two scripts at the default budget could dwarf the entire diff in the prompt. | A/B |
| **DC-7** | **What is one `validationOutput` array element?** This is a *persisted format* decision — `RunStore`'s adapter writes one `validations/NNN.log` per element and `assemblePrompt` joins elements with `\n` inside one `<validation-output>` block. | (a) One element per declared script: a header line (command, exit code, duration, timed-out/truncated flags) followed by its captured output. (b) One element per stream (stdout and stderr separately) — doubles the log files, decouples the pairing. (c) A single element for the whole batch — one `001.log`, defeating the numbering. | **(a).** It is the only option under which `validations/NNN.log` numbering matches declaration order 1:1, which is what makes a persisted run readable without the tool (`[E5.F2.H1]`'s first AC). Merging stderr into the same element after stdout keeps a failure's cause next to its context. | A |

## Contradictions Found

- **None blocking.** Two tensions for spec to state rather than absorb:
  1. **`RepoEntry.validations` shipped before this story examined it.** Nothing is wrong with `string[]`, but the "per-script timeout" requirement in #32 has no home in the current schema (DC-2). Spec must either add a field or explicitly re-scope "per-script timeout" to "per-script application of a shared budget" — and say which, rather than letting the AC quietly go unmet.
  2. **`[E5.F1.H1]` risk-007 becomes live here.** The adapter kills only the immediate child pid, no process group. A declared `npm test` is *precisely* the forking command that risk described, so this story is where an orphaned grandchild first becomes reachable in practice. It is out of scope to fix, but spec should decide consciously — inherit-and-record, or escalate to its own backlog item — instead of it disappearing between two stories.

## Approval Notes

- Scope is `[E5.F1.H2]` / issue #32 alone. Both declared dependencies are merged on `main`: `[E5.F1.H1]` (PR #71, `beb5d48`) and `[E4.F1.H1]`.
- Branch `claude/e5-f1-h2-declared-validations` is already cut and clean at `beb5d48`. 0 open PRs, well within the max-5 limit.
- This is the **last required story of milestone E5**. On merge, workflow contract rule 6 (epic summary + STOP) triggers.
- Recommended next stage: `sddl-spec`, which must resolve DC-1, DC-2, DC-3 and DC-4 as firm acceptance criteria before design — DC-2, DC-3 and DC-7 in particular because each freezes a format (config, declaration syntax, on-disk log granularity) that later stories inherit.

## Budget Notes

- Lite artifact. Expected footprint: one new core file (the validations unit) + its test, edits to `run-review.ts` (stage 5, request shape, `classifyFailure`), `run/index.ts`, and — depending on DC-2/DC-5 — one additive field in `config-schemas.ts` and one line in `history/ports/run-metadata-schemas.ts`. Small by volume; the effort is in pinning seven decisions and in the tokenization policy, not in code.
