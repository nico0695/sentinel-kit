# Engine output fixtures

Real captured outputs from the E1 engine spikes (`[E1.F1.H3]`, issue #9). These feed the
adapter contract tests (E4): a mocked binary replays these bytes so tests exercise real
output shapes without invoking the engines.

## Provenance

- Captured: 2026-08-08 on macOS, per the protocol in `docs/todo/E1/`.
- Claude Code `2.1.226`, model `sonnet` (Haiku for `context-overflow`). Invocation:
  `cat prompt | claude -p --model <m> --output-format json` from the test worktree.
- OpenCode `1.17.9`, model `openai/gpt-5.4-mini`. Invocation:
  `cat prompt | OPENCODE_CONFIG=<deny-config> opencode run -m openai/gpt-5.4-mini --format json`.
- The reviewed diff is the planted-findings calculator diff from
  `docs/todo/E1/00-prerequisites.md` (removed zero-guard + `Multiply` naming nit).
- Anonymized: personal paths rewritten to `/home/reviewer/...`; no tokens. Session ids
  and git snapshot hashes are ephemeral spike artifacts, not secrets.
- Canonical invocation details and failure-signature tables:
  `docs/engines/claude-code.md`, `docs/engines/opencode.md`.

## Cases per engine

| File | Case | Notes |
|------|------|-------|
| `valid-verdict.*` | Successful review, `VERDICT: request-changes` first line | Claude: single JSON doc, text at `.result` · OpenCode: NDJSON, concatenate `text` events |
| `no-verdict.*` | Review without the verdict contract → response has no `VERDICT:` line | Downstream terminal state: `ambiguous` |
| `noisy-output.*` | Verdict buried inside a fenced markdown block after a prose preamble | Defensive-parsing case |
| `timeout-sigterm*` | Run killed with SIGTERM mid-flight | Claude (exit 143): complete JSON error doc flushed · OpenCode (exit 143): stream truncated mid-line |
| `context-overflow.*` | Prompt exceeds the model context window | Claude (exit 1): `is_error: true`, `api_error_status: 400` · OpenCode (exit 1): in-stream `error` event, `ContextOverflowError` |
| `auth-error.json` (Claude) | Invalid `ANTHROPIC_API_KEY` (exit 1) | `is_error: true`, `api_error_status: 401`; note `subtype` still reads `"success"` |
| `unknown-model-stdout.txt` (OpenCode) | Unknown model / unconfigured provider (exit 1) | Raw log dump on stdout — NOT parseable JSON; same signature for missing credentials |

`.ndjson` files are line-delimited event streams; `timeout-sigterm-partial.ndjson`
intentionally ends mid-line — parsers must tolerate a truncated final line.
