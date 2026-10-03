# Execution Log

## Stage Overview

| Stage Id | Goal | Status | Approval | Notes |
|---|---|---|---|---|
| S1 | Verification scripts + dry baseline | completed (pending QA/next approval) | cp-008 (user, 2026-10-03T16:10:00Z) | 2 scripts written; baseline green, 79/79 checks; no contradictions |
| S2 | `docs/quick-start.md` | completed (pending next approval) | cp-009 (user, 2026-10-03T16:40:00Z) | doc written; V1-V15 green 79/79; doc commands replayed literally; no contradictions |
| S3 | `docs/build-your-own-harness.md` | completed (pending next approval) | cp-010 (user, 2026-10-03T17:20:00Z) | doc written; V4/V11/V12/V13/V15 green 50/50 from the guide's literal files; verdict check ALL PASS; no contradictions |
| S4 | `docs/privacy.md` + README section | pending | requires its own stage_approval | carries d-014 |
| S5 | Full verification + gate | pending | requires its own stage_approval | |

## S1 - Verification scripts and dry baseline

- Approval: `stage_approval` cp-008, selected `approve`.
- Branch `claude/nifty-heisenberg-w3gn8z`; sandbox cloned from HEAD `5b5786e1f0f390ee31432c71d68357378e3d950f` (plan commit 469e155 plus the S1 approval record). No git side effects by the executor (no add/commit/stash/push).
- Planned scope: create `verify-quickstart.sh`, `verify-verdict.mts`, start this log; dry baseline V1-V8, V10, V13, V14, V15 green against current code.

### Changed files

| File | Change |
|---|---|
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/verify-quickstart.sh` | new (V1-V15; executable) |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/verify-verdict.mts` | new |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/execution-log.md` | new (this file) |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/state.yaml` | executor notes, next_action, updated_at |

Nothing under `docs/`, `README.md`, `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/` or `package.json` was touched (`git status --short` shows only the two new scripts plus this log and state.yaml).

### How the sandbox is isolated (what the script does)

- Sandbox: `<scratchpad>/sb-s1` (the script refuses any sandbox outside the scratchpad root and wipes it at start).
- Fresh clone of the local repository branch (`git clone --no-hardlinks --branch <current> /home/user/sentinel-kit`), not GitHub. Clone HEAD asserted equal to the source HEAD.
- `HOME=$SB/userhome`, `SENTINEL_HOME=$SB/home`, `npm_config_prefix=$SB/prefix`, `npm_config_cache=$SB/npm-cache`, `GIT_CONFIG_GLOBAL=$SB/gitconfig` (identity + `init.defaultBranch main`), `GIT_CONFIG_NOSYSTEM=1`; `NODE_PATH` and `SENTINEL_OPENCODE_MODEL` unset.
- `PATH=$SB/prefix/bin:$SB/shim:/usr/bin:/bin`; `$SB/shim` holds only symlinks to `node`, `npm`, `npx`, `git`. `/opt/node22/bin` (where `claude` lives) is not on PATH.
- Before EVERY `sentinel review` (10 invocations in the run) the script asserts `! command -v claude && ! command -v opencode` and aborts with exit 99 otherwise. The transcript line `[engine-absence] ok` appears 10 times; no ABORT. No engine was ever resolvable; no model was invoked (d-006).
- Throwaway bare origins `$SB/origin/acme/widget.git` (and `acme/gizmo.git` for V12) with `main` + `feature/greeting`, pushed from seed repos.
- Real-world snapshot before/after (V15): real `~/.sentinel` (absent), real `~/.gitconfig` hash, real npm global prefix (`/opt/node22`) bin/lib listing, and `git status --porcelain` of the source repo. Identical before and after.

### Baseline result (command `verify-quickstart.sh <scratchpad>/sb-s1`, all steps, exit 0, 79 checks, 0 failed)

