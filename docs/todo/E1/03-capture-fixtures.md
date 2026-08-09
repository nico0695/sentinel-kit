# 03 — E1.F1.H3: Capture real fixtures

> 🔴 required · Depends on: E1.F1.H1, E1.F1.H2
> Issue: [#9](https://github.com/nico0695/sentinel-kit/issues/9)

## Objective

Version **real, complete engine outputs** in `fixtures/` so downstream tests run against
reality, not invented data. Consumers:

- **E4.F1.H2 (verdict parser)** — parses these outputs; the ≥90% no-ambiguity success criterion
  (PRD §7) is measured against real output shapes.
- **E4.F2.H1/H2 (engine adapters)** — contract tests run with a *mocked binary* that replays
  these fixtures, so CI never needs an installed/authenticated engine.

**Acceptance criteria** (backlog):
- [ ] ≥4 fixtures per engine versioned (≥8 total)
- [ ] Anonymized (no personal paths or tokens)

## Context

`fixtures/` exists at the repo root and is empty (only `.gitkeep`). No layout convention has
been defined yet — this doc proposes one (decision recorded below). If you already saved raw
outputs while running docs 01/02, most of the capture work is done; this task is mainly
*selecting, sanitizing, and organizing* them.

A fixture must be the **byte-complete captured output** (the whole stdout, exactly as the
adapter will see it) — not a cleaned-up or summarized version. Noise is the point: the parser
must survive it.

## The four required cases (per engine)

| Case | What it is | How to produce it |
|------|-----------|-------------------|
| 1. Valid verdict | Clean run: response opens with a well-formed `VERDICT:` line | The successful end-to-end run from docs 01/02 |
| 2. No verdict | Response missing the `VERDICT:` line entirely (⇒ downstream `ambiguous`) | Run with a prompt variant that **omits the verdict instructions** (just "review this diff") |
| 3. Noisy output | Response with ANSI codes and/or markdown wrappers around/inside it | Capture without JSON mode / without TTY-detection help; or a run where the engine fenced its answer. If your canonical mode is JSON, capture this case from the plain-text mode — it documents what the fallback path faces |
| 4. Timeout | Whatever stdout contained when the process was killed | The kill experiments from docs 01/02 (Q4) |

Nuances worth capturing deliberately:

- **Timeout may be empty.** An empty or truncated-mid-JSON capture *is a valid fixture* — the
  adapter and parser must handle exactly that. Record the exit code and signal in the metadata
  (below), since the bytes alone don't tell that story.
- **Contradictory verdict (optional 5th case).** If any experiment produced two conflicting
  `VERDICT:` lines, save it — the parser's ambiguity rule needs it. Don't force it; note its
  absence otherwise.
- **JSON engines get JSON fixtures.** For Claude Code the fixture for cases 1-2 is the full JSON
  document from `--output-format json`, not just the inner text — the adapter parses the
  envelope too.

## Proposed layout (decision — adjust if E4 needs otherwise)

```
fixtures/
  claude-code/
    valid-verdict.json        # full stdout of canonical JSON run
    no-verdict.json
    noisy-output.txt          # plain-text capture (ANSI/markdown noise)
    timeout.txt               # partial/empty stdout from killed run
    META.md                   # per-fixture metadata (see below)
  opencode/
    valid-verdict.txt         # extension matches actual output mode
    no-verdict.txt
    noisy-output.txt
    timeout.txt
    META.md
```

Rules:
- One directory per engine, named exactly like the future adapter folder
  (`engines/claude-code`, `engines/opencode`).
- Case names are stable identifiers — contract tests will reference them by name.
- Extension reflects the actual content (`.json` only if the bytes are one JSON document).
- **`META.md` per engine** records what the bytes can't: CLI version, provider/model (OpenCode),
  invocation used, date, exit code/signal per fixture, and any sanitization applied. Without
  this, a fixture is unreproducible evidence.

`META.md` template:

```markdown
# Fixtures — <engine>
- CLI version: <...> · Date captured: <...>
- Invocation: <exact command from docs/engines/<engine>.md>
| Fixture | Prompt variant | Exit code | Signal | Sanitization applied |
|---------|---------------|-----------|--------|----------------------|
| valid-verdict | canonical | 0 | — | paths |
| ... | | | | |
```

## Anonymization

Scrub before committing — and record each substitution in `META.md`:

- **Paths**: replace `/Users/<you>/...` or `/home/<you>/...` with `/home/user/...` (keep path
  *shape* — the parser may encounter paths; don't delete them).
- **Tokens/keys**: grep every fixture for obvious secrets before adding
  (`grep -rniE "(api[_-]?key|token|sk-|bearer)" fixtures/`). JSON envelopes sometimes echo
  config — check especially there.
- **Account identifiers**: emails, org/user IDs in JSON metadata fields → replace with dummies.
- Preserve byte-level noise (ANSI codes, whitespace) — sanitize *content*, not *shape*. Prefer
  targeted `sed` substitutions over manual editing so structure survives intact.

## Step-by-step protocol

1. Gather the raw captures from docs 01/02; produce any missing case (per-case recipes above).
2. Verify each capture is complete stdout (not a terminal copy-paste, which loses ANSI codes —
   always capture with redirection: `... > fixture.raw 2>stderr.raw`).
3. Create the layout, name files by case, write both `META.md` files.
4. Sanitize; re-grep for secrets; diff raw vs. sanitized to confirm only intended substitutions.
5. Commit on the story branch. Fixture files are exempt from normal lint/format rules if the
   toolchain complains — they are data, not source (add ignore entries rather than reformatting
   fixtures; biome/CI must never "fix" a fixture).

## Checklist

- [ ] ≥4 fixtures per engine, byte-complete, named by the convention.
- [ ] Timeout fixtures include exit code/signal in `META.md` (even if the file is empty).
- [ ] `META.md` per engine: version, invocation, per-fixture table.
- [ ] Secrets grep clean; sanitization recorded; noise/shape preserved.
- [ ] Committed and pushed; E4 stories unblocked.
