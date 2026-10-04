# Review Ledger

## Review Digest

- target_identity: `8fb52deb9240d38393c426758b485499e93d5462` / diff `origin/main...8fb52de -- README.md docs/quick-start.md docs/build-your-own-harness.md docs/privacy.md`, sha256 `148975f256c555bec3025d0ceaad283a9115de499ebfa69044da916d68aa0c61`
- review_mode: 4r
- judgment_target_kind: code (documentation diff)
- tier: full-4r (forced by user decision d-016; the rubric triage is `trivial`, docs only)
- scope: change:e7-f2-h1-user-docs
- round: 0
- counts: confirmed=0 suspect=0 escalated=0 info=12
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: >-
    Four docs-adapted lenses, blind to each other, one sweep each. No BLOCKER/CRITICAL, so no
    refuter pass and no protocol fix loop. Twelve info rows (one R4 row merged into R3-001 as
    a duplicate). Several info rows are real accuracy or disclosure defects in user-facing
    text (R3-001 false statement about `ambiguous`; R1-001/R1-002/R1-004/R1-005 privacy
    understatements). Whether to fix them before final QA is a user decision (review_gate
    cp-014): an optional docs-only fix stage is outside the protocol fix-round budget.
- updated_at: "2026-10-03"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|
| 1 | `8fb52de` / diff sha256 `148975f2…` | 4r | full-4r (forced, d-016) | 0 of 2 | pass_with_warnings | 2026-10-03 |

## Target

- description: Story `[E7.F2.H1]` (issue #43) — user documentation: `docs/quick-start.md`, `docs/build-your-own-harness.md`, `docs/privacy.md`, plus the README "Using sentinel" link block.
- target_kind: diff
- paths_or_diff_reference: `README.md`, `docs/quick-start.md`, `docs/build-your-own-harness.md`, `docs/privacy.md`
- changed_lines: 363 (363 insertions, 0 deletions)
- immutable_reference: commit `8fb52deb9240d38393c426758b485499e93d5462`; frozen diff sha256 `148975f256c555bec3025d0ceaad283a9115de499ebfa69044da916d68aa0c61`
- lens adaptation: R1 risk = privacy/security claims; R2 readability = d-001 format and user clarity; R3 reliability = every claim vs code; R4 resilience = failure guidance and silent breakage
- note: the R2 worker read the docs at `471da66` (HEAD after an orchestrator state-only commit); the four target files are byte-identical between `8fb52de` and `471da66`, so its findings apply to the frozen target
- created_at: "2026-10-03"

## Findings Ledger

| Id | Lens | Location | Severity | Evidence | Disposition | Status | Claim | Proof |
|---|---|---|---|---|---|---|---|---|
| R1-001 | risk | `docs/privacy.md:36-45`, `:15` | WARNING | deterministic | introduced | info | The disk section presents `~/.sentinel` as the whole footprint, but Claude Code runs without `--no-session-persistence`, so every review prompt (which contains the diff) also lands in the user's Claude Code session history. | `claude-code-adapter.ts:115-116`; `docs/engines/claude-code.md:60-62,96-99` (orchestrator re-verified) |
| R1-002 | risk | `docs/privacy.md:32` | WARNING | inferential | introduced | info | "runs with your own Claude Code permission settings" understates: the engine's cwd is the reviewed branch, so that branch's project-level Claude Code settings (permissions, hooks, MCP) can also apply; sentinel passes no `--setting-sources`/`--strict-mcp-config`. | `claude-code-adapter.ts:115-118`; `docs/engines/claude-code.md:56-62,96-99` |
| R1-003 | risk | `docs/privacy.md:31` | WARNING | inferential | introduced | info | "sentinel blocks file edits, shell commands and web fetches" is unconditional, but the deny config arrives via `OPENCODE_CONFIG` and may be overridable by a project `opencode.json` in the reviewed branch (precedence not verified); other tools (web search, MCP) are not in the deny list. | `permission-config.ts:13-16`; `opencode-adapter.ts:128-130`; `docs/engines/opencode.md:65-75` |
| R1-004 | risk | `docs/privacy.md:29`, `:36-39` | WARNING | deterministic | introduced | info | "sentinel removes that copy when the review ends" is absolute; an interrupted process (Ctrl+C/SIGTERM) or a cleanup fault leaves the checked-out branch under `~/.sentinel/worktrees/`, which the disk section never lists. | `run-review.ts:421-451` (cleanup is in-process); `paths.ts:90`; `list-orphan-worktrees.ts:1-10` |
| R1-005 | risk | `docs/privacy.md:56`; `docs/quick-start.md:61-67` | WARNING | deterministic | introduced | info | "sentinel stores no passwords or tokens" is false if the user embeds a token in `<url>` (plausible for private https repos): the URL is written verbatim to `repos.yaml`, kept in the clone's remote config and printed by `repo list`; no warning given. | `register-repo.ts:107-117`; `git-cli.ts:70` |
| R2-001 | readability | `docs/quick-start.md:117-121` vs `docs/privacy.md:40-46` | WARNING | deterministic | introduced | info | Run-folder contents are explained twice with diverging lists (quick start omits `validations/`), contradicting d-001/AC-5 "explain once, link"; the prompt order is also stated in both the guide and privacy. Same as S5's AC-5 caveat (risk-e7f2h1-011). | `docs/quick-start.md:117-121`; `docs/privacy.md:7-13,40-46`; `docs/build-your-own-harness.md:19` |
| R2-002 | readability | `docs/privacy.md:13`, `:46` | SUGGESTION | inferential | introduced | info | The "check commands, when you set any up" clause and `validations/` mention a feature no user doc explains or links. | `docs/privacy.md:13,46`; d-007 scope |
| R2-003 | readability | `docs/privacy.md:19`, `:29`, `:38`; `docs/quick-start.md:71` | SUGGESTION | inferential | introduced | info | "copy" names both the persistent clone and the temporary per-review copy; the diagram node "Copy of your repository" does not say which one the engine reads. | cited lines |
| R3-001 | reliability (+ resilience) | `docs/quick-start.md:123` | WARNING | deterministic | introduced | info | "If `state` is not `ok`, `failureStage` and `failureMessage` give a short reason" is false for `ambiguous` (both print `-`), and no doc says what `ambiguous` means or to read `result.md`; the quick start's own `--type quick` path can reach it for long answers (F5). Reported independently by R3 and R4 (R4's row merged here). | `run-review.ts:376-378,155-157`; `persist-run.ts:131-133`; `format-review.ts:47-48,72-73,99-115`; `harnesses/quick/output.md`; `builtin-verdict-extraction.ts:24-26` |
| R4-002 | resilience | `docs/quick-start.md:67` | WARNING | deterministic | introduced | info | `repo add` failures get no guidance: git runs with `GIT_TERMINAL_PROMPT=0`, so a private repo without stored git credentials (or a wrong URL) fails with only `Failed to clone repository "<url>"`. | `git-cli.ts:43-56` (orchestrator re-verified); `register-repo.ts:81-90`; `format-error.ts:22-33` |
| R4-003 | resilience | `docs/quick-start.md:48` | WARNING | inferential | introduced | info | Install failure paths (EACCES on a system npm prefix, global bin not on PATH) are undocumented, and the doc does not say the cloned folder must stay in place (the global install links to it; risk-e7f2h1-010). | `package.json` bin/files; risk-e7f2h1-010 |
| R4-004 | resilience | `docs/build-your-own-harness.md:7,19-26,126` | SUGGESTION | deterministic | introduced | info | Harness/skill paths are hard-coded as `~/.sentinel/...`; a user who set `SENTINEL_HOME` (offered by the quick start) creates the harness where sentinel does not look; section 7 troubleshooting does not mention location. | `paths.ts:62-69,84-93`; `docs/quick-start.md:71` |