| Step | Command (abridged) | Observed |
|---|---|---|
| V1 | seed repo -> bare origin push | two branches: `feature/greeting`, `main` |
| V2 | `git clone` branch HEAD; `npm ci`; `npm run build`; `npm install -g .` | all exit 0; `$SB/prefix/bin/sentinel` and `snt` exist and resolve; `sentinel --help` exit 0; build `ESM dist/cli.js 124.20 KB`; `npm ci` ends with an `npm audit` notice (no failure); node v22.22.0 |
| V3 | `--help` for root, repo, repo add, repo list, review, runs, runs list, runs show | all exit 0, saved (full text in the appendix below) |
| V4 | `repo add file://$SB/origin/acme/widget.git` x2 | stdout `acme/widget<TAB>registered<TAB>-`, then `acme/widget<TAB>already-registered<TAB>-`; exit 0 both; `repos.yaml` sha256 identical after the second; managed copy at `$SENTINEL_HOME/clones/acme/widget` |
| V5 | `repo list` | one line: `acme/widget<TAB><url><TAB>main<TAB>-` (alias, url, base branch, then `-` when no default harness) |
| V6 | `review acme/widget feature/greeting` | exit 1; stderr `No harness type for "acme/widget": pass --type or set a default harness for the repository`; run count unchanged |
| V7 | `review acme/widget feature/greeting --type quick` | exit 2; stdout `state engine-error`, `engine claude-code`, `harness quick`, `failureStage engine`, `failureMessage Engine invocation failed`, `verdict -`, `runDir .../runs/acme__widget/<id>`; run dir holds `metadata.json` and `prompt.md`, no `result.md` |
| V8 | `--engine opencode` without `SENTINEL_OPENCODE_MODEL` | **exit 1** (observed; recorded as requested); stderr `The opencode engine needs a model id: set SENTINEL_OPENCODE_MODEL (for example "anthropic/claude-sonnet-4") and run the review again`; no run persisted |
| V8 | same with `SENTINEL_OPENCODE_MODEL=anthropic/claude-sonnet-4` | exit 2; `engine opencode`, `state engine-error`, `failureStage engine` |
| V10 | `runs list acme/widget`; `runs show acme/widget <id>` | list: one line per persisted run (3 at that point), each starting `acme/widget`; show: `key<TAB>value` block with `state engine-error`; keys: repo id startedAtEpochMs durationMs state verdict harness engine baseRef targetRef diffFileCount diffTotalLines diffEstimatedTokens diffTruncated usageInputTokens usageOutputTokens usageTotalTokens promptLineCount failureStage failureMessage diffWarnings validationOutput engineOutput |
| V13 | empty `harnesses/broken`, `--type quick`; then folder removed, `--type my-reveiw` | first: exit 2, `state validation-failed`, `failureStage harness`, `failureMessage Missing required harness.md in harness "broken"`; second: exit 2, `validation-failed`, `failureStage harness`, `failureMessage Harness not found: my-reveiw`. Both persist a run. Order note: the broken folder is removed before the typo run (with it present, the typo run would fail on the broken folder first) |
| V14 | `sentinel </dev/null` | exit 1; stderr `Interactive mode needs a terminal on stdin and stdout: run \`sentinel review <repo> <branch> --type <harness>\` instead, or see \`sentinel --help\`.`; stdout empty |
| V15 | before/after snapshots | identical (real `~/.sentinel` absent before and after; `~/.gitconfig`, `/opt/node22` listing and source repo status unchanged); no ABORT in transcript |

Informational extras (not required in S1; they pass now and must be re-run in S3/S5 against the written docs):

| Step | Observed |
|---|---|
| V9 | `config.yaml` with `defaultEngine: opencode`, review without `--engine` (model var set): `engine opencode`, `engine-error`, exit 2; file removed after |
| V11 | Example `my-review` (embedded copy of design.md "Harness Example") accepted: `harness my-review`, `failureStage engine` (not `harness`), exit 2; `prompt.md` contains the harness text, `<skill name="house-rules">`, the skill text, `<output-contract>`, the last-line rule and the diff (`src/greeting.js`) |
| V12 | `defaultHarness: my-review` added under the `acme/widget:` entry of `repos.yaml` (flat map keyed by alias, entries indented two spaces): review without `--type` gives `harness my-review`. Second origin added with `repo add --harness my-review`: review without `--type` gives `harness my-review` |
| verdict | `node --experimental-strip-types verify-verdict.mts <sandbox clone>/src/core/run/builtin-verdict-extraction.ts <sandbox>/home/harnesses/my-review/output.md`: ALL PASS (15 checks): 40-line / 4145-char synthetic answer with the verdict last parses to `request-changes`; verdict-first control parses to `null`; conflicting markers `null`; no marker `null` |

### Code-fact check against the CF rows

