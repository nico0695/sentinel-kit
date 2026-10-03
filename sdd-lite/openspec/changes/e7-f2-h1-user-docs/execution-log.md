# Execution Log

## Stage Overview

| Stage Id | Goal | Status | Approval | Notes |
|---|---|---|---|---|
| S1 | Verification scripts + dry baseline | completed (pending QA/next approval) | cp-008 (user, 2026-10-03T16:10:00Z) | 2 scripts written; baseline green, 79/79 checks; no contradictions |
| S2 | `docs/quick-start.md` | completed (pending next approval) | cp-009 (user, 2026-10-03T16:40:00Z) | doc written; V1-V15 green 79/79; doc commands replayed literally; no contradictions |
| S3 | `docs/build-your-own-harness.md` | completed (pending next approval) | cp-010 (user, 2026-10-03T17:20:00Z) | doc written; V4/V11/V12/V13/V15 green 50/50 from the guide's literal files; verdict check ALL PASS; no contradictions |
| S4 | `docs/privacy.md` + README section | completed (pending next approval) | cp-011 (user, 2026-10-03T18:00:00Z) | privacy.md written (d-014 applied), README section inserted, d-015 one-line fix applied; all S4 greps clean; no contradictions |
| S5 | Full verification + gate | completed (pending 4R review / final QA) | cp-012 (user, stage_approval) | full verify 79/79 + literal replay 38/38 + verdict 15/15; `npm run check` and `npm test` exit 0 (1039 tests); diff = 3 docs + README + sdd-lite only; AC-1..AC-18 PASS (AC-5 with caveat), AC-19 open at PR step; not-verified-live caveat (d-006) |

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

## S4 - `docs/privacy.md`, README section, d-015 fix

- Approval: `stage_approval` cp-011, selected `approve`. Branch `claude/nifty-heisenberg-w3gn8z`, HEAD ab2f590. No git side effects by the executor (no add/commit/stash/push).
- Planned scope: create `docs/privacy.md` (applying d-014); insert the design's "Using sentinel" block immediately before `## Quick start (development)` in `README.md`; apply d-015 (single-line change in `docs/quick-start.md` section 6).

### Changed files

| File | Change |
|---|---|
| `docs/privacy.md` | new (H1, purpose line, sections 1-5, Next steps, one Mermaid in section 1) |
| `README.md` | one added block, "Using sentinel", before `## Quick start (development)` |
| `docs/quick-start.md` | one line: "To use OpenCode for one review, name a model first:" became "OpenCode needs a model id. Set it first:" (d-015) |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/execution-log.md` | this entry |
| `sdd-lite/openspec/changes/e7-f2-h1-user-docs/state.yaml` | S4 notes, next_action, updated_at |

`git status --short` before these log edits: `M README.md`, `M docs/quick-start.md`, `?? docs/privacy.md`. Nothing under `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, `docs/build-your-own-harness.md` or contributor docs was touched. Scripts unchanged. No sandbox run and no engine call were needed (no claim required observation beyond S1-S3 evidence and code reading).

### Wording decisions applied

