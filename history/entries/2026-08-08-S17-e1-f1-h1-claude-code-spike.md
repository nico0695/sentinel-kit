# S17 — E1.F1.H1: Claude Code headless spike executed

- **Date**: 2026-08-08
- **Branch**: `claude/project-status-backlog-ocdf7f`
- **Scope**: `[E1.F1.H1]` (issue #7) — spike executed, deliverable written
- **sdd-lite changes**: — (see Deviations)

## Objective

Execute the Claude Code headless spike per `docs/todo/E1/01-spike-claude-code.md`: answer the
four PRD §6.2 questions with real evidence and write `docs/engines/claude-code.md`.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S17-D1 | Run the spike from the Claude Code session itself (agent drives `claude` CLI via Bash, user supervises each step) | Fully manual execution by the operator as the guide assumed | The operator's machine already has the authenticated CLI; supervision per step keeps the "manual" intent | `claude→user` |
| S17-D2 | Pin `--model sonnet` for all spike runs | Default model | Cheaper; findings are about CLI behavior, not model quality; flag recorded as part of canonical invocation | `user` |
| S17-D3 | stdin as canonical input path | argv (works, but capped at ~1 MiB by macOS `ARG_MAX`, measured); file reference (more moving parts) | No size limit, no shell-escaping hazards with arbitrary diffs | `claude` |
| S17-D4 | No permission flags: default `-p` behavior is the canonical config | `--allowedTools` read-only allowlist; `--permission-mode`; `--dangerously-skip-permissions` | Evidence: default auto-approves cwd reads and denies writes (recorded in `permission_denials`) — already the least-permissive profile that completes a review | `claude` |
| S17-D5 | Argv size limit measured at exec level (`claude --version <big-arg>`), not with real API calls | Growing real prompts until failure | Same `execve` limit applies; zero token cost | `claude` |
| S17-D6 | Commit deliverable + history now; defer the `[E1.F1.H1]` PR until the OpenCode spike (H2) is done | Open the PR immediately | User prefers one E1 PR flow after both engine spikes | `user` |

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

## Pending and next steps

- `[E1.F1.H2]` OpenCode spike — next session (user + claude, same collaborative mode).
- `[E1.F1.H3]` fixtures — recycle this session's raw outputs; anonymize before committing.
- Open the E1 PR (`Closes #7`, likely with H2) — user decides when.

## Open questions for the user

—
