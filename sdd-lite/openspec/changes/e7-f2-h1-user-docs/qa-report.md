# QA Report

## Closeout Digest

- change_name: e7-f2-h1-user-docs (story `[E7.F2.H1]`, issue #43)
- mode: final
- verdict: pass_with_warnings
- completion: DEFERRED. `lifecycle_status` stays `reviewing`; a `final_review` checkpoint (cp-017) asks the user to accept the warnings. Not marked `completed`.
- target: HEAD `8e91c5a` (detached, see W4), base `origin/main` `8c63ed3` (fetched). Docs are post-S6.
- summary: >-
    All 18 doc-verifiable acceptance criteria (AC-1..AC-18) pass against the CURRENT docs; AC-19 is
    open by design (orchestrator, PR time). Gates re-run by QA are green (`npm run check`, `npm test`
    1039 tests, link check, jargon grep, Mermaid, d-014 grep). The `verify-quickstart.sh` replay in
    a fresh sandbox is 79/79 with the engine-absence guard 10/10. Blast radius is clean. No finding
    above medium. The verdict is `pass_with_warnings` because the quick start's review/result steps
    were never run against a real engine (d-006), AC-19 and the follow-up issues are still to file,
    and the S6 commits are not on any branch ref.
- next_safe_step: user accepts or rejects the warnings (cp-017); then history entry, file F1-F9, open the PR (`Closes #43`) with the disclosures below.

## Findings

| Id | Severity | Finding | Evidence | Action |
|---|---|---|---|---|
| W1 | medium | Not verified live (d-006, risk-e7f2h1-002). No model was ever invoked. The following rest on code reading, fixtures and the engine pre-flight failure path only: a review reaching `state ok`; a real `verdict` other than `-`; `result.md` appearing for a real answer; `runs show` of an `ok` run; exit codes 0 and 1 (2 for non-ok is exercised only via `engine-error`; #79); Claude Code / OpenCode behavior in the temporary copy (permissions, file reads, deny config, session history); the interactive flow (QS 7) and the harness-list / Ctrl+C step (guide 7), not drivable without a terminal (risk-e7f2h1-009). | execution-log S5 caveat row; replay below; code checks below | Disclose in PR body. User accepted this scope in d-006 (against the recommendation). |
| W2 | medium | AC-19 open: follow-up issues F1-F9 are not yet filed; the PR must list them. F8 (Claude Code isolation flags) and F9 (OpenCode config precedence) back the S6 privacy wording. | state.yaml next_action; d-017 | Orchestrator at PR time. Not a docs defect. |
| W3 | medium | Delivery hazard: `git branch --contains 8e91c5a` shows only the detached HEAD. The branch ref `claude/nifty-heisenberg-w3gn8z` and `origin/claude/nifty-heisenberg-w3gn8z` are both at `8fb52de` (pre-S6). The S6 docs fix (`f75d246`), the 4R ledger and the d-017/d-018 state commits exist only on the detached HEAD. | `git status`, `git log --decorate` | Orchestrator must move/push the branch to `8e91c5a` (plus this QA commit) before the PR, or S6 is lost. |
| L1 | low | AC-5 residual overlaps, all deliberate and short: `SENTINEL_HOME` is mentioned in QS 3 and as an instruction in guide 1; the "no token in the address" sentence is in QS 3 and privacy 5 (QS links to it); guide 1 uses `ambiguous` without linking to its explanation in QS 5. The R2-001 duplication (run-folder list, prompt order) IS fixed. | cross-doc read | Accept. |
| L2 | low | AC-8 wording: "Node 22 or newer" is stated in QS 1 (directly before the install section), not inside QS 2. | `docs/quick-start.md:7-9` | Accept (design outline placed it there; S5 passed it). |
| L3 | low | The Mermaid diagram in `docs/privacy.md` was never rendered (no tooling). Syntax (`flowchart LR`, `-. text .->`, `<-->`) reviewed by eye; 5 nodes, no styles. | grep, eyeball | Accept; GitHub renders on first view. |
| L4 | low | Product friction that surfaces to a reader following the quick start: factory harnesses ask for the verdict first line but the parser reads only the tail window (F5), so `--type quick` can end `ambiguous`; the docs say so honestly in QS 5. | spec F5, `builtin-verdict-extraction.ts:24-26` | Product follow-up F5 (#42 candidate). |

## AC Re-verification (current docs, post-S6)

| AC | Result | Evidence (QA re-run) |
|---|---|---|
| AC-1 | PASS | `git diff --name-only origin/main...HEAD`: 3 new docs, `README.md`, `sdd-lite/**`; no index file |
| AC-2 | PASS | H1 + one-line purpose + numbered sections + `## Next steps` (2 links each) in all three; no TOC |
| AC-3 | PASS | Mermaid count 0 / 0 / 1; 5 nodes; no `style` / `classDef` / `%%{init` |
| AC-4 | PASS | word-bounded case-insensitive grep for the nine terms: no hits. Loose grep hits only the on-disk folder `~/.sentinel/worktrees/` (`privacy.md:40`), a path the user sees, covered by the "printed on screen" exemption |
| AC-5 | PASS (see L1) | run-folder list only in privacy 3, prompt order only in privacy 1; remaining overlaps minor |
| AC-6 | PASS | every `bash` block is one command; no `$` prompts; `<url>`, `<owner/repo>`, `<branch>`, `<id>`, `<provider/model>` explained where first used |
| AC-7 | PASS | replay exercises every documented command; `snt` and `engines.node >=22` confirmed in `package.json`; outputs `registered` / `already-registered`, key/value outcome block, `runs list` oldest-first confirmed in code |
| AC-8 | PASS (see L2) | QS 2 is the only install section: `git clone`, `npm ci`, `npm run build`, `npm install -g .` |
| AC-9 | PASS | fresh sandbox `sb-qa`, clone of HEAD `8e91c5a`: 79/79, 0 failed |
| AC-10 | PASS | 10/10 `[engine-absence] ok` before each review; reviews end `engine-error` at stage `engine`; no ABORT |
| AC-11 | PASS | V11: `--type my-review` reaches stage `engine`; `prompt.md` holds instructions, skill, output contract (harness files re-extracted from the current guide; byte-identical to S5's) |
| AC-12 | PASS | `verify-verdict.mts` ALL PASS against the clone's parser (long answer, verdict last, parses; verdict-first control gives null) |
| AC-13 | PASS | guide 1 and 7; V13 (broken folder, misspelled `--type`) pass; `extraSkills` absent from all three docs |
| AC-14 | PASS | claim map in execution-log S4/S6; spot-checks below |
| AC-15 | PASS | QS 7 interactive-only, scripts and CI use `sentinel review`, exit codes by pointer to `--help`; V14 exit 1 + stderr guidance |
| AC-16 | PASS | QS 4 one sentence: `review` works on the copy downloaded at `repo add` |
| AC-17 | PASS | README diff = six added lines before `## Quick start (development)`, nothing removed |
| AC-18 | PASS | no path under `src/ e2e/ fixtures/ harnesses/ skills/ package*.json` or contributor docs in the diff; `npm run check` exit 0 (biome 165 files, tsc, depcruise 107 modules clean); `npm test` exit 0 (50 files, 1039 tests) |
| AC-19 | OPEN (deferred to PR) | Orchestrator files F1-F9 and lists them, with the W1 disclosure, in the PR body |

## Independent Code Re-check (high-risk claims)

| Doc claim | Verified in |
|---|---|
| Claude Code saves each prompt in its own session history | invocation args are only `-p --model <m> --output-format json` (no session-persistence opt-out): `claude-code-adapter.ts` (run call) |
| Branch settings can apply; sentinel adds no limits | `cwd: request.worktree.path`, no settings-source flags: same file |
| OpenCode deny settings (edit, bash, webfetch), softened wording | `permission-config.ts` `DENY_CONFIG` |
| Worktree left only on interruption or cleanup failure | `cleanupPolicy ?? "always"` in `run-review.ts:543`; no SIGINT/SIGTERM handler in the review path (grep) |
| URL saved verbatim, printed by `repo list` | `git-cli.ts` clone passes `url` unchanged; `register-repo.ts` stores `url` |
| ssh accepted, alias `owner/repo` | `deriveAlias` handles `://` and scp-style (`register-repo.ts:29-52`); replay covers https |
| git runs without a prompt (private repo needs stored credentials) | `GIT_TERMINAL_PROMPT: "0"`, `git-cli.ts:56` |
| `ambiguous` has no failure fields; both print `-`; `result.md` still written | `run-review.ts:471`, `format-review.ts` `ABSENT`, `run-store-fs.ts` writes `result.md` when `engineOutput` is set |
| `SENTINEL_HOME` fallback and layout | `paths.ts:61-93`; env var in root help |
| Verdict rules; "Review cancelled — nothing was run."; "Harness not found: <name>"; "Missing required harness.md in harness" | `builtin-verdict-extraction.ts`, `tui-flow.ts:78`, `harness-errors.ts:19`, `harness-loader-fs.ts:59` |
| sentinel's own network traffic is git only; fetch only in the TUI branch step | `tui-flow.ts:128-143`; `git-cli.ts` |

No doc claim found false or unsupported.

## Review Evidence

- review-ledger.md: forced full-4r (d-016, rubric override: the target is `trivial` by the 4R rubric; the user's brief mandated four lenses). Verdict `pass_with_warnings`, counts confirmed=0 suspect=0 escalated=0 info=12, `open_severe_findings: 0`, no refuter pass, no protocol fix rounds.
- All 12 info rows were addressed in S6 (Amendment 1, d-017, outside the fix-round budget). QA verified the resulting wording directly against the code (table above); no scoped re-review ran, per the amendment.
- d-018 deviation (R2-002): the executor kept and softened the "check commands configured for the repository, if any (these docs do not cover them)" clause instead of dropping it, because `assemblePrompt` really adds validation output. The user accepted this at cp-016. QA agrees: dropping it would understate what is sent. No user doc explains check commands (out of scope, d-005 fold); the text says so.

## Evidence Log

| Command | Result |
|---|---|
| `git fetch origin main` | base `8c63ed3` |
| relative link check (README + 3 docs) | 0 broken |
| jargon grep, Mermaid, d-014 `claude -p\|--model`, `extraSkills`, `$ ` prompts | clean as in AC table |
| `npm run check` | exit 0 |
| `npm test` | exit 0, 1039 passed |
| `verify-quickstart.sh sb-qa` (`VQ_SRC_REPO` = scratch clone at `8e91c5a`, `VQ_HARNESS_DIR` = files extracted from the current guide) | 79 checks, 0 failed, guard 10/10 |
| `verify-verdict.mts` | ALL PASS |

Replay note: the script's default clone branch resolved to `HEAD` because the worktree is detached, and the local branch ref is pre-S6, so QA cloned `8e91c5a` into a scratch repo for the run. No file under the repo was written outside `sdd-lite/`; `git status` clean before this report.

## Verdict And Next Action

`pass_with_warnings`. The documentation is accurate to the code, within the agreed format and scope, and the gates are green. Completion needs the user to accept W1-W3 (cp-017). No QA-requested doc change.