No CF row was contradicted. Items worth carrying into S2-S5 wording (no scope change):

- `failureMessage` for a missing engine binary is the generic `Engine invocation failed`; docs must not promise that the message names the cause (quick start section 5: say `failureStage` and `failureMessage` give the stage and a short message).
- `repo add` prints `-` as the third field for a URL-added repo (CF-3/design line "localPath" renders `-` when the registry holds no local path); the doc should show `<owner/repo>  registered` without the third column promise.
- `repo list` prints four tab-separated fields: alias, url, base branch, default harness (`-` when none). Field names confirmed in `format-repos.ts` (`REPO_LINE_FIELDS`: alias, url, baseBranch, harness).
- `review` run block is `key<TAB>value`, keys in order repo, targetRef, state, verdict, engine, harness, durationMs, failureStage, failureMessage, runDir; successful runs would add no `failure*` values (rendered `-`).
- Pre-run errors (no `--type`, missing opencode model) exit 1 and persist no run; harness-stage failures (broken or unknown harness) exit 2 and DO persist a run (relevant to F6/F7 wording).
- `review --help` text says exit 1 = changes requested only (F6 confirmed in the built CLI).
- Empty directory `$SENTINEL_HOME/worktrees/widget` remains after reviews; docs do not mention worktrees (AC-4), so no action.
- `repo add --help` describes `<url>` as "https or ssh"; `file://` also works but docs must use only https/ssh examples (GitHub URL).

### Quick checks

| Check | Result |
|---|---|
| `bash -n verify-quickstart.sh` | ok |
| Full `verify-quickstart.sh` run | exit 0, 79 checks, 0 failed |
| `verify-verdict.mts` informational run | ALL PASS |
| Engine absence before each review | 10 of 10 asserted, none resolvable |
| Biome / tsconfig coverage of the change dir | Not covered: `biome.json` `files.includes` lists only `src/**`, `e2e/**` and root config files; `tsconfig.json` `include` is `["src","e2e"]`. Confirmed by running the sandbox clone's `biome check .` from the repo root with both scripts present: `Checked 165 files ... No fixes applied`, exit 0 |
| `git status --short` | only `verify-quickstart.sh`, `verify-verdict.mts` (new), plus this log and state.yaml |

Skipped by plan: doc-dependent checks (V9, V11, V12 and the verdict check against the written guide) are re-run in S3 and S5 against files extracted from the docs; their S1 runs above use the design's embedded example.

### Script notes for later stages

- `VQ_STEPS="V4 V5 ..."` selects steps (V1-V3 always run); `VQ_HARNESS_DIR=<dir>` makes V11/V12 use `harness.md`, `skills.yaml`, `output.md`, `house-rules.md` extracted from the guide instead of the embedded copy; `VQ_SRC_REPO` / `VQ_SRC_BRANCH` override the clone source.
- The sandbox clones the committed branch HEAD. Docs are working-tree files (never committed during S2-S4), so doc text is compared with the saved help (appendix) and executed commands, not read from the clone.
- Full run takes about 1 minute (npm ci and build dominate); sandbox size is about 385 MB and is disposable.

### Blockers

None. No stop condition triggered: no CF row false, no protected path touched, no engine binary resolvable, real `~/.sentinel`, npm prefix and gitconfig untouched.

### QA handoff

`sddl-qa-review` not recommended after S1: non-code stage (evidence scripts only), self-contained, low risk. The first QA/4R pass happens after S5 per plan.

### Next action

Request `stage_approval` for S2 (write `docs/quick-start.md`).

## S2 - `docs/quick-start.md`

- Approval: `stage_approval` cp-009, selected `approve`. Branch `claude/nifty-heisenberg-w3gn8z`, HEAD 252d049 (S1 at 6ec6a49). No git side effects by the executor.
- Planned scope: create `docs/quick-start.md` per the design outline (H1, one-line purpose, sections 1-7, Next steps; D6 sentence in section 4; no Mermaid); re-run V1-V10 and V14.

### Changed files

| File | Change |
|---|---|
| `docs/quick-start.md` | new (H1 `Quick start`, `## 1.`-`## 7.`, `## Next steps` with two links; 16 fenced blocks, 15 `bash` and 1 `yaml`) |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/execution-log.md` | this entry |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/state.yaml` | S2 notes, next_action, updated_at |