- d-014: section 2 does not show `claude -p`, `--model` or any invocation flags. Claude Code line: "it runs with your own Claude Code permission settings. sentinel adds no limits of its own." OpenCode line kept: "sentinel blocks file edits, shell commands and web fetches" (verified in `permission-config.ts`: `permission: { edit: "deny", bash: "deny", webfetch: "deny" }`, passed to `opencode run` through `OPENCODE_CONFIG` in `opencode-adapter.ts`).
- Run folder contents are qualified (S2/S3 evidence): `metadata.json` always; `prompt.md` is "the prompt as sent"; `result.md` "only when the engine gave one"; `validations/` "only when some ran". "Every review that started keeps its folder, whatever its outcome" plus "A review that sentinel refuses to start, for example when `--type` is missing, keeps nothing" (V6/V8: pre-run errors persist no run). The doc does not spell the `runs/<owner>__<repo>/<id>` path (A-8); it says `~/.sentinel/runs/` and the printed `runDir`.
- "Until you delete it": no code under `src/` removes a finalized run folder (only staging remnants in `run-store-fs.ts`), so there is no retention policy to describe.
- Validation commands appear as one list item ("the output of the repository's check commands, when you set any up") and are not explained or named as a config field (out of scope per spec; the design allows a clause only).
- The temporary copy: "sentinel removes that copy when the review ends" rests on `cleanupPolicy ?? "always"` (`run-review.ts:543`) with no override anywhere in `src/` outside tests.
- Jargon-free wording: "temporary copy of the branch" instead of the internal term; "engine CLI", "model provider", "harness", "skills", `runDir`, `--type` are the printed or typed names.
- Install, harness, and placeholder explanations are not repeated: privacy links to the Quick start for the sentinel folder and lists both docs under Next steps (AC-5).

### Claim-to-CF / code map (AC-14)

| Privacy claim (section) | CF row / code reference |
|---|---|
| Prompt holds harness instructions, skills, answer format (when the harness has one), diff (1) | CF-8, `assemble-prompt.ts` (`<instructions>`, `<skills>`, `<output-contract>` only if `output.md`, `<diff>`) |
| Output of check commands is in the prompt when set up (1) | CF-8, `assemble-prompt.ts:12,26,86` (`<validation-output>`) |
| Prompt goes to the chosen engine CLI (Claude Code or OpenCode) (1) | CF-5, CF-14; prompt on stdin: `claude-code-adapter.ts:119`, `opencode-adapter.ts` (`input: request.prompt`) |
| The CLI sends it to its provider under that tool's own account and settings; sentinel does not talk to the provider (1) | CF-15 (no HTTP client in `src/`; grep for `node:http(s)`, `node:net`, `fetch(`, `XMLHttp`, `WebSocket` outside tests returns nothing) |
| Engine reads files in a temporary copy of the branch, not only the diff (2) | CF-14: cwd = `request.worktree.path` in both adapters; `git worktree add --detach` in `git-cli.ts:170` |
| sentinel removes the copy when the review ends (2) | `run-review.ts:543` (`cleanupPolicy ?? "always"`), `git-cli.ts:185` (`worktree remove --force`) |
| OpenCode: edits, shell commands, web fetches blocked (2) | CF-14: `permission-config.ts` deny config, `opencode-adapter.ts` sets `OPENCODE_CONFIG` for pre-flight and run |
| Claude Code: your own permission settings, sentinel adds no limits (2) | CF-14: claude adapter passes no permission flags or config |
| `~/.sentinel/clones/` full copy of each registered repository (3) | CF-1, CF-3 (clone into `clones/<owner>/<repo>`) |
| `~/.sentinel/runs/` one folder per review, the printed `runDir` (3) | CF-1, CF-13 (`format-review.ts` prints `runDir`) |
| Folder kept for every review that started, whatever the outcome; contents vary (3) | CF-13 (corrected: `run-store-fs.ts:218-245`); S2 V13 (harness-stage failure holds only `metadata.json`), V7 (engine-error holds `metadata.json` and `prompt.md`) |
| `prompt.md` includes the diff; `result.md` only if engine answered; `validations/` only if some ran (3) | `run-store-fs.ts:223-245` (each written conditionally), CF-13 |
| Refused-to-start review keeps nothing (3) | S1/S2 V6, V8 (exit 1, no run persisted) |
| Kept until you delete it (3) | no pruning code for final run folders (grep of `src/`) |
| Only git traffic: download at repo add, fetch when interactive mode lists branches (4) | CF-15, CF-12; `git-cli.ts:70` (clone), `git-cli.ts:76-81` (fetch), `list-branches.ts:35` |
| No other network calls, no usage data (4) | CF-15 (no HTTP client; runtime deps are `commander`, `execa`, `yaml`, `zod`, `@clack/prompts`, `picocolors`) |
| No stored passwords or tokens; git uses your own git setup; engine uses its own login (5) | CF-15; `git-cli.ts:43-56` (only `GIT_TERMINAL_PROMPT=0`, no credential handling); engine adapters pass no credentials |