Merged duplicate: R4-001 (`docs/quick-start.md:123`, same claim as R3-001) folded into R3-001; id R4-001 is retired, not reused.

## Corroboration Log

No refuter pass: zero BLOCKER/CRITICAL findings, so no severe inferential candidates exist (budget: 1 pass, 0 used).

## Fix Rounds

None (protocol budget 0 of 2 used). Info rows stay `info` per the contract; they were addressed outside the protocol fix loop by a user-approved, docs-only plan amendment (d-017, cp-014; S6 approved at cp-015).

### Info rows addressed in S6 (Amendment 1)

| Id | Resolution in S6 |
|---|---|
| R1-001 | privacy §3: Claude Code also saves each review prompt, diff included, in its own session history. Product follow-up F8 (isolation flags). |
| R1-002 | privacy §2: settings stored in the reviewed branch can apply too. Product follow-up F8. |
| R1-003 | privacy §2 softened: "sentinel's OpenCode settings deny …"; no precedence claim. Product follow-up F9. |
| R1-004 | privacy §3: `~/.sentinel/worktrees/` listed for interrupted reviews or a copy sentinel cannot remove. |
| R1-005 | privacy §5 + quick-start §3: no token or password in the repository address; sentinel saves it as typed. |
| R2-001 | run-folder list only in privacy §3 (quick-start §5 links); prompt order only in privacy §1 (guide §1 links). |
| R2-002 | kept and softened: "check commands configured for the repository, if any (these docs do not cover them)" — executor kept it because it is a real prompt input (`assemble-prompt.ts`); dropping would understate what is sent. |
| R2-003 | "sentinel's copy of the repository" vs "temporary copy of the branch" used consistently; Mermaid node A relabelled. |
| R3-001 | quick-start §5: failureStage/failureMessage for non-ok, non-ambiguous states; `ambiguous` = no verdict line found, both fields `-`, read `result.md`. |
| R4-002 | quick-start §3: https or ssh (ssh alias derivation verified in code); git runs without a prompt, private repos need stored credentials or an SSH key. |
| R4-003 | quick-start §2: keep the `sentinel-kit` folder in place. |
| R4-004 | guide §1: use `SENTINEL_HOME` instead of `~/.sentinel` if set; §7 check includes location. |

Scoped re-review: not required (info rows only, plan Amendment 1); final QA re-verifies.
