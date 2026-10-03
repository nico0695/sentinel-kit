# Execution Log

## Stage Overview

| Stage Id | Goal | Status | Approval | Notes |
|---|---|---|---|---|
| S1 | Verification scripts + dry baseline | completed (pending QA/next approval) | cp-008 (user, 2026-10-03T16:10:00Z) | 2 scripts written; baseline green, 79/79 checks; no contradictions |
| S2 | `docs/quick-start.md` | pending | requires its own stage_approval | |
| S3 | `docs/build-your-own-harness.md` | pending | requires its own stage_approval | |
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
