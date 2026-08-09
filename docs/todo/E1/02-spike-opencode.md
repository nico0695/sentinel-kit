# 02 — E1.F1.H2: Spike OpenCode headless

> 🔴 required · Depends on: — (do [00-prerequisites](00-prerequisites.md) first)
> Issue: [#8](https://github.com/nico0695/sentinel-kit/issues/8)

## Objective

Same protocol as doc 01, for **OpenCode**: resolve the four spike questions, document the
canonical invocation, and — this is the extra acceptance criterion specific to OpenCode —
**define the parsing strategy** in case there is no reliable structured output.

**Acceptance criteria** (backlog):
- [ ] Canonical invocation documented
- [ ] Successful test review
- [ ] Parsing strategy defined

## Context

OpenCode's headless entry point is `opencode run`. Unlike Claude Code, the backlog does not
assume structured output exists — the spike must *evaluate format flags vs. plain text* and, if
plain text is what we get, design the defensive parsing the adapter will rely on. OpenCode is
also multi-provider: record which provider/model you spike with, since output shape and quality
may differ per provider.

Having OpenCode as the second engine is not incidental: it forces the `ReviewEngine` port to be
genuine rather than a mirror of Claude Code (PRD §6.2). Where the two CLIs differ, the
difference gets absorbed **inside the adapter**, never in the port.

> ⚠️ As in doc 01: every flag below is a **candidate to verify** against your installed version
> (`opencode --help`, `opencode run --help`).

## What you need to resolve

### Q1 — Input

Same three paths as Claude Code (argument / stdin / file reference), same measurements:

- `opencode run "$(cat $PROMPT_FILE)"` — argv limits with a real-size diff.
- `cat $PROMPT_FILE | opencode run` — does it read stdin at all? (Verify: some CLIs require the
  prompt as argument and treat stdin differently.)

**Recommendation**: prefer stdin if supported, for the same reasons as doc 01 (no size limit, no
escaping hazards). If OpenCode only takes the prompt as an argument, record the practical size
ceiling — that number becomes an input constraint the E4 adapter must respect (and may interact
with the diff-truncation policy from E2.F3.H2).

### Q2 — Output (the heart of this spike)

Evaluate in this order:

1. **Structured output flags**: check `opencode run --help` for anything like `--format json`,
   `--json`, `--output-format`, or a `--print-logs`/quiet mode. If a JSON mode exists: capture
   its structure, find the final-response field, check whether usage/tokens appear, and check
   its **stability** (is the response one clean document on stdout, or interleaved with logs?).
2. **Plain text fallback**: run without format flags, stdout redirected to a file (not a TTY).
   Check for: ANSI escape codes, spinner/progress artifacts, tool-use narration mixed into the
   output, markdown fences wrapping the response, banner/footer noise.

**Decision rule (recommendation)**: if a JSON mode exists *and* the response field is stable
across several runs → canonical invocation uses it, and the parsing strategy is trivial ("parse
JSON, read field X"). Otherwise → plain text + the defensive parsing strategy below.

### Defensive parsing strategy (required deliverable if output is plain text)

Do not build the parser here — E4.F1.H2 owns implementation. What this spike must produce is the
**documented strategy** with evidence, so the parser is written against reality. Recommended
layered approach, in order:

1. **Normalize**: strip ANSI escape sequences (`\x1b[...m` and cursor codes); normalize line
   endings.
2. **Isolate the response**: identify — from your captured runs — what reliably delimits the
   final response from surrounding noise (last markdown block? everything after the final blank
   separator? full stdout minus known banner lines?). Name the rule explicitly and record
   counterexamples if any.
3. **Unwrap**: if the response arrives fenced (```` ``` ````), strip one fence layer.
4. **Leave verdict extraction downstream**: the parser (E4.F1.H2) scans the normalized text for
   the `VERDICT:` contract line; missing/contradictory ⇒ `ambiguous`. Your job here is only to
   make sure the normalized text *contains* the response cleanly.

Alternative worth testing if isolation proves unreliable: strengthen the **prompt contract**
instead of the parser — e.g. instruct the engine to wrap its answer between fixed sentinel
markers (`<<<REVIEW ... REVIEW>>>`) and extract between them. This trades parser complexity for
prompt complexity; note it as an option with your observed reliability, and leave the choice to
E4.F1.H2. (Keep in mind it changes the assembled prompt, which E3's assembler owns.)

### Q3 — Execution mode: permissions, auth, availability

- **Non-interactive**: does `opencode run` complete a review with file reads without asking
  anything? If it prompts for permissions or model selection mid-run, find the flags/config that
  pre-answer them (check for a config file or env-based defaults). Record the minimal setup.
- **Provider/model selection**: how is the model pinned for a headless run (flag like
  `--model provider/model`, or config)? A reproducible invocation must pin it explicitly —
  record the chosen mechanism and the model used for the spike.
- **Auth**: which env vars / stored credentials does the chosen provider need (`opencode auth`)?
  Same rule as always: sentinel inherits the environment, never persists auth.
- **Availability**: probe candidates: `opencode --version` (installed) + recognizable auth-error
  signature on run (authenticated). Record exact error text/exit codes.

### Q4 — Timeout and exit codes

Same protocol as doc 01: kill a run mid-flight (`timeout 5 opencode run ...`), record partial
stdout and exit code (→ timeout fixture for doc 03); map exit codes for success / auth failure /
invalid flag. The adapter enforces `timeoutMs` itself regardless of any native timeout flag.

## Step-by-step protocol

1. `cd ~/spikes/e1-test-wt`.
2. Baseline: run the canonical prompt through `opencode run` (argument or stdin, whichever
   works); confirm it reviews and catches the planted findings.
3. Hunt for structured output (`--help`); if found, capture and assess stability over ≥3 runs.
4. Capture plain-text output redirected to a file; inventory the noise (ANSI, progress, fences).
5. Decide JSON vs. plain-text-plus-parsing via the decision rule; if plain text, write the
   parsing strategy with the evidence you captured.
6. Resolve permissions/model pinning/auth signature/availability probe.
7. Kill a run; record the timeout signature.
8. One clean end-to-end run with the winning invocation (acceptance check — expected verdict:
   `request-changes`).
9. Fill in `docs/engines/opencode.md` (template below).

## Result template → `docs/engines/opencode.md`

```markdown
# OpenCode — canonical headless invocation

## Environment
- CLI version: <opencode --version>
- Provider/model used: <...> · pinned via: <flag/config>
- Verified on: <date> · OS: <...>
- Auth mechanism: <env var / opencode auth>

## Canonical invocation
    <the exact command line>
- Working directory: the review worktree
- Input path chosen: <stdin/arg> — rationale + measured limits
- Output mode: <json flag | plain text>
- If JSON: final response at <json.path> · usage fields: <...>

## Parsing strategy (if plain text)
1. <normalization steps, with the noise inventory that motivated each>
2. <response isolation rule + evidence of stability>
3. <unwrapping rules>
- Alternatives considered: <sentinel markers / other> — <observed reliability, recommendation>

## Permissions / non-interactive mode
- Minimal working configuration: <flags/config>
- Anything that prompted interactively and how it was pre-answered: <...>

## Failure signatures
| Scenario | stdout/stderr shape | Exit code |
|----------|--------------------|-----------|
| Auth missing/invalid | <...> | <...> |
| Killed (timeout) | <...> | <...> |
| Invalid flag | <...> | <...> |
- isAvailable() probe: <command + interpretation>

## Limitations
- <provider-specific quirks, output instability, size ceilings, version notes>
```

## Checklist

- [ ] All four questions answered with evidence.
- [ ] Structured-output evaluation done; JSON-vs-plain decision recorded with rationale.
- [ ] Parsing strategy defined (or explicitly marked trivial because JSON is stable).
- [ ] End-to-end review succeeded and caught the planted findings.
- [ ] `docs/engines/opencode.md` written; raw outputs saved for doc 03.
- [ ] No tokens or personal paths in anything committed.
