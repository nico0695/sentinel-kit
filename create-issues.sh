#!/usr/bin/env bash
# create-issues.sh — Creates milestones (epics) and issues (stories) for sentinel's MVP backlog.
# Usage: ./create-issues.sh <owner>/<repo>
# Requires: authenticated gh CLI (gh auth status). Partial idempotency: existing labels/milestones are ignored.
set -euo pipefail

REPO="${1:?Usage: ./create-issues.sh <owner>/<repo>}"

echo "==> Labels"
gh label create "required" --repo "$REPO" --color "D73A4A" --description "No MVP without this" 2>/dev/null || true
gh label create "optional" --repo "$REPO" --color "C5DEF5" --description "Optional for the MVP" 2>/dev/null || true

echo "==> Milestones (epics)"
declare -a MS=(
  "E0 — Foundations"
  "E1 — Engine spike"
  "E2 — Repos & git"
  "E3 — Harnesses & prompt"
  "E4 — Run & engines"
  "E5 — Validations & history"
  "E6 — Interface"
  "E7 — Wrap-up"
)
for m in "${MS[@]}"; do
  gh api "repos/$REPO/milestones" -f title="$m" >/dev/null 2>&1 || true
done

issue() { # $1=title $2=labels $3=milestone $4=body
  echo "  -> $1"
  gh issue create --repo "$REPO" --title "$1" --label "$2" --milestone "$3" --body "$4" >/dev/null
}

B="Full detail: docs/backlog-mvp-sentinel.md"

echo "==> E0 — Foundations"
issue "[E0.F1.H1] Create repo and scaffold the hexagonal structure" "required" "E0 — Foundations" "**Goal**: the project exists with the structure from PRD §4.2.