Claim limits: none removed or softened in S4; every claim above has a CF or code reference.

### Verification

| Check | Command or method | Result |
|---|---|---|
| Mermaid count | `grep -c '```mermaid'` on privacy, quick-start, harness guide | 1, 0, 0 |
| Mermaid shape | read: nodes A-E (5 distinct, below the 8 limit); `grep -nE 'style |classDef|%%\{init' docs/privacy.md` | 5 nodes; no matches |
| d-014 | `grep -nE 'claude -p|--model' docs/privacy.md` | empty |
| OpenCode sentence | read section 2 | present, verified against `permission-config.ts` |
| AC-4 jargon | `grep -inwE 'ports?|adapters?|hexagonal|use case|composition root|core|terminal state|worktrees?|pipeline' docs/privacy.md` | empty |
| AC-2 shape | `grep -n '^#' docs/privacy.md` | H1 `What sentinel sends and stores`, `## 1.`-`## 5.`, `## Next steps`; no TOC |
| Language policy | non-ASCII grep on privacy.md | none |
| Links | every relative link in README, quick-start, build-your-own-harness, privacy resolved to an existing file | all ok, none broken |
| README diff | `git diff README.md` | one added block (6 lines) before `## Quick start (development)`; nothing else |
| d-015 diff | `git diff docs/quick-start.md` | single-line change (1 insertion, 1 deletion) |
| AC-7 | commands, flags, env vars, paths in privacy.md | `--type` (typed by the user, in the saved `review --help`), `~/.sentinel`, `~/.sentinel/clones/`, `~/.sentinel/runs/` (CF-1), `metadata.json`, `prompt.md`, `result.md`, `validations/` (CF-13); no commands, no env vars; nothing out of scope documented |

### Blockers

None. No CF row contradicted; no protected path touched.

### QA handoff

`sddl-qa-review` deferred: non-code stage, self-contained, low risk; the first QA/4R pass happens after S5 per plan.

### Next action

Request `stage_approval` for S5 (full verification against the written docs and gate). S5 should also re-check that quick-start section 6 still runs through `verify-quickstart.sh` unchanged by the d-015 wording and that `git diff --stat main` shows only the 3 docs, README and sdd-lite/history.

## S5 - Full verification and gate

- Approval: `stage_approval` cp-012, selected `approve`. Branch `claude/nifty-heisenberg-w3gn8z`, HEAD 9998593 (S4 at 3c330e6); `origin/main` fetched, = 8c63ed3 (`git ls-remote` of the documented GitHub URL also returns 8c63ed3, so the clone URL in the quick start resolves). Working tree clean at start and at end except for the two sdd-lite files this stage edits. No git side effects by the executor (no add/commit/stash/push).
- Planned scope: compare doc commands with what the scripts execute; full `verify-quickstart.sh` in a fresh sandbox with `VQ_HARNESS_DIR` = files extracted from the written guide; `verify-verdict.mts`; cross-doc read (AC-5, d-001 format); final AC-1..AC-19 table; `npm run check`, `npm test`; blast-radius diff.
- Edited by this stage: `execution-log.md`, `state.yaml` only. Scripts and docs were NOT changed (no script defect, no doc defect found). One environment action: `npm ci` in the repo to create the git-ignored `node_modules/` (absent in this session) so the gates can run; `git status --short --ignored` shows `!! node_modules/` only, no tracked change.

### Evidence artifacts (scratchpad `.../scratchpad/`)

