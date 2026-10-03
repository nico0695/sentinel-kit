# Proposal

## Routing Digest

- change_name: e7-f2-h1-user-docs
- objective: new-feature (docs-only backlog story; runs through execution)
- route: continue-lite (confirmed)
- digest_summary: >-
  Story `[E7.F2.H1]` (issue #43): user documentation for people who install and use
  sentinel. At most 3 flat docs, one per issue criterion (quick start, build your own
  harness, privacy), linked from `README.md`. Every command and example must be verified
  against real code; no production code changes. Four B-level decisions gate a safe spec.
- feasibility_signal: high on content (code is stable, all surfaces exist); medium on
  "reproducible from scratch" (package unpublished) and on live-engine verification.
- scope_sketch_digest: >-
  Three short user docs + a links-only README edit. Install is from source until #45 ships.
  Config docs fold into the three docs unless the user approves a 4th.

## Summary

- change_name: e7-f2-h1-user-docs
- objective: new-feature
- route: continue-lite
- proposal_status: needs-input (4 B-level decisions D1-D4, each with a recommendation)
- exploration_performed: true (about 14 files plus a sandbox install trial: the handoff required verifying CLI, harness, config and engine facts, so the 10-file budget was exceeded knowingly; no deep-explorer needed)

## Readiness Check

| Gate | Verdict | Severity | Evidence |
|---|---|---|---|
| contradiction | raised | medium | Backlog says "anyone installs" but `@nico0695/sentinel@0.0.0` is unpublished (#45); backlog lists "configuration docs" separately vs the user's 3-doc cap |
| insufficient_context | clear | | Install, CLI surface, harness loading, config schemas and engine requirements all recovered from code and a sandbox trial |
| ambiguous_framing | raised | low | Where config.yaml/repos.yaml live under the 3-doc cap (folded vs a 4th doc) changes file count and each doc's size |

## Problem And Desired Outcome

The README is contributor-oriented ("Quick start (development)", "packaging lands later").
A user cannot install sentinel, register a repo, review a branch, write a harness, or know
where their code goes. Desired outcome: a user follows the quick start from a clean machine
to a persisted review, writes their own harness from a complete example, and understands
the privacy trade-off, with no contributor knowledge.

Binding format (user-mandated, inherited by spec/design):

- Audience: installers/users. No architecture, ports, adapters or internals.
- At most 3 docs, one per issue criterion, flat (no nested folders, no index files), linked
  from `README.md`. A 4th doc is a B-level decision (D3).
- Each doc: title, one-line "what this is for", numbered steps with short headings, and a
  "Next steps" with 1-2 links. No TOC. Short sentences, one command per step, copy-pastable.
- Mermaid only where it clarifies a flow: max 1 per doc, under 8 nodes, no custom styles.
- User language ("reviews your branch"); technical terms only if seen on screen or typed.
- Contributor docs in `docs/` (PRD, architecture, coding-standards, testing, setup-tecnico,
  backlog, engines/) are not touched.

## Initial Scope Sketch

### Likely In Scope

- Quick start: prerequisites (Node 22+, git, an installed and logged-in engine), install,
  `sentinel repo add <url>`, `sentinel review <repo> <branch> --type <harness>`,
  `sentinel runs list/show`, the bare-`sentinel` TUI, review exit codes for CI.
- Harness guide: folder layout under `$SENTINEL_HOME/harnesses/<name>/` (`harness.md`
  required; `output.md`, `skills.yaml` optional), user skills, one complete working example,
  how to select it (`--type`, `defaultHarness` in repos.yaml).
- Privacy note: diff and files go to the chosen engine's provider; no telemetry; runs stored
  locally with the full diff and prompt; auth is the engine's, never persisted by sentinel.
- README: links only (plus at most a one-line pointer).

### Likely Out Of Scope

- License text (#44), release pipeline and publishing (#45), any `src/`, `e2e/` or
  `package.json` change, contributor-doc edits, a docs site, any 4th doc without approval.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Install from source | Sandbox: `npm ci`, `npm run build`, then `npm pack` + global install and `npm install -g .` both give `sentinel`/`snt`; factory harnesses resolve. No `prepare` script and `dist/` is gitignored, so `npm i -g github:...` very likely fails (inferred, untested) | high |
| CLI surface | `repo add/list`, `review <repo> <branch>`, `runs list/show`, bare TUI (TTY only, else exit 1) | high |
| Defaults trap | `review` needs `--type` unless `repo add --harness` set a default; `repo add` is idempotent so changing the default means editing repos.yaml (no config command exists) | high |
| Engine needs | `claude` or `opencode` on PATH, already logged in; opencode also needs `SENTINEL_OPENCODE_MODEL`; sentinel stores no credentials | high |
| Live verification | Sandbox has `claude` 2.1.288 logged in (host OAuth, not the user's own check); a real review spends quota and sends code to Anthropic; no `opencode` | medium |
| Friction found | TUI empty-state text says `repo add <alias> <url>` but real usage is `repo add <url>`; `repo add --local-path` without an `origin` fails default-branch detection unless `--base-branch` is passed | high |
| Gates | `biome.json` `files.includes` matches no `.md`, so new docs sit outside `npm run check`; verification is by running the documented commands | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| D1 Install path | Backlog assumes installable; reality is clone + build + global install | pending, B |
| D2 File names/location | Fixes link targets and tone vs contributor docs | pending, B |
| D3 Config docs home | 3-doc cap vs backlog "configuration docs" | pending, B |
| D4 Live engine verification | Needs consent, quota and a code-to-provider transfer | pending, B |
| Harness without `output.md` | Does the prompt still demand a `VERDICT:` line, or is the run `ambiguous`? The example must be one sentinel accepts | open, spec verifies in code |
| Which config fields are documented | Only fields verified wired end to end (e.g. `diffLimits`, `validations`) | open, spec verifies |
| Exit codes in docs | 0/1/2 is user-visible for CI; code 2 not covered e2e (#79) | open, document real behavior with caveat |
| TUI limit | Post-run prompt at stdin EOF exits 13 (#82); document the TUI as interactive-only | open |
| README heading | "Quick start (development)" would sit beside the user quick start; rename is beyond links-only | open, A-level if kept minimal |
| Friction issues | File GitHub issues for the two friction findings; not fixed here | open |

## Approval Notes

- Route `continue-lite` confirmed: docs-only, bounded, no PRD conflict. Classified B, not C,
  because no PRD text requires a published install and the backlog dependency is E6.F1.H1.
- D1 recommend: document the source install now (clone, `npm ci`, `npm run build`,
  `npm install -g .`), kept to one isolated step so #45 is a one-line change later.
  Alternatives: document only the future `npm i -g` (not reproducible, rejected); wait for #45
  (blocks a required story needlessly).
- D2 recommend: flat `docs/quick-start.md`, `docs/build-your-own-harness.md`, `docs/privacy.md`.
  Alternatives: root-level files (clutter); `docs/user/` (nested, violates the mandate).
- D3 recommend: fold in. Engine choice (`--engine`, `defaultEngine`) into quick start;
  repos.yaml `defaultHarness`/`extraSkills` into the harness guide. A 4th
  `docs/configuration.md` is justified only if the verified field set exceeds what fits.
- D4 recommend: one real review of a tiny throwaway repo with the sandbox `claude`, at the
  executor stage with explicit user approval; opencode path documented from code and marked
  unverified live. Fallback: structural verification only (install, repo add/list, runs, error
  paths), stated honestly in the QA report.
- Phase validation checkpoint: not skipped; the user must answer D1-D4 before `sddl-spec`.

## Budget Notes

- Target roughly 200 to 400 words plus tables; extended here because the user's format
  mandate had to be encoded for downstream stages.