- [ ] Complete structure per PRD §4.2
- [ ] \`npm run check\` runs biome+tsc
- [ ] @<scope>/sentinel package reserved on npm

**Depends on**: —
$B"
issue "[E0.F1.H2] Executable architecture guards" "required" "E0 — Foundations" "**Goal**: the 5 rules from PRD §4.5 verified automatically (dependency-cruiser).

- [ ] A forbidden import breaks the check
- [ ] Core whitelist documented in the config

**Depends on**: E0.F1.H1
$B"
issue "[E0.F1.H3] CI pipeline" "required" "E0 — Foundations" "**Goal**: nothing lands on main without quality + guards (check/test/build jobs, Node 22/24).

- [ ] 3 jobs run on PR and push to main
- [ ] Broken guard = red pipeline

**Depends on**: E0.F1.H2
$B"
issue "[E0.F2.H1] ReviewEngine port and run domain" "required" "E0 — Foundations" "**Goal**: central contract that decouples development from the spike.

- [ ] Typed port in core/run/ports
- [ ] Terminal states modeled (ok|ambiguous|engine-error|timeout|validation-failed)
- [ ] Zero I/O imports (guard green)

**Depends on**: E0.F1.H1
$B"
issue "[E0.F2.H2] FakeEngine + shared contract suite" "required" "E0 — Foundations" "**Goal**: develop and test the whole MVP without real engines.

- [ ] FakeEngine passes the contract suite
- [ ] Suite reusable by future adapters
- [ ] Error scenarios covered

**Depends on**: E0.F2.H1
$B"

echo "==> E1 — Engine spike"
issue "[E1.F1.H1] Claude Code headless spike" "required" "E1 — Engine spike" "**Goal**: resolve input/output/non-interactive mode/timeout (PRD §6.2) for Claude Code.

- [ ] Canonical invocation documented
- [ ] Successful end-to-end manual test review
- [ ] Limitations noted

**Depends on**: —
$B"
issue "[E1.F1.H2] OpenCode headless spike" "required" "E1 — Engine spike" "**Goal**: same for OpenCode; define the parsing strategy if there is no structured output.

- [ ] Canonical invocation documented
- [ ] Successful test review
- [ ] Parsing strategy defined

**Depends on**: —
$B"
issue "[E1.F1.H3] Capture real fixtures" "required" "E1 — Engine spike" "**Goal**: feed the contract tests with real output from both engines.

- [ ] ≥4 versioned fixtures per engine (valid verdict, no verdict, noisy, timeout)
- [ ] Anonymized (no personal paths or tokens)

**Depends on**: E1.F1.H1, E1.F1.H2
$B"
issue "[E1.F1.H4] Measure context modes" "optional" "E1 — Engine spike" "**Goal**: data for the context spike (PRD §6.3): inline vs autonomous diff vs skill materialization.

- [ ] Comparison table (quality, tokens, reproducibility) over 2-3 real PRs
- [ ] Recommendation for the assembler roadmap

**Depends on**: E1.F1.H1, E1.F1.H2
$B"

echo "==> E2 — Repos & git"
issue "[E2.F1.H1] Base git wrapper" "required" "E2 — Repos & git" "**Goal**: GitPort port for repo operations (execa + machine-readable output).

- [ ] clone/fetch/branches/default-branch work against a real and a test repo
- [ ] Stable parsed output
- [ ] No raw exceptions leaking into the core

**Depends on**: E0.F1.H1
$B"
issue "[E2.F1.H2] Worktrees, merge-base and diff" "required" "E2 — Repos & git" "**Goal**: core operations of the review flow.

- [ ] Worktree created/destroyed cleanly (--porcelain)
- [ ] Diff matches PR semantics (merge-base)
- [ ] Tests against a temporary git repo

**Depends on**: E2.F1.H1
$B"
issue "[E2.F2.H1] ConfigStore: schemas and persistence" "required" "E2 — Repos & git" "**Goal**: validated, typed configuration from disk (zod + yaml).

- [ ] Invalid config produces a clear error (field + reason)
- [ ] Lossless read/write roundtrip
- [ ] Types inferred in the core

**Depends on**: E0.F1.H1
$B"
issue "[E2.F2.H2] Register repo" "required" "E2 — Repos & git" "**Goal**: registerRepo use case — by URL (managed clone) or existing local path.

- [ ] Both paths work
- [ ] Re-registration detected
- [ ] Managed clone in the right location

**Depends on**: E2.F1.H1, E2.F2.H1
$B"
issue "[E2.F2.H3] List repos and branches" "required" "E2 — Repos & git" "**Goal**: listRepos and listBranches use cases (with prior fetch).

- [ ] Branches reflect the remote after fetch
- [ ] Nonexistent repo = clear domain error

**Depends on**: E2.F2.H2
$B"
issue "[E2.F2.H4] Remove/update registration" "optional" "E2 — Repos & git" "**Goal**: full lifecycle of the registration (removeRepo + config editing).

- [ ] Removal leaves no orphan worktrees
- [ ] Explicit confirmation to delete the clone

**Depends on**: E2.F2.H2
$B"
issue "[E2.F3.H1] Per-review worktree lifecycle" "required" "E2 — Repos & git" "**Goal**: guaranteed isolation; always|on-success|keep policies; orphan cleanup.

- [ ] Parallel reviews do not collide
- [ ] Configurable policy respected
- [ ] Orphans detected and reported

**Depends on**: E2.F1.H2
$B"
issue "[E2.F3.H2] Diff with size policy" "required" "E2 — Repos & git" "**Goal**: warning + per-file truncation above a configurable limit; never fails due to size (PRD §5.1).

- [ ] Configurable limit
- [ ] Warning visible in the run
- [ ] Truncation preserves the full list of affected files

**Depends on**: E2.F1.H2
$B"

echo "==> E3 — Harnesses & prompt"
issue "[E3.F1.H1] Loading and validation of harnesses/skills" "required" "E3 — Harnesses & prompt" "**Goal**: registry of review types available to the core.

- [ ] Invalid harness reported in detail
- [ ] Skills resolved in deterministic order (harness + repo)
- [ ] Built-in and user harnesses coexist

**Depends on**: E2.F2.H1
$B"
issue "[E3.F1.H2] Deterministic prompt assembler" "required" "E3 — Harnesses & prompt" "**Goal**: same input → same prompt (inline mode), auditable in the history.

- [ ] Stable snapshot for the same input
- [ ] Section order documented
- [ ] Full prompt persistable in the run

**Depends on**: E3.F1.H1
$B"
issue "[E3.F1.H3] contextMode option in harness" "required" "E3 — Harnesses & prompt" "**Goal**: door to autonomous mode opened without implementing it (PRD §6.3).

- [ ] Schema accepts contextMode: inline|agent
- [ ] Default inline
- [ ] agent fails with an explicit message, not silently

**Depends on**: E3.F1.H2
$B"
issue "[E3.F2.H1] pr-review harness" "required" "E3 — Harnesses & prompt" "**Goal**: the main harness (REJECT/REQUIRE/PREFER, severities, VERDICT).

- [ ] Complies with the conventions in PRD §5.2
- [ ] Tested with FakeEngine and in the spike
- [ ] ~100-200 lines

**Depends on**: E3.F1.H1
$B"
issue "[E3.F2.H2] security harness" "required" "E3 — Harnesses & prompt" "**Goal**: vulnerability review; security checklist as a reusable skill.

- [ ] Same output contract
- [ ] Security skill composable by other harnesses

**Depends on**: E3.F2.H1
$B"
issue "[E3.F2.H3] quick harness" "required" "E3 — Harnesses & prompt" "**Goal**: lightweight review (blockers/majors only, no validations).

- [ ] Produces a verdict with the same contract
- [ ] Noticeably shorter than pr-review

**Depends on**: E3.F2.H1
$B"
issue "[E3.F2.H4] Automatic inclusion of the target repo's AGENTS.md" "optional" "E3 — Harnesses & prompt" "**Goal**: leverage existing conventions of the reviewed repo (opt-in).

- [ ] Explicit opt-in via repo config
- [ ] Visible in the persisted prompt

**Depends on**: E3.F1.H1
$B"

echo "==> E4 — Run & engines"
issue "[E4.F1.H1] runReview use case" "required" "E4 — Run & engines" "**Goal**: complete central flow against FakeEngine (worktree→diff→prompt→engine→parsing→state→cleanup).

- [ ] Green flow with FakeEngine
- [ ] Every terminal state reachable by test
- [ ] Correct cleanup even on error

**Depends on**: E2.F3.H1, E3.F1.H2, E0.F2.H2
$B"
issue "[E4.F1.H2] Verdict and ambiguity parser" "required" "E4 — Run & engines" "**Goal**: reliable output contract (criterion ≥90% parsed).

- [ ] Fixtures from both engines parsed correctly
- [ ] Ambiguous cases detected
- [ ] Ambiguous run persisted with a marker

**Depends on**: E0.F2.H1 (fixtures: E1.F1.H3)
$B"
issue "[E4.F2.H1] engines/claude-code adapter" "required" "E4 — Run & engines" "**Goal**: first real engine behind the port (canonical invocation from the spike).

- [ ] Contract suite green (binary mocked by fixtures)
- [ ] Successful real review
- [ ] Missing/unauthenticated engine reported clearly before running

**Depends on**: E1.F1.H1, E1.F1.H3, E0.F2.H2
$B"
issue "[E4.F2.H2] engines/opencode adapter" "required" "E4 — Run & engines" "**Goal**: second engine — validates that the interface is genuine.

- [ ] Same contract suite green
- [ ] Successful real review
- [ ] Zero changes needed in the core to add it

**Depends on**: E1.F1.H2, E1.F1.H3, E0.F2.H2
$B"
issue "[E4.F2.H3] Cascading engine resolution" "required" "E4 — Run & engines" "**Goal**: global default → per-repo override → per-run override (--engine).

- [ ] Cascade respected, with tests
- [ ] Engine used recorded in the run metadata

**Depends on**: E4.F2.H1, E4.F2.H2
$B"

echo "==> E5 — Validations & history"
issue "[E5.F1.H1] ProcessRunner port + exec adapter" "required" "E5 — Validations & history" "**Goal**: safe execution of declared processes (timeout, capture, cwd in the worktree).

- [ ] Timeout kills the process
- [ ] Full output captured
- [ ] Exit code available to the domain

**Depends on**: E0.F1.H1
$B"
issue "[E5.F1.H2] Declared validations in the review flow" "required" "E5 — Validations & history" "**Goal**: repo scripts feed the context (declared only, never auto-run).

- [ ] Only declared scripts are executable
- [ ] Output visible in the persisted prompt
- [ ] Failed validation = review continues with the evidence

**Depends on**: E5.F1.H1, E4.F1.H1
$B"
issue "[E5.F2.H1] RunStore: full persistence" "required" "E5 — Validations & history" "**Goal**: self-contained run (result + prompt + metadata + logs) — requirement for the future daemon.

- [ ] Run readable without the tool (plain files)
- [ ] Nothing sensitive persisted (no tokens/env)
- [ ] Atomic writes (partial run identifiable)

**Depends on**: E4.F1.H1
$B"
issue "[E5.F2.H2] Query history" "required" "E5 — Validations & history" "**Goal**: listRuns and getRun use cases.

- [ ] Chronological order
- [ ] Corrupt/partial runs listed with a marker, without breaking the listing

**Depends on**: E5.F2.H1
$B"
issue "[E5.F2.H3] Cost/tokens per run" "optional" "E5 — Validations & history" "**Goal**: cost visibility when the engine exposes it.

- [ ] Present when the engine provides it
- [ ] Absence breaks nothing

**Depends on**: E5.F2.H1
$B"

echo "==> E6 — Interface"
issue "[E6.F1.H1] Base command CLI" "required" "E6 — Interface" "**Goal**: scriptable surface (repo add|list, review, runs list|show, --version, --help).

- [ ] Each command invokes its use case (zero logic in the command)
- [ ] Useful --help per command

**Depends on**: E2.F2.H3, E5.F2.H2
$B"
issue "[E6.F1.H2] Non-interactive sentinel review with exit codes" "required" "E6 — Interface" "**Goal**: scripting (use case 6 of the PRD) and seed of gate mode.

- [ ] Exit codes documented and tested per terminal state
- [ ] Usable from a script without a TTY

**Depends on**: E6.F1.H1, E4.F2.H3
$B"
issue "[E6.F2.H1] TUI navigation flow" "required" "E6 — Interface" "**Goal**: repo → branch (fetch) → harness → confirmation → progress → result (clack).

- [ ] Complete flow without leaving the TUI
- [ ] Cancelable at every step
- [ ] Errors shown without raw stack traces

**Depends on**: E6.F1.H1
$B"
issue "[E6.F2.H2] Result rendering in the terminal" "required" "E6 — Interface" "**Goal**: readable result on completion + path of the persisted run.

- [ ] Verdict and blockers visible at a glance
- [ ] Run path displayed

**Depends on**: E6.F2.H1
$B"
issue "[E6.F2.H3] sentinel open: interactive session in the worktree" "optional" "E6 — Interface" "**Goal**: dig into findings with the agent in context.

- [ ] Session opens in the correct worktree
- [ ] Engine respects the run config

**Depends on**: E4.F2.H3
$B"

echo "==> E7 — Wrap-up"
issue "[E7.F1.H1] E2E smoke test of the full flow" "required" "E7 — Wrap-up" "**Goal**: safety net (registration → review → history with a temporary repo + FakeEngine).

- [ ] Runs in CI
- [ ] Fails if any piece of the flow breaks

**Depends on**: E6.F1.H2
$B"
issue "[E7.F1.H2] Dogfooding and harness tuning" "required" "E7 — Wrap-up" "**Goal**: validate the success criteria of PRD §7 with real PRs (≥1 week).

- [ ] Metrics recorded (setup <5min, review <30s, ≥90% parsed)
- [ ] Harness adjustments committed
- [ ] Friction issues created

**Depends on**: E6.F2.H2
$B"
issue "[E7.F2.H1] User documentation" "required" "E7 — Wrap-up" "**Goal**: installation and configuration with no prior context.

- [ ] Quick start reproducible from scratch
- [ ] \"Build your own harness\" guide with a complete example
- [ ] Privacy note (the code travels to the chosen engine)

**Depends on**: E6.F1.H1
$B"
issue "[E7.F2.H2] License applied" "required" "E7 — Wrap-up" "**Goal**: close open decision 6 of the PRD before publishing (MIT vs private).

- [ ] Decision recorded in the PRD
- [ ] LICENSE consistent across repo and package

**Depends on**: —
$B"
issue "[E7.F2.H3] Release pipeline and first publish" "required" "E7 — Wrap-up" "**Goal**: npm i -g @<scope>/sentinel working (changesets + provenance/OIDC).

- [ ] Published with provenance
- [ ] Clean global install + sentinel --version OK
- [ ] snt alias working

**Depends on**: E7.F1.H1, E7.F2.H2
$B"

echo ""
echo "Done: 8 milestones + 44 issues created in $REPO"