| Artifact | What it is |
|---|---|
| `s5-extract/` | the four `my-review` files extracted by script from the written guide ("Save this as `path`" + next fenced block); sha256 identical to the S3 extraction and to design.md's Harness Example (harness.md d6857f11..., skills.yaml 80084579..., house-rules.md a1e53961..., output.md 19777fbf...) |
| `sb-s5/` | fresh sandbox of HEAD 9998593 (clone HEAD asserted equal to source HEAD); transcript `sb-s5/log/transcript.txt`; run output `s5-run.txt` |
| `s5/replay.py`, `s5-replay.txt` | literal replay of the doc blocks (below), scratch only, not committed |
| `s5-verdict.txt`, `s5-check.txt`, `s5-test.txt` | verdict check, `npm run check`, `npm test` output |

### 1. Doc commands vs what the scripts execute

Extraction (script, not by eye): `quick-start.md` has 15 `bash` blocks, `build-your-own-harness.md` 3, `privacy.md` 0 (its only fence is the Mermaid block; the doc has no command). Every `bash` block holds exactly one line (checked with an awk pass); no leading `$`. Mapping applied: `~/.sentinel` to `$SENTINEL_HOME` (script) or to the default home under a sandbox `HOME` (replay), GitHub URL to a local clone of the branch (script, per plan), `<url>` to the local `file://` origin, `<owner/repo>` = `acme/widget`, `<branch>` = `feature/greeting`.

