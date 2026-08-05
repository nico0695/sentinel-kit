# 01 — E1.F1.H1: Spike Claude Code headless

> 🔴 required · Depends on: — (do [00-prerequisites](00-prerequisites.md) first)
> Issue: [#7](https://github.com/nico0695/sentinel-kit/issues/7)

## Objective

Resolve the four spike questions (PRD §6.2) for **Claude Code** and document its canonical
headless invocation, verified by one successful end-to-end review of the test diff.

**Acceptance criteria** (backlog):
- [ ] Canonical invocation documented
- [ ] Successful manual end-to-end test review
- [ ] Limitations noted

## Context

Claude Code has a first-class non-interactive mode (`-p`/`--print`) and structured output
(`--output-format json`), so this spike is mostly about **confirming behavior and picking among
working options**, not discovering whether headless works at all. The output of this spike feeds
the `engines/claude-code` adapter (E4.F2.H1) directly.

> ⚠️ Every flag below is a **candidate to verify** against your installed version
> (`claude --help`), not established fact. Flags drift between releases — that drift is
> precisely PRD risk #1.

## What you need to resolve

### Q1 — Input: how does the prompt get in?

Candidates to test (prompt = `$PROMPT_FILE` from doc 00):

| Path | Candidate invocation | What to check |
|------|---------------------|---------------|
| Argument | `claude -p "$(cat $PROMPT_FILE)" ...` | Does a multi-KB diff survive as an argv? OS argv limits (~128KB-2MB) apply. Quoting/escaping hazards with backticks and `$` inside diffs. |
| **stdin** | `cat $PROMPT_FILE \| claude -p ...` | Size limits (should be none practical). Does `-p` with piped stdin behave identically to argument mode? |
| File reference | prompt says "read the instructions in X" | Needs an extra file in the worktree + read permission; more moving parts. |

**Recommendation**: stdin. It has no practical size limit and no shell-escaping hazards, which
matters because the prompt embeds arbitrary diff content. Test argument mode anyway and record
the size at which it breaks (that limit is a spike finding). Ignore file reference unless both
others fail — it couples input to worktree contents.

### Q2 — Output: how does the final response come out?

Candidates:

| Mode | Candidate invocation | What to check |
|------|---------------------|---------------|
| Plain text | `claude -p ...` (default) | Is it ONLY the final response, or is there banner/progress noise? ANSI codes when not a TTY? |
| **JSON** | `claude -p --output-format json` | The JSON structure: which field holds the final response text? Which fields hold usage/cost (feeds `ReviewUsage` and the optional E5.F2.H3)? Is it a single JSON document on stdout? |
| Stream JSON | `--output-format stream-json` | Line-delimited events. More complex; only relevant if plain `json` proves unreliable. |

**Recommendation**: `--output-format json`. It gives stable extraction (parse one JSON document,
read one field) instead of scraping text, and it carries usage data the port can expose. Capture
the **full JSON structure** in the result doc — the adapter will type against it. Also record
what stdout looks like on *failure* (auth error, bad flag): is it still JSON, or does it fall
back to plain text on stderr? The adapter's error translation needs this.

### Q3 — Execution mode: non-interactive permissions, auth, availability

- **One-shot vs. session**: the port is one-shot (`review()` = one invocation). Confirm `-p`
  terminates the process after the response; session reuse (`--resume`/`--continue`) is out of
  scope for the MVP.
- **Permissions**: the engine must read worktree files without a human approving each access.
  Candidates to evaluate, from least to most permissive:
  1. Default `-p` behavior — are reads inside the cwd auto-approved already in print mode?
  2. `--allowedTools "Read,Grep,Glob"` (or equivalent) — explicit read-only allowlist.
  3. `--permission-mode` variants (e.g. `acceptEdits`, `bypassPermissions`).
  4. `--dangerously-skip-permissions` — blanket bypass.

  **Recommendation**: the *least* permissive option that lets a review complete. Sentinel's
  reviews are read-only by design — the engine should never need write or execute access. If an
  explicit read-only allowlist works, prefer it over any bypass flag, and note the residual risk
  of each rejected option. A review engine running with `--dangerously-skip-permissions` inside
  a worktree of untrusted third-party code would execute whatever tools the model decides —
  document this as a limitation if you end up needing it.
- **Auth via env**: confirm which env var(s) work headless (e.g. `ANTHROPIC_API_KEY`) and
  whether an interactive login session also satisfies headless runs. Sentinel never persists
  auth (PRD risk #6) — the adapter just inherits the environment.
- **Availability detection**: decide the `isAvailable()` probe. Candidates: `claude --version`
  exit code (cheap, proves install but not auth) vs. a minimal 1-token prompt (proves auth,
  costs a call). **Recommendation**: version check for "installed", and let a real run surface
  auth errors as a distinct, recognizable failure — record the exact error text/exit code so the
  adapter can classify it.

### Q4 — Timeout and exit codes

- Run a review with a deliberately tiny wall-clock budget and kill the process
  (`timeout 5 claude -p ... < $PROMPT_FILE`; also try SIGTERM vs SIGKILL). Record: what appears
  on stdout when killed mid-run (partial JSON? nothing?) and the exit code. This becomes the
  **timeout fixture** in doc 03.
- Map the exit codes you can produce: success, auth failure, invalid flag, killed. The adapter
  translates these into port errors; `timeoutMs` enforcement itself lives in the adapter
  (the CLI may or may not have a native `--max-turns`/timeout flag — check, but the adapter
  cannot rely on it alone).

## Step-by-step protocol

1. `cd ~/spikes/e1-test-wt` (always invoke from the worktree — it is the cwd contract).
2. Baseline: `cat ~/spikes/e1-prompt.txt | claude -p` — does a plain review work at all? Does it
   catch the planted findings?
3. Add `--output-format json`; capture stdout to a file; identify the response-text field and
   usage fields.
4. Repeat with the prompt passed as an argument; grow the diff until argv breaks; record the limit.
5. Determine the minimal permission configuration (Q3) that completes a review.
6. Unset auth (e.g. `env -u ANTHROPIC_API_KEY claude -p ...` in a shell without stored login,
   if testable) and record the failure signature.
7. Kill a run mid-flight; record output + exit code.
8. Re-run the winning invocation end-to-end once, clean: this is your "successful manual
   end-to-end test review" acceptance check — the verdict should be `request-changes` (the
   planted guard-removal is a blocker/major).
9. Fill in the result doc (template below) as `docs/engines/claude-code.md`.

## Result template → `docs/engines/claude-code.md`

```markdown
# Claude Code — canonical headless invocation

## Environment
- CLI version: <claude --version>
- Verified on: <date> · OS: <...>
- Auth mechanism used: <env var / stored login>

## Canonical invocation
    <the exact command line, with prompt via stdin/arg, all flags>
- Working directory: the review worktree (ReviewRequest.worktree.path)
- Input path chosen: <stdin/arg> — rationale + measured limits of the alternative
- Output: --output-format json; final response text at <json.path.to.field>
- Usage data: <fields for input/output/total tokens, cost>

## Permissions / non-interactive mode
- Configuration: <flags> — rationale (least permissive that completes a review)
- Rejected alternatives and why: <...>

## Failure signatures
| Scenario | stdout/stderr shape | Exit code |
|----------|--------------------|-----------|
| Auth missing/invalid | <...> | <...> |
| Killed (timeout) | <...> | <...> |
| Invalid flag | <...> | <...> |
- isAvailable() probe: <command + interpretation>

## Limitations
- <argv size limit, JSON quirks, version-specific flags, anything surprising>
```

## Checklist

- [ ] All four questions answered with evidence (commands actually run, outputs seen).
- [ ] End-to-end review of the test diff succeeded and caught the planted findings.
- [ ] `docs/engines/claude-code.md` written from the template.
- [ ] Raw outputs from these runs saved aside — they become fixtures in doc 03.
- [ ] No tokens or personal paths in anything committed.
