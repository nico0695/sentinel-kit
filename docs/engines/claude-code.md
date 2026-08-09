# Claude Code — canonical headless invocation

## Environment

- CLI version: `2.1.226 (Claude Code)`
- Verified on: 2026-08-08 · OS: macOS (Darwin 25.3.0)
- Auth mechanism used: stored OAuth login (claude.ai session). No env var needed.
- Model pinned for all spike runs: `--model sonnet` (behavioral findings are about the
  CLI, not the model; the flag is part of the canonical invocation so the adapter can
  expose model choice as config).

## Canonical invocation

```bash
cd <worktree>   # ReviewRequest.worktree.path — always the cwd
cat <prompt-file> | claude -p --model sonnet --output-format json
```

- **Working directory**: the review worktree. Default permissions are cwd-scoped (see below).
- **Input path chosen: stdin.** No practical size limit and no shell-escaping hazards with
  arbitrary diff content — verified end-to-end with a 183 KB prompt (~75k tokens, Haiku):
  clean review, correct verdict, stderr empty. Alternative (prompt as argv) works
  identically but hits the OS `execve` limit: on macOS (`ARG_MAX` = 1 MiB) exec fails at
  **~1024 KiB** of argv (shell exit 127, "argument list too long"); 1020 KiB still passes.
  Argv is viable for small prompts but stdin is strictly safer.
- **Output**: `--output-format json` emits a **single JSON document on stdout**. Final
  response text is at **`.result`** (string). Plain-text mode (no flag) is also clean —
  only the final response, no banner/progress/ANSI when not a TTY — but JSON is preferred
  for stable extraction and usage data.
- **Usage data**: `.usage.input_tokens`, `.usage.output_tokens`,
  `.usage.cache_read_input_tokens`, `.usage.cache_creation_input_tokens`, plus
  **`.total_cost_usd`** and a per-model breakdown in `.modelUsage` (tokens, `costUSD`,
  `contextWindow`). `.duration_ms` / `.duration_api_ms` are also present.
- **Status fields**: **`.is_error` (boolean) is the authoritative success flag.**
  `.subtype` is NOT reliable: it reads `"success"` even on auth failures (see below).
  Other useful fields: `.num_turns`, `.stop_reason`, `.terminal_reason`,
  `.permission_denials`, `.session_id`.

## Permissions / non-interactive mode

- **Configuration: none — default `-p` behavior is exactly the profile a review needs.**
  Verified:
  - Reads inside the worktree (cwd) are auto-approved: a prompt that required reading a
    file completed with `num_turns: 2` and `permission_denials: []`.
  - Writes are **denied** by default: a prompt instructed to create a file did not create
    it; the attempt was recorded in `.permission_denials` (tool name, tool input) and the
    process still exited 0 with `is_error: false`. The adapter should surface non-empty
    `permission_denials` as a signal, not trust exit code alone.
- Rejected alternatives:
  - `--allowedTools "Read,Grep,Glob"` — unnecessary given the default already behaves as
    a read-only allowlist; keep in reserve if a future CLI version changes defaults.
  - `--permission-mode` variants / `--dangerously-skip-permissions` — rejected outright:
    reviews are read-only by design, and a blanket bypass inside a worktree of untrusted
    third-party code would let the model execute arbitrary tools.
- **One-shot confirmed**: `-p` terminates the process after the response. No session
  reuse needed (port contract: one `review()` = one invocation).
- **Isolation and hygiene flags** (verified present in `2.1.226`, candidates for the
  adapter's canonical invocation):
  - `--setting-sources <user,project,local>` — restrict which settings load; runs
    otherwise inherit the operator's full `~/.claude` (MCP servers, skills, hooks),
    which hurts reproducibility across machines.
  - `--strict-mcp-config` — ignore all MCP configurations (reviews don't need MCP).
  - `--no-session-persistence` — don't pollute the operator's session history (by
    default every review lands in it).
  - `--max-budget-usd <amount>` — hard spend cap per invocation; natural fit for a
    sentinel config knob.
  - There is **no native `--max-turns` or wall-clock timeout flag** — timeout
    enforcement is entirely the adapter's job, as the PRD assumed.

## Failure signatures

| Scenario | stdout/stderr shape | Exit code |
|----------|--------------------|-----------|
| Auth invalid (bad `ANTHROPIC_API_KEY`) | stdout: full JSON with `is_error: true`, `api_error_status: 401`, `terminal_reason: "api_error"`, message in `.result`; `subtype` still `"success"` | 1 |
| Unknown model (`--model` typo) | stdout: full JSON, `is_error: true`, error message in `.result` (a small Haiku preflight cost ~$0.0006 is still billed) | 1 |
| Prompt exceeds context window | stdout: full JSON, `is_error: true`, `api_error_status: 400`, `total_cost_usd: 0`, `"Prompt is too long"` message in `.result` (verified with a 1.4 MB prompt vs. Haiku's 200k context) | 1 |
| Killed with SIGTERM (timeout path) | stdout: **complete JSON error document** flushed before dying — `is_error: true`, `subtype: "error_during_execution"`, `terminal_reason: "aborted_streaming"` | 143 |
| Killed with SIGKILL | stdout and stderr both empty | 137 |
| Invalid flag | stdout empty; stderr: `error: unknown option '--<flag>'` | 1 |

- **Timeout strategy for the adapter**: send SIGTERM first — the CLI shuts down
  gracefully and still emits parseable JSON; escalate to SIGKILL (empty stdout) only if
  it does not exit. macOS has no `timeout(1)` binary; the adapter kills the child process
  itself (which it must do anyway — `timeoutMs` enforcement lives in the adapter).
- **Auth precedence caveat**: `ANTHROPIC_API_KEY` in the environment **overrides** a
  valid stored OAuth login (the CLI warns on stderr). Since the adapter inherits the
  environment, a stale/invalid key in the user's env breaks auth even with a valid login.
  Worth surfacing in error messages.
- **`isAvailable()` probe**: `claude --version` → exit 0 proves installation (cheap, no
  auth check). Auth failures are then recognizable at run time by exit 1 +
  `is_error: true` + `api_error_status: 401` in the stdout JSON.

## Limitations

- Argv prompt path capped at ~1 MiB on macOS (`ARG_MAX`); stdin is the canonical path.
- Runs inherit the operator's `~/.claude` configuration (settings, MCP servers, skills)
  and persist sessions into their history unless the isolation flags above are used —
  affects reproducibility and leaves traces of reviewed code on the operator's machine.
- stderr is empty on successful runs (verified); assume diagnostics can appear there on
  failures (e.g. the auth-precedence warning).
- `.subtype` cannot be used for success detection (reports `"success"` on auth errors);
  use `.is_error` + exit code.
- A run can "succeed" (exit 0, `is_error: false`) while the review is still invalid —
  e.g. the model ignored the verdict contract. Verdict validation is downstream
  (run domain, E4.F1.H2), never the CLI's exit code.
- Flags verified only against `2.1.226`; flag drift between releases is PRD risk #1 —
  re-verify on version bumps (the `--help` output is the source of truth per install).
- End-to-end evidence: review of the planted-findings diff returned
  `VERDICT: request-changes` with both findings (removed zero-guard as major, naming nit
  as minor) across every full run; cost per review of the small test diff ≈ $0.011.