| # | Doc | Doc command | verify-quickstart.sh step | Literal replay (SENTINEL_HOME unset, `~/.sentinel` real default) |
|---|---|---|---|---|
| 1 | QS 1 | `node --version` | V2 (`run V2-node-version node --version`, v22.22.0) | executed, exit 0, major >= 22 |
| 2 | QS 2 | `git clone https://github.com/nico0695/sentinel-kit.git` | V2 (`git clone --no-hardlinks --branch <branch> <local repo>`; URL differs by design) | not replayed; URL resolves (`git ls-remote` returns 8c63ed3) |
| 3 | QS 2 | `cd sentinel-kit` | V2 (`cd "$CLONE"`) | not replayed |
| 4 | QS 2 | `npm ci` | V2 (identical command, exit 0) | not replayed |
| 5 | QS 2 | `npm run build` | V2 (identical, exit 0) | not replayed |
| 6 | QS 2 | `npm install -g .` | V2 (identical, exit 0; `sentinel` and `snt` in prefix bin) | not replayed |
| 7 | QS 2 | `sentinel --help` | V2, V3 | executed, exit 0; `snt --help` and `sentinel --version` also exit 0 |
| 8 | QS 3 | `sentinel repo add <url>` | V4 (twice) | executed twice: `acme/widget registered`, then `already-registered`, `repos.yaml` unchanged; copy at `~/.sentinel/clones/acme/widget` |
| 9 | QS 3 | `sentinel repo list` | V5 | executed: 4 fields (name, address, base branch `main`, default harness `-`) |
| 10 | QS 4 | `sentinel review <owner/repo> <branch> --type quick` | V7 (+ V6 for the no-`--type` claim) | executed: exit 2, `state engine-error`, `failureStage engine`, `verdict -`, `runDir` under `~/.sentinel/runs/`, folder holds `metadata.json` + `prompt.md`, no `result.md`; without `--type`: exit 1, one stderr line naming `--type` |
| 11 | QS 5 | `sentinel runs list <owner/repo>` | V10 | executed: one line, field 1 = repo name, field 2 = id |
| 12 | QS 5 | `sentinel runs show <owner/repo> <id>` | V10 | executed with the listed id: `key<TAB>value` block, `state engine-error`, `failureStage`, `failureMessage` |
| 13 | QS 6 | `export SENTINEL_OPENCODE_MODEL=<provider/model>` | V8, V9 (set with `env ...`; the script does not run a literal `export`) | executed literally in one shell with block 14 |
| 14 | QS 6 | `sentinel review <owner/repo> <branch> --type quick --engine opencode` | V8 (no model: exit 1 + message; with model: exit 2, `engine opencode`, `engine-error`) | executed both ways, same results; the refused review left no run folder, the started one added exactly one |
| 15 | QS 6 | YAML block `defaultEngine: opencode` (in `~/.sentinel/config.yaml`) | V9 | block asserted equal to `defaultEngine: opencode`, written to the default home: review without `--engine` gives `engine opencode`; without the model variable it exits 1 naming `SENTINEL_OPENCODE_MODEL` (backs d-015 "OpenCode needs a model id"); `--engine claude-code` overrides it for one review |
| 16 | QS 7 | `sentinel` | V14 (`</dev/null`) | executed with stdin not a terminal: guidance on stderr naming `sentinel review`, exit 1, stdout empty |
| 17 | HG 2 | `mkdir -p ~/.sentinel/harnesses/my-review` | V11 (`write_example_harness` runs `mkdir -p "$dest" "$skills"`, a variable form, not the literal text) | executed literally under the default home, exit 0 |
| 18 | HG 2 | `mkdir -p ~/.sentinel/skills` | V11 (same function) | executed literally, exit 0 |
| 19 | HG 3-5 | four "Save this as" files (harness.md, house-rules.md, skills.yaml, output.md) | V11 via `VQ_HARNESS_DIR` (cmp-identical to the extracted files) | written to the documented paths from the doc blocks |
| 20 | HG 6 | `sentinel review <owner/repo> <branch> --type my-review` | V11 | executed: `harness my-review`, `failureStage engine` (not `harness`); `prompt.md` has the harness text, `<skill name="house-rules">`, the skill text, `<output-contract>`, the last-line rule; prompt order harness.md, skills, output.md, diff (guide section 1 claim) |
| 21 | HG 6 | prose `repo add <url> --harness my-review` | V12 (`acme/gizmo`) | covered by V12 only (same sandbox run) |
| 22 | HG 6 | YAML snippet `defaultHarness: my-review` under the repo entry | V12 | snippet keys (alias, `url`, `baseBranch`) equal the real `repos.yaml` entry keys; line inserted; review without `--type` uses `my-review`; `repo list` shows it as the default harness |
| 23 | HG 7 | broken folder, misspelled `--type` | V13 | exit 2 each; `validation-failed`, `failureStage harness`, `Missing required harness.md in harness "broken"` (verbatim as quoted in the guide); `Harness not found: my-reveiw` |
| 24 | HG 7 | interactive harness list and Ctrl+C message | not executable without a terminal | structural only: `"Review cancelled — nothing was run."` is at `src/adapters/driving/tui/tui-flow.ts:78`; `listHarnessTypes` uses the same loader V11 exercises (risk-e7f2h1-009) |
| 25 | PV | (no commands) | n/a | privacy.md contains no command, flag, or env var |

Not exercised literally (flagged, none is a defect): rows 2-6 (the install block), because the plan substitutes the local clone for the GitHub URL and V2 runs the same `npm` commands; row 13 (`export`) in the script itself, covered by the replay; rows 17-18 in the script, covered by the replay; row 21 only by V12; row 24 not at all (structural). No doc command is missing from the table. Engine absence: asserted 10 of 10 before reviews in `verify-quickstart.sh` and 12 of 12 (every `sentinel review` and bare `sentinel`) in the replay; no `ABORT`; no model invoked (d-006).

### 2. Full `verify-quickstart.sh` (fresh sandbox `sb-s5`, `VQ_HARNESS_DIR` = `s5-extract`)

`bash verify-quickstart.sh <scratchpad>/sb-s5`: exit 0, 79 checks, 0 failed (79 PASS lines, 0 FAIL). V1-V15 all PASS; clone HEAD = source HEAD = 9998593; `[engine-absence] ok` 10 times; V15 isolation: real `~/.sentinel` (absent), `~/.gitconfig`, `/opt/node22` listing and source repo status identical before and after. The sandbox `my-review` files are `cmp`-identical to the files extracted from the guide. V8 observed exit without `SENTINEL_OPENCODE_MODEL`: 1 (message only is documented). V9 (`defaultEngine: opencode` honored) PASS, which is the quick-start section 6 path after d-015.

