# S17 — E1 engine spikes executed (H1, H2, extended validation, H3 fixtures)

- **Date**: 2026-08-08
- **Branch**: `claude/project-status-backlog-ocdf7f`
- **Scope**: `[E1.F1.H1]` (issue #7), `[E1.F1.H2]` (issue #8), `[E1.F1.H3]` (issue #9) — spikes executed + fixtures captured
- **sdd-lite changes**: — (see Deviations)

## Objective

Execute the engine spikes per `docs/todo/E1/01-spike-claude-code.md` and `02-spike-opencode.md`:
answer the four PRD §6.2 questions per engine with real evidence and write
`docs/engines/claude-code.md` and `docs/engines/opencode.md`.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S17-D1 | Run the spike from the Claude Code session itself (agent drives `claude` CLI via Bash, user supervises each step) | Fully manual execution by the operator as the guide assumed | The operator's machine already has the authenticated CLI; supervision per step keeps the "manual" intent | `claude→user` |
| S17-D2 | Pin `--model sonnet` for all spike runs | Default model | Cheaper; findings are about CLI behavior, not model quality; flag recorded as part of canonical invocation | `user` |
| S17-D3 | stdin as canonical input path | argv (works, but capped at ~1 MiB by macOS `ARG_MAX`, measured); file reference (more moving parts) | No size limit, no shell-escaping hazards with arbitrary diffs | `claude` |
| S17-D4 | No permission flags: default `-p` behavior is the canonical config | `--allowedTools` read-only allowlist; `--permission-mode`; `--dangerously-skip-permissions` | Evidence: default auto-approves cwd reads and denies writes (recorded in `permission_denials`) — already the least-permissive profile that completes a review | `claude` |
| S17-D5 | Argv size limit measured at exec level (`claude --version <big-arg>`), not with real API calls | Growing real prompts until failure | Same `execve` limit applies; zero token cost | `claude` |
| S17-D6 | Commit deliverable + history now; defer the `[E1.F1.H1]` PR until the OpenCode spike (H2) is done | Open the PR immediately | User prefers one E1 PR flow after both engine spikes | `user` |
| S17-D7 | OpenCode spike model: `openai/gpt-5.4-mini` (OAuth credential) | Free-tier model first; `opencode-go` credit models | User picked among available credentials; no Anthropic provider configured in OpenCode | `claude→user` |
| S17-D8 | Read-only posture for OpenCode via `OPENCODE_CONFIG` env pointing to a `permission: deny` config | Project-local `opencode.json` in the worktree (pollutes reviewed tree); `--dangerously-skip-permissions` (opposite direction) | Default `run` mode is write-enabled (verified); env-injected config blocks writes without touching the worktree | `claude` |
| S17-D9 | Single PR for H1+H2 (`Closes #7, #8`) | One PR per story | Same feature (E1.F1), doc-only deliverables; workflow contract allows it when declared | `claude→user` |
| S17-D10 | No Co-Authored-By trailer in commits from this session onward | Default trailer | User request | `user` |

## Deviations

- **sdd-lite activation policy vs. E1**: policy rule 1 mandates an sdd-lite change per backlog
  story, but E1 was scoped in S16 as a manually executed spike epic with doc-only deliverables;
  this session ran it without sdd-lite ceremony, with the audit trail carried by this entry and
  the raw run outputs. Consistent with the guide, but a policy deviation worth acknowledging.
- **Auth-missing scenario not fully testable**: stored OAuth login cannot be cleanly removed for
  a test; instead captured the invalid-`ANTHROPIC_API_KEY` signature (which *overrides* OAuth —
  itself a finding: inherited env can break auth despite a valid login).
- **macOS has no `timeout(1)`**: kill-mid-run tests done via background job + manual
  SIGTERM/SIGKILL — which is what the E4 adapter will do anyway.

## Work done

- Prerequisites (doc 00, Claude Code side): test repo with planted findings, worktree,
  merge-base diff, canonical prompt — under `~/spikes/` (outside the repo).
- 10 evidence runs (~$0.05 total): baseline plain, JSON output, argv input, argv limit probe,
  default-permission read test, write-denial test, invalid-auth signature, SIGTERM/SIGKILL
  mid-run kills, invalid flag, final clean end-to-end.
- Acceptance met: end-to-end review returned `VERDICT: request-changes` first line and caught
  both planted findings; all four spike questions answered with evidence.
- Key findings: `.is_error` (not `.subtype`) is the authoritative success flag; SIGTERM still
  flushes a complete JSON error document (exit 143) while SIGKILL leaves stdout empty (137);
  argv caps at ~1 MiB; default permissions are read-only in practice.
- Deliverable: `docs/engines/claude-code.md` (template from doc 01, fully filled).
- Raw outputs preserved in `~/spikes/run*.{txt,json,out,err}` as candidate H3 fixtures.

### OpenCode spike (H2)

- Prerequisites: OpenCode `1.17.9`, credentials OpenAI (oauth) + OpenCode Go (api); no Anthropic.
- 11 evidence runs: baseline stdin, NDJSON `--format json`, argv + exec-limit probe (~1 MiB, same
  OS cap), default-permission read test, **write test proving default mode creates files without
  asking**, write-denial via `OPENCODE_CONFIG` deny config (blocked, incl. subagent workaround),
  unknown-model and invalid-flag signatures, SIGTERM/SIGKILL kills (truncated stream, no flush),
  final clean end-to-end.
- Acceptance met: `VERDICT: request-changes` first line on every full run; parsing strategy
  (concatenate `text` events, usage from `step_finish.tokens`) verified working.
- Key findings: default posture is write-enabled (biggest delta vs. Claude Code); stdout not
  clean on failures (log dumps) → defensive parsing confirmed necessary; `cost` reads 0 on
  OAuth provider → usage must rely on token counts.
- Deliverable: `docs/engines/opencode.md`.
- Raw outputs preserved in `~/spikes/oc-run*.{txt,json,out,err}` as candidate H3 fixtures.

### Extended validation pass (user-requested re-analysis before H3)

Eight gap checks executed to harden the H1/H2 docs; all landed in commit `56af7e2`:
large-input runs (183 KB stdin, both engines, clean), context-overflow signatures
captured for both, Claude unknown-model signature, Claude stderr-empty-on-success,
Claude isolation/hygiene flags discovered (`--setting-sources`, `--strict-mcp-config`,
`--no-session-persistence`, `--max-budget-usd`; no native timeout flag), OpenCode reads
verified under deny config (+ `tool_use` event shape fixed in doc), OpenCode
missing-credential = `ProviderModelNotFoundError` (no distinct auth signature;
`opencode models` is the availability probe), worktree pristine but OpenCode hoards
state under `~/.local/share/opencode/`.

### Fixtures (H3)

- Captured the two missing cases per engine (no-verdict, noisy/markdown-wrapped) with
  prompt variants; recycled valid-verdict, SIGTERM-partial, overflow, auth/unknown-model
  raw outputs from the spike runs.
- `fixtures/claude-code/` (6 files) and `fixtures/opencode/` (6 files) + provenance
  README. Anonymized (`/home/reviewer/...`), scanned clean for paths/tokens/emails.

### Quality gate repair (pre-PR)

- `npm run check` failed on 2 `core-no-io-libs` violations: a stray `pnpm-lock.yaml` +
  pnpm-installed `node_modules` made zod resolve via `node_modules/.pnpm/...`, defeating
  the guard whitelist. Removed the lockfile and reinstalled with `npm ci` — guards green.
- 2 GitPort contract tests failed on macOS only: `os.tmpdir()` is under `/var` (symlink
  to `/private/var`) while git reports canonical paths. Fixed by `realpathSync` on the
  fixture root (commit `fix(test): canonicalize tmpdir in GitPort contract fixture for
  macOS`, test-only change, declared outside E1 scope in the PR).
- Final state: `npm run check` ✅ and 163/163 tests ✅.

## Pending and next steps

- `[E1.F1.H4]` context modes — optional, skipped unless requested.
- E1 PR for H1+H2+H3 (`Closes #7, #8, #9`) — user decides when to open.
- `create-issues.sh` has pre-existing uncommitted modifications (predates this session) —
  user to review/commit separately.

## Open questions for the user

—
