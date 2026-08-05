# 04 — E1.F1.H4: Context mode measurement

> ⚪ **optional** · Depends on: E1.F1.H1, E1.F1.H2
> Issue: [#10](https://github.com/nico0695/sentinel-kit/issues/10)
> Does **not** block E4 or the MVP (inline is the default). Skip or defer freely — its output
> informs the prompt-assembler roadmap, nothing else.

## Objective

Produce **data** (PRD §6.3) comparing the three ways of delivering context to an engine, over
2-3 real PRs, so the future decision about `contextMode: agent` is made on evidence.

**Acceptance criteria** (backlog):
- [ ] Comparison table
- [ ] Recommendation for the assembler roadmap

## Context: the three modes

| Mode | How context reaches the engine | Status |
|------|-------------------------------|--------|
| **(a) Inline diff** | Sentinel computes the diff and injects it into the prompt with harness + skills | MVP default, implemented (E3) |
| **(b) Autonomous diff** | Prompt contains *no* diff; instructs the agent to run `git diff <base>...<target>` and read files itself in the worktree | Under evaluation |
| **(c) Skill materialization** | Harness/skills written as native config files in the worktree (`CLAUDE.md` for Claude Code, `AGENTS.md` for OpenCode); prompt stays minimal (task + verdict contract) | Under evaluation, complements (a) or (b) |

Trade-offs to be quantified (from the PRD — the *claims* this experiment tests):

| | (a) inline | (b) autonomous | (c) materialization |
|---|---|---|---|
| Determinism / reproducibility | High (same input → same prompt) | Lower (two runs may explore differently) | Middle (files fixed, exploration varies) |
| Audit trail | Full (persisted prompt = what the engine saw) | Weak (prompt ≠ what the agent read) | Middle |
| Context cost | High (diff consumes context; needs truncation) | Zero diff cost | Low prompt cost |
| Dependence on engine tool-use quality | None | High | Medium |
| Cleanup burden | None | None | Must remove materialized files on worktree destroy; per-engine mapping |

Note: the harness schema already accepts `contextMode: inline | agent` (E3.F1.H3); `agent` is
reserved and currently errors as not implemented. This experiment is what decides whether/how
`agent` gets implemented.

## Experiment design

**Subjects**: 2-3 real PRs — ideally from sentinel-kit itself (dogfooding, PRD §7). Pick PRs of
different sizes (e.g. one small ~1 file, one medium multi-file). For each PR you know the
"ground truth": what a good review should catch.

**Conditions**: for each PR × each engine, run the review under:
1. **(a)** the canonical inline invocation from docs 01/02 — this is the baseline.
2. **(b)** same invocation, but a prompt variant with the diff section replaced by instructions:
   base branch, target branch, and "compute the diff yourself (`git diff <base>...<target>`)
   and read any file you need before reviewing".
3. **(c)** write the harness body into `CLAUDE.md` / `AGENTS.md` inside the worktree, and send a
   minimal prompt (task + verdict contract only). Can be combined with (b) — if time is short,
   test (c) in its (c)+(b) form, which is its realistic shape.

**Runs**: at least 2 runs per cell if budget allows — reproducibility can't be observed from a
single run. That is up to 2 PRs × 2 engines × 3 modes × 2 runs = 24 runs; trim by dropping to
one engine first (modes vary more than engines) rather than dropping runs.

**Metrics per run**:

| Metric | How to measure |
|--------|---------------|
| Perceived quality (1-5) | Did it catch the known findings? False positives? Depth of explanations? Judge against the same rubric for every run |
| Tokens | From the JSON usage fields (Claude Code); for OpenCode use whatever the spike found, or note "unavailable" |
| Reproducibility | Same verdict across repeat runs? Same findings set (compare finding-by-finding)? |
| Wall-clock time | `time` the invocation — (b) explores, so expect it slower; quantify |
| Verdict parse success | Did the output honor the `VERDICT:` contract in every mode? (b)/(c) may weaken instruction-following |

## Result template → `docs/engines/context-modes.md`

```markdown
# Context modes — measurement results

## Setup
- PRs used: <links/refs + why chosen + known ground-truth findings>
- Engines/versions: <...> · Runs per cell: <n>

## Results
| PR | Engine | Mode | Quality (1-5) | Tokens in/out | Time | Verdict parsed | Repro (verdict/findings) |
|----|--------|------|---------------|---------------|------|----------------|--------------------------|
| ...

## Observations
- <per-mode notes: where (b) shined or wandered; whether (c) files were actually read; ...>

## Recommendation for the assembler roadmap
- <keep inline only / implement agent mode for case X / hybrid>, because <evidence>
- Suggested backlog impact: <e.g. new story, or close the question>
```

## Checklist

- [ ] 2-3 real PRs selected with known ground truth.
- [ ] All planned cells run; raw outputs saved (they may yield bonus fixtures for `fixtures/`).
- [ ] Comparison table filled; recommendation written with evidence.
- [ ] `docs/engines/context-modes.md` committed.