`node --experimental-strip-types verify-verdict.mts <sb-s5>/sentinel-kit/src/core/run/builtin-verdict-extraction.ts <scratchpad>/s5-extract/output.md`: ALL PASS (15 checks), exit 0. 40-line / 4145-char answer with the verdict last parses to `request-changes`; verdict-first control parses to `null` (F5); approve and comment variants parse; conflicting or absent markers give `null`.

Literal replay (`s5/replay.py`): 38 checks, 0 failed (table above, third column).

### 3. Cross-doc read and format rules

| Check | Method | Result |
|---|---|---|
| AC-2 shape | `grep -n '^#'` per doc; line 3 | each doc: H1, one-line purpose sentence, numbered `## 1.`.. sections (QS 7, HG 7, PV 5), final `## Next steps` with exactly 2 links; no TOC (`grep` for contents / anchor lists: none). Headings inside the guide's fenced file blocks (`## Role`, `# House rules`, `## Answer format`) are file content, not doc headings. The guide's file table is a table of files, not a TOC |
| AC-3 | `grep -c '```mermaid'` | QS 0, HG 0, PV 1; PV diagram nodes A-E = 5 (< 8); `grep -nE 'style \|classDef\|%%\{init'` none. Not rendered (no mermaid tooling in the sandbox); syntax is plain `flowchart LR` with `-->`, `-.->`, `<-->` |
| AC-4 | `grep -inwE 'ports?\|adapters?\|hexagonal\|use case\|composition root\|core\|terminal state\|worktrees?\|pipeline'` and a substring variant | no hits in any of the three docs |
| AC-6 | awk over `bash` blocks | every `bash` block is one command; no `$` prompts; `<url>`, `<owner/repo>`, `<branch>`, `<id>`, `<provider/model>` each get a "Replace ..." sentence in QS (the guide links to QS for them) |
| AC-13 grep | `grep -inE 'extraskills\|contextmode'` | none in any doc |
| Out of scope | `grep` for `--timeout`, `--local-path`, `--base-branch`, `--changes-exit-code`, `validationTimeoutMs`, `diffLimits`, `reviewTimeoutMs`, `defaultBaseBranch` | none |
| Language policy | non-ASCII grep | two lines: the em dash inside the exact `output.md` example (design.md text) and the on-screen string `Review cancelled — nothing was run.` (verbatim from `tui-flow.ts:78`). Both English; the em dash is required for exactness |
| Links | every relative `.md` link in README and the three docs | all resolve, none broken |
| AC-5 (each concept once) | read | PASS-WITH-CAVEAT. Install: only QS 2. Placeholders and the sentinel folder / `SENTINEL_HOME`: only QS (guide and privacy link back). Data flow: only privacy; QS 5 and the guide link to it. Exit codes: pointer only. Two small overlaps, both present in the approved design outlines and each serving a different reader goal, listed for triage: (a) the run-folder file list (`metadata.json`, `prompt.md`, `result.md`) appears in QS 5 (reading a result) and in privacy 3 (what stays on disk, with `validations/` added); (b) what the prompt contains appears as one sentence in the guide section 1 (order of parts) and as a list in privacy 1. Neither contradicts the other (checked) |

### 4. Final AC-1..AC-19 evidence table

Legend: PASS, PASS-WITH-CAVEAT, FAIL. No FAIL.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 | PASS | `git diff --name-status origin/main...HEAD`: `A docs/quick-start.md`, `A docs/build-your-own-harness.md`, `A docs/privacy.md`, `M README.md`, plus `sdd-lite/**` only. No index file; docs dir gains exactly three files |
| AC-2 | PASS | section 3 table; H1 + one-line purpose + numbered sections + `## Next steps` (2 links each) + no TOC for all three docs |
| AC-3 | PASS | section 3: Mermaid 0 / 0 / 1, 5 nodes, no `style` / `classDef` / `%%{init` |
| AC-4 | PASS | section 3: jargon grep empty in all three docs |
| AC-5 | PASS-WITH-CAVEAT | section 3: two small overlaps (run-folder file list QS 5 / PV 3; prompt composition guide 1 / PV 1), both in the approved outlines |
| AC-6 | PASS | one command per `bash` block (awk check), no `$`, placeholders explained once in QS |
| AC-7 | PASS | doc-command table in section 1; flags used: `--help`, `--type`, `--engine`, `--harness` (all in saved Appendix A help; `--version` was run in the replay but is not in any doc); subcommands `repo add`, `repo list`, `review`, `runs list`, `runs show` (Appendix A); env vars `SENTINEL_HOME`, `SENTINEL_OPENCODE_MODEL` (root help); config keys `defaultEngine` (V9), `defaultHarness` (V12, replay); factory harnesses `quick`, `pr-review`, `security` and skills `code-quality`, `security` exist in the installed package; no out-of-scope field documented |
| AC-8 | PASS | QS 2 is the single install section: `git clone`, `npm ci`, `npm run build`, `npm install -g .`; "Node 22 or newer" is stated in QS 1 (prerequisites, directly before it) as the design outline places it; `package.json` `engines.node` is `>=22` |
| AC-9 | PASS | `sb-s5` run: V1-V15, 79/79; clone of branch HEAD, isolated `SENTINEL_HOME`, isolated npm prefix, local bare origin with a feature branch; `repo add`, `repo list`, `review` with and without `--type`, `runs list`, `runs show` give the documented shapes; replay 38/38 |
| AC-10 | PASS | 10 of 10 (script) and 12 of 12 (replay) `[engine-absence] ok` before every review / bare `sentinel`; reviews end `engine-error` at `failureStage engine` (V7, V8, V9, V11, V12); no ABORT; V15 isolation unchanged |
| AC-11 | PASS | V11 and replay: `--type my-review` reaches stage `engine`, not `harness`; `prompt.md` holds the instructions, `<skill name="house-rules">` and its text, `<output-contract>` and the last-line rule, then the diff |
| AC-12 | PASS | `verify-verdict.mts` ALL PASS (15): output.md asks for the exact last line `VERDICT: approve\|request-changes\|comment`; a 40-line / 4145-char answer shaped by it parses to `request-changes` with the built-in parser from the sandbox clone; verdict-first control gives `null` |
| AC-13 | PASS | guide section 1 (folder name = `--type`, `harness.md` required, same name overrides the shipped one) and section 7 (one broken folder stops every review, `Harness not found`); V13 and replay confirm; `extraSkills` not mentioned (grep) |
| AC-14 | PASS | claim-to-CF map recorded in the S4 entry above ("Claim-to-CF / code map (AC-14)"), 17 rows, every claim traced; re-checked in S5: Mermaid shape, d-014 (`grep -nE 'claude -p\|--model' docs/privacy.md` empty), run-folder claims against V6/V7/V13 and the replay (engine-error run holds `metadata.json` + `prompt.md`, no `result.md`; refused run keeps nothing; run dir under `~/.sentinel/runs/`; managed copy under `~/.sentinel/clones/`); no claim removed or softened in S5 |
| AC-15 | PASS | QS 7: interactive-only, needs a terminal, scripts and CI use `sentinel review`, exit codes by pointer to `sentinel review --help`; V14 and replay: no terminal gives guidance, exit 1 |
| AC-16 | PASS | QS 4: one sentence, "`sentinel review` works on the copy downloaded at `repo add`; it does not pick up changes pushed later." (d-012); no command to run |
| AC-17 | PASS | `git diff origin/main...HEAD -- README.md`: exactly six added lines (the "Using sentinel" heading, blank, three links, blank) before `## Quick start (development)`; text identical to the design block; nothing removed |
| AC-18 | PASS | no path under `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, `package-lock.json`, `CONTRIBUTING.md`, or contributor docs in the diff (grep: none; allow-list check: none outside docs/3 files, README, sdd-lite); `npm run check` exit 0 (biome 165 files, tsc, depcruise 107 modules / 254 dependencies, no violations); `npm test` exit 0 (50 files, 1039 tests passed) |
| AC-19 | OPEN (post-execution) | not an executor deliverable: F1-F7 are filed at PR time by the orchestrator and listed in the PR body with the d-006 gap. S5 check done: no doc promises a fix for F1-F7 (D6 sentence states a limitation; guide states the broken-folder behavior; QS 7 points to `--help` for exit codes) |
| Not verified live (d-006, risk-e7f2h1-002) | CAVEAT, must be disclosed in QA and PR | no real engine was ever invoked and `claude` / `opencode` were unreachable by construction. The following rest on code reading, fixtures and the pre-flight failure path, not on a real review: a review reaching `state ok`; a `verdict` other than `-`; `result.md` appearing; the shape and content of an engine answer; `runs show` of an `ok` run; the exit codes 0 and 1; Claude Code and OpenCode behavior inside the temporary copy (permissions, file reads, deny config); a real model provider receiving the prompt. Also not driven (no terminal): the interactive flow in QS 7 and the harness list / Ctrl+C step in guide 7 (structural check only, risk-e7f2h1-009) |

### 5. Gate (repository, not the sandbox)

| Command | Exit | Result |
|---|---|---|
| `npm run check` (biome check, tsc --noEmit, depcruise src) | 0 | `Checked 165 files ... No fixes applied`; `no dependency violations found (107 modules, 254 dependencies cruised)` |
| `npm test` (vitest run) | 0 | Test Files 50 passed (50); Tests 1039 passed (1039) |

Biome and tsc do not cover `.md` (AC-18 note); doc correctness rests on sections 1-4. `git status --short` after both gates: clean (no tracked changes, no stray `runs/` or `worktrees/`).

### 6. Blast radius (`git diff --stat origin/main...HEAD`, 12 files, 2604 insertions, 0 deletions)

`README.md` (+6), `docs/quick-start.md` (+166), `docs/build-your-own-harness.md` (+130), `docs/privacy.md` (+61), and `sdd-lite/openspec/changes/e7-f2-h1-user-docs/` (design, execution-log, plan, proposal, spec, state, `verify-quickstart.sh`, `verify-verdict.mts`). Working tree equals HEAD before this stage's two edits. `history/**` not yet present (post-execution step).

### Observations for 4R / QA triage (not defects, no doc edit made)

1. `npm install -g .` from a directory installs a symlink to the cloned folder (`prefix/lib/node_modules/@nico0695/sentinel -> ../../../../sentinel-kit`). The quick start does not say to keep the `sentinel-kit` folder; deleting it breaks the `sentinel` command. No claim in the doc is false; an optional one-line note in QS 2 would prevent a surprise. Moot once #45 replaces the install step (risk-e7f2h1-001).
2. The AC-5 overlaps above (run-folder file list, prompt composition), if the reviewer wants strict single-explanation: privacy 3 could link to QS 5 for the file list, keeping only the privacy-relevant points (prompt.md contains the diff, kept until deleted).
3. The Mermaid in privacy.md was not rendered (no tooling); syntax reviewed by eye only.

### Blockers

None. No CF row contradicted; no doc claim found false; no protected path touched; engine never resolvable; real `~/.sentinel`, gitconfig and npm prefix unchanged.

### QA handoff

Recommended: 4R review of the frozen diff, then final `sddl-qa-review` (per plan post-execution steps); the QA report must disclose the not-verified-live gap (d-006, risk-e7f2h1-002).

### Next action

Orchestrator: 4R review triage, then final QA, then history entry, F1-F7 filing and PR (`Closes #43`).

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
