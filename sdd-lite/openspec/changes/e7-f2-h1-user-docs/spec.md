# Spec

## Routing Digest

- change_name: e7-f2-h1-user-docs
- objective: new-feature (docs-only story `[E7.F2.H1]`, issue #43)
- route: continue-lite
- digest_summary: >-
  Three flat user docs (`docs/quick-start.md`, `docs/build-your-own-harness.md`,
  `docs/privacy.md`) plus a links-only README section. Every command, flag, path and
  behavior claim is traced to code. Verification is structural (d-006): no model call,
  engines unreachable, quick start executed in an isolated sandbox up to the engine
  pre-flight. Code facts found here narrow the config fields documented and surface
  two B decisions (D5 verdict position in the harness example, D6 stale managed clone).
- scope_digest: 3 new `.md` files under `docs/`, one README link section; nothing in `src/`, `e2e/`, `package.json`, contributor docs.
- acceptance_digest: AC-1..AC-19 (issue criteria, d-001 format, CLI-truth, harness accepted + verdict-parseable, sandboxed quick start run, privacy claims with code refs, gates, follow-up issues).

## Summary

- change_name: e7-f2-h1-user-docs
- objective: new-feature
- route: continue-lite
- status: partial — usable; D5 and D6 (B) gate design wording of two sections.

## Scope Boundary

### In Scope

- `docs/quick-start.md`: prerequisites (Node 22+, git, one engine CLI installed and logged in), install from source as ONE isolated section (`git clone`, `npm ci`, `npm run build`, `npm install -g .`), `sentinel repo add <url>` (optionally `--harness`), `sentinel review <repo> <branch> --type <harness>`, reading the result (`runs list`, `runs show`, the run folder), engine choice (`--engine`, `defaultEngine` in `config.yaml`, `SENTINEL_OPENCODE_MODEL` for opencode), interactive mode (bare `sentinel`), scripts/CI pointer to `sentinel review --help` for exit codes, the D6 refresh guidance.
- `docs/build-your-own-harness.md`: folder layout under `$SENTINEL_HOME/harnesses/<name>/` (`harness.md` required; `output.md`, `skills.yaml` optional), user skills in `$SENTINEL_HOME/skills/<name>.md`, override-by-name of factory harnesses/skills, one complete example (all three files), selecting it (`--type`, `repo add --harness`, `defaultHarness` in `repos.yaml`), how to check it is picked up, the "one broken harness stops every review" rule.
- `docs/privacy.md`: what goes to the engine, what the engine can read, where it goes, what stays on disk, what sentinel itself sends (nothing but git traffic), credentials.
- `README.md`: a "Using sentinel" list with the three links, placed before "Quick start (development)"; no other README edit.
- Filing follow-up GitHub issues F1-F7 (below) at the executor/PR stage.

### Out Of Scope

- Any change to `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, `biome.json`, CI.
- Contributor docs (`docs/prd-sentinel.md`, `architecture.md`, `coding-standards.md`, `testing.md`, `setup-tecnico-sentinel.md`, `backlog-mvp-sentinel.md`, `docs/engines/`, `CONTRIBUTING.md`).
- License (#44), release/publish (#45), fixes for F1-F7, a 4th doc, a docs site.
- Documenting fields not wired end to end (`extraSkills`) or outside the d-005 fold (`validations`, `validationTimeoutMs`, `diffLimits`, `reviewTimeoutMs`, `defaultBaseBranch`, per-repo `defaultEngine`, `--timeout`, `--local-path`, `--base-branch`).
- Restating the exit-code table (pointer to `sentinel review --help` only).

### Non-Goals

- Any live model call or real review run (d-006).
- Explaining architecture or internals.

## Code Facts (verified; the docs may only claim these)

| # | Fact | Code reference |
|---|---|---|
| CF-1 | Home is `$SENTINEL_HOME` if set and non-blank, else `~/.sentinel`; holds `config.yaml`, `repos.yaml`, `harnesses/`, `skills/`, `clones/`, `worktrees/`, `runs/` | `src/main/paths.ts` |
| CF-2 | Factory harnesses `quick`, `pr-review`, `security` and skills ship in the package | `package.json` `files`; `harnesses/` |
| CF-3 | `repo add <url> [--local-path] [--base-branch] [--harness]`; alias = last two URL segments (`owner/repo`); clone into `clones/<owner>/<repo>`; re-adding returns `already-registered` and changes nothing | `repo-commands.ts:59-83`; `register-repo.ts` |
| CF-4 | `review <repo> <branch> [--type] [--engine] [--timeout] [--changes-exit-code]`; harness = `--type` else repo `defaultHarness` else error | `review-command.ts`; `resolve-review-request.ts:106` |
| CF-5 | Engine = `--engine` > repo `defaultEngine` > `config.yaml` `defaultEngine` (default `claude-code`); opencode needs `SENTINEL_OPENCODE_MODEL`; claude-code runs `claude -p --model sonnet` | `resolve-engine.ts`; `container.ts:139-157`; `claude-code-adapter.ts:26,116` |
| CF-6 | Harness loader: `harness.md` required, `output.md` optional, `skills.yaml` optional (`skills: [..]`, `contextMode` default `inline`; `agent` fails); user dir wins over factory by name; a missing skill or invalid file fails | `harness-loader-fs.ts`; `load-harnesses.ts`; `assemble-prompt.ts:17` |
| CF-7 | Every review loads ALL harnesses, so one broken harness folder fails every review (`validation-failed`) | `run-review.ts` stage 2; `classifyFailure` |
| CF-8 | Prompt = `<instructions>` + `<skills>` + `<output-contract>` (only if `output.md`) + `<diff>` (+ validation output) | `assemble-prompt.ts` |
| CF-9 | Verdict parser: exact `VERDICT: approve|request-changes|comment` on its own line, case-sensitive, searched ONLY in the tail window (longer of last 30 lines / last 2000 chars); none or conflicting = `ambiguous` | `builtin-verdict-extraction.ts:24-26` |
| CF-10 | Without `output.md` nothing in the prompt asks for a verdict, so a harness is *accepted* but the run likely ends `ambiguous` | CF-8 + CF-9 |
| CF-11 | `extraSkills` is parsed but never passed to `loadHarnesses` (not wired) | `run-review.ts` stage 2; `container.ts` `listHarnessTypes` |
| CF-12 | `review` never fetches; only the TUI branch step fetches; a bare base name resolves to the local branch first, so the base stays as of clone time | `list-branches.ts:35`; `git-cli.ts` `revParseCommit` |
| CF-13 | Each run persists `metadata.json`, `prompt.md` (contains the diff), `result.md`, `validations/` under `runs/<owner>/<repo>/<timestamp>/`, whatever the outcome; the review prints `runDir` | `run-store-fs.ts:218-245`; `format-review.ts` |
| CF-14 | Engine process runs with cwd = a temporary checkout of the reviewed branch; prompt on stdin; opencode is denied edit/bash/webfetch; claude-code gets no extra restriction from sentinel | `claude-code-adapter.ts:116-120`; `opencode-adapter.ts:164`; `permission-config.ts:13` |
| CF-15 | sentinel's own outbound traffic is git only (clone, fetch); no HTTP client; no credential storage | `git-cli.ts`; grep of `src/` |
| CF-16 | Bare `sentinel` needs stdin AND stdout TTYs, else prints guidance to stderr and exits 1; empty registry prints a hint and exits 0 | `src/main/cli.ts`; `tui-flow.ts:73-114` |
| CF-17 | Exit codes: 0 approve/comment, `--changes-exit-code` (default 1) request-changes, 2 any non-ok; usage and pre-run errors also exit 1 | `exit-code.ts`; `create-cli.ts` `runProgram` |

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| New user follows quick start | Installs, registers a repo, runs a review, finds the run folder | Verified up to engine pre-flight (d-006) |
| Engine not installed | Review ends `engine-error`, run persisted, exit 2 | CF-13, CF-17 |
| `review` without `--type` and no default | One-line error naming `--type` | CF-4 |
| User adds harness `my-review` | Appears in interactive harness list; `--type my-review` passes the harness stage; `prompt.md` contains its text | CF-6, CF-13 |
| Misspelled `--type` | `validation-failed`, message `Harness not found: <name>` | CF-6 |
| Harness without `output.md` | Accepted; verdict not requested; likely `ambiguous` | CF-10; guide example always ships `output.md` |
| Piped/scripted bare `sentinel` | Guidance on stderr, exit 1; docs point scripts to `sentinel review` | CF-16; #82 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Exactly three new files: `docs/quick-start.md`, `docs/build-your-own-harness.md`, `docs/privacy.md`; flat, no index files | `git diff --stat origin/main` | must |
| AC-2 | Each doc has: H1 title; a one-line purpose sentence; numbered sections with short headings; a final "Next steps" with 1-2 links; no TOC | Manual review per doc | must |
| AC-3 | At most one Mermaid block per doc, fewer than 8 nodes, no `style`/`classDef`/`%%{init}`; only where it shows a flow | grep + count | must |
| AC-4 | No internal jargon: none of `port`, `adapter`, `hexagonal`, `use case`, `composition root`, `core`, `terminal state`, `worktree`, `pipeline` (case-insensitive, prose and headings) unless printed on screen or typed by the user | grep with the list; reviewer judgment on hits | must |
| AC-5 | Each concept explained once; other docs link to it (install only in quick start; data flow only in privacy) | Manual cross-doc read | must |
| AC-6 | One command per code block step; blocks are copy-pastable (no prompts `$`, placeholders in `<angle>` form explained once) | Manual review | must |
| AC-7 | Every command, subcommand, flag, env var and file path in the docs exists in code/`--help` and matches CF-1..CF-17; nothing from Out Of Scope is documented | Diff each doc's commands against `sentinel --help`, `repo add --help`, `review --help`, `runs --help` from the built CLI | must |
| AC-8 | Install is a single section using `git clone`, `npm ci`, `npm run build`, `npm install -g .`, stating Node 22+ | Manual; supports #45 swap | must |
| AC-9 | Quick start executed from a clean environment: clone of the branch HEAD into a temp dir, isolated `SENTINEL_HOME`, `npm install -g .` into an isolated `--prefix`, a local throwaway origin repo with a feature branch; `repo add`, `repo list`, `review` (with and without `--type`), `runs list`, `runs show` produce the documented output shapes | Transcript in execution-log; scratchpad only | must |
| AC-10 | No model is invoked at any point: before each `review`, `command -v claude` and `command -v opencode` fail in the shell used (PATH shim with node/npm/git and the prefix bin only); reviews end `engine-error` at stage `engine` | Transcript shows the checks | must |
| AC-11 | Harness example is complete (`harness.md`, `output.md`, `skills.yaml` + one user skill) and is *accepted*: with it in the isolated home, `review --type <example>` reaches stage `engine` (not `harness`), and the persisted `prompt.md` contains its instructions, skill and output contract | AC-10 run + inspect `prompt.md` | must |
| AC-12 | Harness example's output contract asks for the exact line `VERDICT: approve|request-changes|comment` at the position chosen in D5, and a synthetic long response shaped by that contract (>30 lines, >2000 chars) parses to that verdict with the built-in parser (no engine) | Throwaway scratch script or test invocation, not committed | must |
| AC-13 | Harness guide states: folder name = `--type` value; `harness.md` required; same name overrides the factory one; one broken harness stops every review; `extraSkills` not mentioned | Manual vs CF-6/7/11 | must |
| AC-14 | Privacy doc covers CF-8, CF-13, CF-14, CF-15 and credentials, each claim traceable to a CF row (reviewer checks the map in execution-log) | Claim-to-CF table in execution-log | must |
| AC-15 | Quick start presents bare `sentinel` as interactive-only (needs a terminal) and points scripts/CI to `sentinel review` and `sentinel review --help` for exit codes | Manual vs CF-16/17 | must |
| AC-16 | Quick start handles the stale managed clone per D6 | Manual; if a command is documented, run it in the AC-9 sandbox | must |
| AC-17 | README: only an added "Using sentinel" list linking the three docs; "Quick start (development)" and all other text unchanged | `git diff README.md` | must |
| AC-18 | `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, contributor docs unchanged; `npm run check` and `npm test` pass (biome does not cover `.md`; doc correctness rests on AC-7..AC-16) | `git diff --stat`; gate run | must |
| AC-19 | Follow-up issues F1-F7 filed (or linked to an existing issue) and listed in the PR, which also discloses the not-verified-live gap (d-006) | Issue numbers in PR body | must |

## Follow-Ups To File (not fixed here)

| Id | Friction | Reference |
|---|---|---|
| F1 | TUI empty-state hint says `repo add <alias> <url>`; real usage is `repo add <url>` | `tui-flow.ts:114` |
| F2 | `repo add --local-path` on a clone without `origin` fails default-branch detection unless `--base-branch` | `register-repo.ts` |
| F3 | `review` never fetches; base resolves to a stale local branch even after the TUI fetches | CF-12 |
| F4 | `extraSkills` in `repos.yaml` is parsed but ignored | CF-11 |
| F5 | Factory `output.md` demands the verdict as the first line, parser reads only the tail window: long reviews end `ambiguous` (candidate for #42) | CF-9; `harnesses/*/output.md` |
| F6 | `review --help` says exit 1 = changes requested; usage and pre-run errors also exit 1 | CF-17 |
| F7 | One broken user harness folder fails every review | CF-7 |

`repo add` cannot change an existing repo's defaults: already tracked by #16, link only.

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Not verified live (d-006) | medium | Result/verdict sections rest on code and fixtures; disclosed in QA and PR |
| Source install stales at #45 | medium | Isolated single section (AC-8) |
| F5 makes factory-harness reviews `ambiguous` when long | medium | Guide example avoids it if D5 = last line; product fix out of scope |
| F3 stale clone gives wrong diffs on later reviews | medium | D6 |
| `claude` lives beside `node` in the sandbox (`/opt/node22/bin`) | low | PATH shim required for AC-10 |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| D1 install path | Quick start install | - | resolved d-003 from_source |
| D2 file names | Link targets | - | resolved d-004 docs_flat |
| D3 config home | Doc count | - | resolved d-005 fold; narrowed by A-1 |
| D4 live verification | Verification scope | - | resolved d-006 structural_only |
| Harness without `output.md` | Example validity | - | resolved: accepted, no verdict requested (CF-10); example ships `output.md` |
| Config fields documented | Truthfulness | - | resolved A-1: `defaultEngine` (config.yaml), `defaultHarness` (repos.yaml), `SENTINEL_HOME`, `SENTINEL_OPENCODE_MODEL`; `extraSkills` dropped (not wired) |
| Exit codes in docs | Scope | - | resolved A-2: pointer to `review --help`, no table; #79 not user-relevant |
| TUI limit (#82) | Script safety | - | resolved A-3: interactive-only framing (AC-15) |
| README heading | Scope | - | resolved A-4: links-only "Using sentinel" list, heading kept |
| Friction issues | Traceability | execution | open: F1-F7 filed at PR stage (AC-19) |
| D5 verdict line position in the guide example | AC-12 wording, harness section | design | open, B (decision_required) |
| D6 stale managed clone in quick start | AC-16 wording | design | open, B (decision_required) |
| How the user checks a harness is picked up | Guide section | design | open: interactive harness list and/or `--type` run + `prompt.md`; design picks |

## Approval Notes

- A-1..A-4 by claude, recorded in state.yaml. A-1 applies d-005's own "verified end to end" rule.
- D5 recommend `last_line`; D6 recommend `refresh_command`. Phase validation presented (medium risks + B items).

## Budget Notes

- Over the 500-word target because the Code Facts table is the evidence base downstream stages reuse instead of rereading code.