Scripts were not changed (the doc, not the script, was the thing under test; no script defect found). Nothing under `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, README or contributor docs was touched; `git status --short` shows only `docs/quick-start.md` as untracked before this log and state.yaml edits.

### Wording decisions applied (from S1 notes and handoff)

- Missing engine binary: the doc says `engine-error` at stage `engine` "usually means the engine could not run" and asks the reader to check the CLI is installed and logged in; it does not promise that `failureMessage` names the cause (observed value is the generic `Engine invocation failed`).
- `repo add` output: described as the repository name and `registered`; the third column (`-`) is not promised. `repo list`: name, address, base branch, default harness (`-` when none), as observed.
- Pre-run errors (no `--type`, missing opencode model): doc says sentinel prints one line and keeps no run folder; the missing-model error is described by its message (ask to set `SENTINEL_OPENCODE_MODEL`), no exit code is documented. Exit codes are by pointer to `sentinel review --help` only (d-008).
- Run folder contents are qualified from evidence found in this stage: a harness-stage failure run (V13) holds only `metadata.json`; an engine-error run holds `metadata.json` and `prompt.md`; `result.md` appears only when the engine answered. The doc therefore says `prompt.md` "once sentinel had built it" and `result.md` "when the engine gave one".
- D6 (d-012): one sentence in section 4: "`sentinel review` works on the copy downloaded at `repo add`; it does not pick up changes pushed later." No refresh command.
- TUI (d-009): section 7 is interactive-only ("It needs a terminal"; scripts and CI use `sentinel review`, exit codes via `sentinel review --help`). #82 is not named.
- Only GitHub https examples (`https://github.com/acme/widget.git`, install clone URL). `~/.sentinel` introduced once with the `SENTINEL_HOME` sentence in section 3. `extraSkills`, `--local-path`, `--base-branch`, `--timeout`, `--changes-exit-code`, `validations` and other out-of-scope fields are not mentioned.

### Verification

Full `verify-quickstart.sh <scratchpad>/sb-s2` (fresh clone of HEAD 252d049, same isolation as S1): exit 0, 79 checks, 0 failed; V1-V15 all PASS; engine-absence asserted 10 of 10 before reviews (`[engine-absence] ok`), no ABORT; V15 isolation identical before and after. No model invoked (d-006).

Doc-command to V-step map (commands were also extracted from the doc by script and replayed literally in the sandbox against a fresh `SENTINEL_HOME` and a second throwaway origin `acme/gizmo`, with `<url>` = the local `file://` origin, `<owner/repo>` = `acme/gizmo`, `<branch>` = `feature/greeting`, `<id>` = the id from `runs list`; engine guard asserted first; install and `export` lines not replayed):

| Doc section | Doc command | V-step that executes it | Replay result |
|---|---|---|---|
| 1 | `node --version` | V2 (`node --version`, v22.22.0) | not replayed (V2 ran it) |
| 2 | `git clone https://github.com/nico0695/sentinel-kit.git` | V2 (`git clone` of the local branch instead of GitHub, per plan) | not replayed |
| 2 | `cd sentinel-kit` | V2 (`cd "$CLONE"`) | n/a |
| 2 | `npm ci` | V2 (exit 0) | not replayed |
| 2 | `npm run build` | V2 (exit 0) | not replayed |
| 2 | `npm install -g .` | V2 (exit 0; `sentinel` and `snt` in the sandbox prefix) | not replayed |
| 2 | `sentinel --help` | V2, V3 (exit 0) | exit 0 |
| 3 | `sentinel repo add <url>` | V4 (twice: `registered`, then `already-registered`, `repos.yaml` unchanged) | `acme/gizmo<TAB>registered<TAB>-`, exit 0 |
| 3 | `sentinel repo list` | V5 (one line, `acme/widget<TAB>url<TAB>main<TAB>-`) | exit 0, same shape |
| 3 | prose: `--harness <name>` on first add | V12 (`repo add --harness my-review`, then review without `--type` uses it) | n/a |
| 4 | `sentinel review <owner/repo> <branch> --type quick` | V7 (exit 2, `engine-error`, `failureStage engine`, `runDir`) | same |
| 4 | prose: no `--type` and no default | V6 (exit 1, message names `--type`, no run persisted) | n/a |
| 5 | `sentinel runs list <owner/repo>` | V10 | one line per run, id in field 2 |
| 5 | `sentinel runs show <owner/repo> <id>` | V10 | `key<TAB>value` block, `state engine-error` |
| 6 | `export SENTINEL_OPENCODE_MODEL=<provider/model>` | V8 (variable set via `env`) | applied via `env` in the replay |
| 6 | `sentinel review <owner/repo> <branch> --type quick --engine opencode` | V8 (exit 1 message without the variable; with it exit 2, `engine opencode`, `engine-error`, `failureStage engine`) | exit 2, `engine opencode` |
| 6 | `defaultEngine: opencode` in `config.yaml` | V9 (`engine opencode` without `--engine`) | n/a |
| 7 | `sentinel` | V14 (`</dev/null`: guidance on stderr, exit 1, stdout empty) | exit 1, same guidance |

