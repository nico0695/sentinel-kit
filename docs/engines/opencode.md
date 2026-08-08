# OpenCode — canonical headless invocation

## Environment

- CLI version: `1.17.9`
- Verified on: 2026-08-08 · OS: macOS (Darwin 25.3.0)
- Auth: multi-provider, stored in `~/.local/share/opencode/auth.json` (inspect with
  `opencode auth list`). Spike runs used provider/model **`openai/gpt-5.4-mini`** via an
  OpenAI OAuth credential — fixtures were produced by this provider; output *text* may
  vary per provider, but the event envelope is OpenCode's own and provider-independent.

## Canonical invocation

```bash
cd <worktree>   # ReviewRequest.worktree.path — always the cwd
cat <prompt-file> | OPENCODE_CONFIG=<readonly-config.json> \
  opencode run -m <provider/model> --format json
```

With the read-only permission config (see Permissions):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": { "edit": "deny", "bash": "deny", "webfetch": "deny" }
}
```

- **Working directory**: the review worktree.
- **Input path chosen: stdin.** `opencode run` reads the message from piped stdin;
  behavior identical to the positional-argument form. Argv alternative hits the same OS
  `execve` limit measured for Claude Code (~1 MiB on macOS, exit 127). Stdin has no
  practical limit and no escaping hazards.
- **Model flag is mandatory in practice** (`-m provider/model`): without it OpenCode
  picks a default that depends on local state; the adapter must pin it explicitly.
  Discover available models with `opencode models`.

## Output: `--format json` is an NDJSON event stream

Unlike Claude Code (single JSON document), `--format json` emits **one JSON event per
line** on stdout:

| Event `type` | Carries |
|--------------|---------|
| `step_start` | session/message ids, snapshot |
| `text` | **response text chunk at `.part.text`** — may occur multiple times |
| `step_finish` | `.part.tokens` (`total/input/output/reasoning/cache{read,write}`), `.part.cost`, `.part.reason` (`"stop"` on normal completion) |
| `tool` (when tools run) | tool invocations |

**Extraction strategy (verified)**: concatenate `.part.text` of every `text` event, in
order; usage from the last `step_finish`. Parse line-by-line and tolerate a truncated
final line (see kill behavior).

**Plain-text mode** (`--format default`) is also viable: stdout carries only the final
response text (no ANSI — verified), progress noise (`> build · <model>` + ANSI) goes to
stderr. Good fallback, but JSON gives usage data and stream structure.

## Permissions / non-interactive mode

- ⚠️ **Default `opencode run` is NOT read-only: it writes files without asking.**
  Verified: a prompt instructing file creation succeeded silently in default mode. This
  is the single most important behavioral difference vs. Claude Code.
- **Configuration: permission-deny config injected via the `OPENCODE_CONFIG` env var**
  (JSON above). Verified: with `edit/bash/webfetch: "deny"`, the model only sees
  read/search tools; a file-creation instruction failed (it even tried a subagent
  workaround, which was also blocked) and nothing was written. Reads inside the worktree
  keep working. `OPENCODE_CONFIG` keeps the worktree pristine (no `opencode.json`
  dropped into reviewed code) and is trivial for the adapter to set per-invocation.
- Denied tool calls are **not** an error: the run still exits 0 and the model reports the
  limitation in text.
- Rejected alternatives: project-local `opencode.json` in the worktree (pollutes the
  diffed tree); `--dangerously-skip-permissions` (opposite direction; never needed).
- **One-shot confirmed**: `run` terminates after the response. Session flags
  (`--session/--continue/--fork`) exist but are out of scope (port is one-shot).

## Failure signatures

| Scenario | stdout/stderr shape | Exit code |
|----------|--------------------|-----------|
| Unknown model | stdout: **log dump, not clean JSON** (`ERROR (#n): failed { ... _tag: "ProviderModelNotFoundError" }`); stderr: ANSI-colored `Error: Model not found: <id>` | 1 |
| Killed with SIGTERM | partial NDJSON stream, **truncated mid-line, no graceful flush** | 143 |
| Killed with SIGKILL | same as SIGTERM (partial, truncated) | 137 |
| Invalid flag | stdout empty; stderr: help text | 1 |

- **Timeout strategy**: no graceful-shutdown advantage for SIGTERM (unlike Claude Code),
  but use SIGTERM→SIGKILL anyway for process hygiene. Expect a truncated last stdout
  line; the NDJSON parser must drop it.
- **stdout is not guaranteed clean on failure** (error logs land there) → defensive
  parsing is required exactly as the PRD anticipated for this engine.
- **`isAvailable()` probe**: `opencode --version` → exit 0 proves installation. Auth is
  per-provider: `opencode auth list` enumerates credentials, but the reliable signal is a
  real run failing with exit 1 + error text on stderr.
- Auth-missing signature not directly captured (credentials are account-level in
  `auth.json`; removing them would deauth the operator's setup). Expect the
  unknown-model/log-dump *shape*: exit 1 + noise on stdout + `Error:` line on stderr.

## Limitations

- Default permission posture is write-enabled — **never invoke without the deny config**.
- NDJSON events are large (full ids/snapshots per line) and the schema is undocumented —
  type only the fields listed above, defensively.
- `cost` reported as `0` for the OAuth-backed OpenAI provider (subscription usage);
  token counts are still populated — `ReviewUsage` should rely on tokens, not cost.
- Output quality varies per provider/model: with `gpt-5.4-mini`, one run reported only
  the major planted finding and missed the style nit (other runs caught both). Model
  choice matters for review quality even though the envelope is stable.
- Flags verified only against `1.17.9`; re-verify on version bumps (PRD risk #1).
- End-to-end evidence: review of the planted-findings diff returned
  `VERDICT: request-changes` first line on every full run (baseline, argv, final JSON).