Observed in S2 that supports doc claims: V6 stderr `No harness type for "acme/widget": pass --type or set a default harness for the repository`; V8 stderr `The opencode engine needs a model id: set SENTINEL_OPENCODE_MODEL (for example "anthropic/claude-sonnet-4") and run the review again` (exit 1, no run persisted); V13 broken-harness run directory holds only `metadata.json`.

AC-7 check (every command, subcommand, flag, env var and path in the doc exists in the saved `--help` or a CF row):

- Subcommands: `repo add`, `repo list`, `review`, `runs list`, `runs show` (Appendix A). Flags: `--help`, `--version` (root help `-V, --version`), `--type`, `--engine`, `--harness` (`repo add`). All present; no out-of-scope flags used.
- Env vars: `SENTINEL_HOME` (CF-1, root help), `SENTINEL_OPENCODE_MODEL` (CF-5, root help). Paths: `~/.sentinel` and `SENTINEL_HOME` (CF-1), `~/.sentinel/clones/` (CF-1, CF-3), `~/.sentinel/config.yaml` with `defaultEngine` (CF-1, CF-5), `metadata.json`, `prompt.md`, `result.md` (CF-13). Harness names `quick`, `pr-review`, `security` (CF-2; `harnesses/` directory). `snt` binary (V2). Example model `anthropic/claude-sonnet-4` (printed by the CLI's own error).
- Claim-to-CF: Node 22+ (CF-2 package engines); default engine claude-code, `--engine` override, `defaultEngine` (CF-5); default harness / `--type` rule (CF-4); `already-registered` (CF-3); D6 sentence (CF-12); run folder contents (CF-13, plus V7 and V13 observations above); TUI needs a terminal (CF-16); exit codes by pointer (CF-17).

AC checks: AC-2 heading shape confirmed (`grep -n '^#'`: H1, `## 1.`-`## 7.`, `## Next steps`, no TOC); AC-3 `grep -c '```mermaid' docs/quick-start.md` = 0; AC-4 `grep -inwE 'ports?|adapters?|hexagonal|use case|composition root|core|terminal state|worktrees?|pipeline' docs/quick-start.md` returns nothing (jargon-free; "harness" is printed by the CLI and typed by the user); AC-6 15 `bash` blocks each hold exactly one command, no leading `$`; placeholders `<url>`, `<owner/repo>`, `<branch>`, `<provider/model>` and `<id>` are each explained right after first use; AC-15 section 7 interactive-only with the `sentinel review` / `--help` pointer; AC-16 one D6 sentence, no command.

### Blockers

None. No CF row contradicted; no protected path touched; engine never resolvable; real `~/.sentinel`, gitconfig and npm prefix unchanged.

### QA handoff

`sddl-qa-review` deferred: non-code stage, self-contained, low risk; the first QA/4R pass happens after S5 per plan.

### Next action

Request `stage_approval` for S3 (`docs/build-your-own-harness.md`).

## S3 - `docs/build-your-own-harness.md`

- Approval: `stage_approval` cp-010, selected `approve`. Branch `claude/nifty-heisenberg-w3gn8z`, HEAD 0c29671. No git side effects by the executor. d-015 (quick-start section 6 fix) belongs to S4 and was not touched: `docs/quick-start.md` unchanged.
- Planned scope: create `docs/build-your-own-harness.md` per the design outline (H1, one-line purpose, sections 1-7, Next steps; exact `my-review` example; no Mermaid; no `extraSkills` or `contextMode`); run V11, V12, V13 and `verify-verdict.mts` from files extracted from the written guide.

### Changed files

| File | Change |
|---|---|
| `docs/build-your-own-harness.md` | new (H1 `Build your own harness`, `## 1.`-`## 7.`, `## Next steps` with two links; 3 `bash` blocks and 1 `yaml` snippet, plus 4 file-content blocks; no TOC, no Mermaid) |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/execution-log.md` | this entry |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/state.yaml` | S3 notes, next_action, updated_at |

Scripts were not changed (no script defect: the first S3 run used `VQ_STEPS="V11 V12 V13 V15"` and failed only because V12 and V11 need the repository registered by V4; the rerun with V4 included passed. This is a usage note, not a script bug). Nothing under `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, README, `docs/quick-start.md` or contributor docs was touched; `git status --short` shows only `docs/build-your-own-harness.md` as untracked before this log and state.yaml edits.

### Wording decisions applied

- File creation: each of the four files is a fenced block preceded by "Save this as `<path>`" (harness.md, house-rules.md, skills.yaml, output.md), and two `mkdir -p` blocks (one command each). The `my-review` example is copied exactly from design.md "Harness Example"; the VERDICT line is last (d-011).
- Section 1 states: folder name = `--type`; location `~/.sentinel/harnesses/<name>/` with a link to the quick start for the sentinel folder; table of the three files (`output.md` absent means no verdict is asked and the review usually ends `ambiguous`, CF-10); skills in `~/.sentinel/skills/<name>.md` plus the two shipped skills `code-quality` and `security` (`skills/` directory); same name as a shipped harness or skill means yours is used (confirmed in `load-harnesses.ts`: user set wins for both harness types and skill names); prompt order harness.md, skills, output.md, diff (CF-8).
- Section 4: `skills:` must be a list when `skills.yaml` exists; a name that matches no skill file breaks the harness (CF-6), pointer to section 7.
- Section 6: `--type my-review`; default through `repo add --harness` on the first add (quick start covers "adding again changes nothing", so it is linked, not repeated); `defaultHarness` snippet follows the S1 note (flat map keyed by alias, two-space indented entries; the snippet parses with the `yaml` package to `{"acme/widget": {url, baseBranch, defaultHarness}}`). Placeholders point to the quick start.
- Section 7: interactive harness list plus Ctrl+C. The exact string "Review cancelled — nothing was run." exists in `src/adapters/driving/tui/tui-flow.ts:78` (function `cancelled`), used for a cancel at the repository, branch and harness selections (exit 0). The broken-folder behavior quotes the observed `failureMessage Missing required harness.md in harness "broken"` with `state validation-failed` and `failureStage harness`; the misspelled `--type` gives `Harness not found: <name>` (V13 observed; both exit 2 and persist a run, not documented as codes). The doc does not claim what the list shows when a folder is broken (not observed); it only says to check the folder name and that it holds `harness.md`.
- Out-of-scope items not mentioned: `extraSkills`, `contextMode`, `agent`, `validations`, `--timeout`, `--changes-exit-code`, exit codes.

### Verification

1. Extraction: the four files were extracted by script from the written guide (the block following each "Save this as `...`" line) into `<scratchpad>/s3-extract/`. Byte-compare against the design.md "Harness Example" blocks:

| File | Identical to design.md | sha256 |
|---|---|---|
| `harness.md` | yes | d6857f11d4c7002d3338ebab8c9aecbbda16511ef9c5689dd54e937df1069c02 |
| `skills.yaml` | yes | 80084579333162da70154204585291e87bb5668bad7c065f65cb2ae6846b4368 |
| `house-rules.md` | yes | a1e53961ba706ea8e1bef62fe9b9c1629f639e1c9cb6e8c12161e31e194a2a3d |
| `output.md` | yes | 19777fbf86138a6c546ed4535ed8a93e4ad039c81df283646c78d3c7ff3bc12d |

The files the sandbox installed under `home/harnesses/my-review/` and `home/skills/` are `cmp`-identical to the extracted ones (V11 used `VQ_HARNESS_DIR`).

2. `VQ_HARNESS_DIR=<scratchpad>/s3-extract VQ_STEPS="V4 V11 V12 V13 V15" verify-quickstart.sh <scratchpad>/sb-s3` (fresh clone of HEAD 0c29671, same isolation as S1/S2; V1-V3 always run): exit 0, 50 checks, 0 failed. Engine absence asserted 5 of 5 before reviews (`[engine-absence] ok`); no model invoked (d-006). The two `ABORT` grep hits in the transcript are the PASS lines that say "no ABORT". V15 isolation identical before and after (real `~/.sentinel`, `~/.gitconfig`, npm prefix, source repo status).

| Step | Observed |
|---|---|
| V11 | `--type my-review` on `acme/widget feature/greeting`: exit 2, `state engine-error`, `harness my-review`, `failureStage engine` (not `harness`); `prompt.md` has the harness text, `<skill name="house-rules">`, the skill text, `<output-contract>`, the last-line rule and the diff |
| V12 | `defaultHarness: my-review` inserted under `acme/widget` in `repos.yaml`: review without `--type` gives `harness my-review`, `failureStage engine`. Second origin `acme/gizmo` added with `repo add --harness my-review`: same result |
| V13 | empty `harnesses/broken` with `--type quick`: exit 2, `validation-failed`, `failureStage harness`, `failureMessage Missing required harness.md in harness "broken"`; folder removed, then `--type my-reveiw`: `validation-failed`, `failureMessage Harness not found: my-reveiw` |

3. `node --experimental-strip-types verify-verdict.mts <sb-s3>/sentinel-kit/src/core/run/builtin-verdict-extraction.ts <scratchpad>/s3-extract/output.md`: ALL PASS (15 checks): output.md says the verdict is the last line and offers the three values; the 40-line / 4145-char synthetic answer ending in `VERDICT: request-changes` parses to `request-changes`; the verdict-first control parses to `null` (F5); approve and comment variants parse; conflicting or absent markers give `null`.

4. Greps on the written guide: `grep -ic extraskills` = 0; `grep -ic contextmode` = 0; `grep -c '```mermaid'` = 0; `grep -inwE 'ports?|adapters?|hexagonal|use case|composition root|core|terminal state|worktrees?|pipeline'` returns nothing (AC-4); heading shape H1, `## 1.`-`## 7.`, `## Next steps`, no TOC (AC-2).

Doc-command to V-step map (AC-7):

| Doc section | Doc command or claim | V-step that executes it | Result |
|---|---|---|---|
| 2 | `mkdir -p ~/.sentinel/harnesses/my-review` | V11 (`write_example_harness` creates the same folder under `$SENTINEL_HOME`; `~` maps to `$SENTINEL_HOME`) | folder and files present, cmp-identical |
| 2 | `mkdir -p ~/.sentinel/skills` | V11 (same, `skills/house-rules.md`) | present |
| 3-5 | the four "Save this as" files | V11 (loaded and accepted), `verify-verdict.mts` (output.md) | accepted, parses as designed |
| 6 | `sentinel review <owner/repo> <branch> --type my-review` | V11 (`acme/widget feature/greeting --type my-review`) | `failureStage engine` |
| 6 | `sentinel repo add <url> --harness my-review` (first add) | V12 (`acme/gizmo`) | review without `--type` gives `harness my-review` |
| 6 | `defaultHarness: my-review` under the repository entry in `repos.yaml` | V12 (`acme/widget`) | same; snippet shape also parsed with `yaml` |
| 7 | interactive list and Ctrl+C message | not executable without a terminal; structural: `tui-flow.ts:78` string, `listHarnessTypes` = `loadHarnesses(...).keys()` (`container.ts:316`), the loader V11 exercises | string confirmed verbatim |
| 7 | broken folder behavior | V13 | observed message quoted |
| 7 | misspelled `--type` | V13 | `Harness not found: my-reveiw` |

AC-7 check: commands used are `mkdir -p`, `sentinel review ... --type`, `sentinel repo add <url> --harness`, `sentinel` (bare); all present in the saved help (Appendix A) or CF rows. Paths: `~/.sentinel/harnesses/<name>/`, `~/.sentinel/skills/<name>.md`, `~/.sentinel/repos.yaml` (CF-1); files `harness.md`, `output.md`, `skills.yaml` (CF-6); keys `defaultHarness` (CF-4), `skills:` (CF-6); shipped skills `code-quality`, `security` (`skills/`). Nothing from Out Of Scope is documented.

Claim-to-CF: folder name = `--type` and layout (CF-6), override by name (CF-6), prompt order (CF-8), no `output.md` leads to `ambiguous` (CF-10), verdict rule and tail position (CF-9, `verify-verdict.mts`), default harness rule (CF-4), one broken harness stops all reviews (CF-7, V13), interactive list and Ctrl+C (CF-16 plus `tui-flow.ts`).

### Blockers

None. No CF row contradicted; no protected path touched; engine never resolvable; real `~/.sentinel`, gitconfig and npm prefix unchanged.

### QA handoff

`sddl-qa-review` deferred: non-code stage, self-contained, low risk; the first QA/4R pass happens after S5 per plan.

### Next action

Request `stage_approval` for S4 (`docs/privacy.md`, README "Using sentinel" section, and the d-015 one-line fix in `docs/quick-start.md` section 6).

## Appendix A - Saved `--help` texts (AC-7 reference, from the built CLI at 5b5786e)

### `sentinel --help`

```text
Usage: sentinel [options] [command]

AI-powered code review orchestrator

Options:
  -V, --version                     print the sentinel version
  -h, --help                        display help for command

Commands:
  repo                              register and inspect the repositories
                                    sentinel reviews
  review [options] <repo> <branch>  review a branch of a registered repository
  runs                              inspect the review history of a repository
  help [command]                    display help for command

Environment variables:
  SENTINEL_HOME            Root directory for sentinel state — config, repo
                           clones, worktrees and run history.
                           Defaults to ~/.sentinel when unset or empty.
  SENTINEL_OPENCODE_MODEL  Model id (provider/model) passed to the opencode
                           engine. Required only when a review resolves to
                           the opencode engine.
```

### `sentinel repo --help`

```text
Usage: sentinel repo [options] [command]

register and inspect the repositories sentinel reviews

Options:
  -h, --help           display help for command

Commands:
  add [options] <url>  register a repository, cloning it unless a local path is
                       given
  list                 print one record per registered repository
  help [command]       display help for command
```

### `sentinel repo add --help`

```text
Usage: sentinel repo add [options] <url>

register a repository, cloning it unless a local path is given

Arguments:
  url                     git URL of the repository (https or ssh)

Options:
  --local-path <path>     absolute path of an existing clone to use instead of
                          cloning
  --base-branch <branch>  base branch reviews diff against (detected from the
                          repository when omitted)
  --harness <name>        default harness `sentinel review` uses for this
                          repository
  -h, --help              display help for command
```

### `sentinel repo list --help`

```text
Usage: sentinel repo list [options]

print one record per registered repository

Options:
  -h, --help  display help for command
```

### `sentinel review --help`

```text
Usage: sentinel review [options] <repo> <branch>

review a branch of a registered repository

Arguments:
  repo                     repository alias, as printed by `sentinel repo list`
  branch                   branch or ref to review, diffed against its base

Options:
  --type <harness>         harness to review with (defaults to the repository's
                           harness)
  --engine <engine>        review engine for this run (claude-code or opencode)
  --timeout <ms>           wall-clock budget for the engine invocation, in
                           milliseconds
  --changes-exit-code <n>  exit code when the verdict is request-changes (0-255,
                           0 for a soft gate) (default: 1)
  -h, --help               display help for command

Exit codes:
  0  the review passed — verdict approve or comment (non-blocking)
  1  changes requested — configurable via --changes-exit-code (0 for a
     soft gate that still passes)
  2  the review could not complete — ambiguous, engine-error, timeout or
     validation-failed
```

### `sentinel runs --help`

```text
Usage: sentinel runs [options] [command]

inspect the review history of a repository

Options:
  -h, --help        display help for command

Commands:
  list <repo>       print one record per stored run, oldest first
  show <repo> <id>  print the stored record of a single run
  help [command]    display help for command
```

### `sentinel runs list --help`

```text
Usage: sentinel runs list [options] <repo>

print one record per stored run, oldest first

Arguments:
  repo        repository alias, as printed by `sentinel repo list`

Options:
  -h, --help  display help for command
```

### `sentinel runs show --help`

```text
Usage: sentinel runs show [options] <repo> <id>

print the stored record of a single run

Arguments:
  repo        repository alias, as printed by `sentinel repo list`
  id          run id, as printed by `sentinel runs list`

Options:
  -h, --help  display help for command
```
