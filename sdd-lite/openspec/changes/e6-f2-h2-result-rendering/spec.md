# Spec

## Routing Digest

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- digest_summary: Rewrite the TUI result step (`src/adapters/driving/tui/render.ts` + its two call sites in `tui-flow.ts`) into a compact digest — verdict, blocker/major findings, run path — plus an opt-in full view of the engine's raw markdown, offered by one post-run `confirm` that can change neither the rendered outcome nor the exit code (D1). Severity extraction is an adapter-local heuristic over the harness `[SEV: …]` convention (D3), colorized with `picocolors` only (D2), TUI-only (D4). Zero changes under `src/core/**`.
- scope_digest: IN — TUI digest renderer, findings heuristic + graceful degradation, opt-in raw-markdown full view, per-terminal-state and failure rendering, run directory + conditional `result.md` pointer, `picocolors` exact-pinned, rewritten `result.test.ts`, CLAUDE.md closeout. OUT — any `src/core/**` change (incl. a findings model), the CLI surfaces, `marked`/`marked-terminal` rendered markdown, pager/scrolling/truncation, `sentinel open` (`[E6.F2.H3]`), E7 items.
- acceptance_digest: 17 ACs — digest content (AC-1/2), heuristic + degradation (AC-3/4), markdown-keyed sections (AC-5), failure honesty (AC-6), run paths (AC-7), opt-in full view and its silence when there is nothing to show (AC-8/9), exit-code invariance and post-persist placement (AC-10/11), raw-not-rendered honesty (AC-12), no pager/truncation (AC-13), color as decoration only (AC-14), explicit supersession of H1 AC-7 (AC-15), guards + gate (AC-16), CLAUDE.md closeout (AC-17).

## Summary

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- spec_status: formalized, pending checkpoint

Formalizes story **[E6.F2.H2] — Terminal result rendering** (issue #39, milestone "E6 — Interface"), the last required story of E6. Backlog acceptance: *verdict and blockers visible at a glance · run path shown*. The four firm decisions from the proposal checkpoint (**e6f2h2-D1..D4**) are encoded below and are not reopened.

## Scope Boundary

### In Scope

- Rewrite `src/adapters/driving/tui/render.ts` into this story's result surface: a **compact digest** (terminal state, verdict, failure, findings, run paths) plus a **full-view renderer** for the engine's raw markdown (D1).
- Update both call sites in `src/adapters/driving/tui/tui-flow.ts` (~L208 persist-failure branch, ~L218 success branch) to pass the data they already hold: `engineOutput`, `failure`, and the run directory.
- An **adapter-local severity/finding heuristic** over the harness `[SEV: level] file:line — summary` convention, living under `src/adapters/driving/tui/` (D3), degrading gracefully when the engine does not comply.
- One **post-run `confirm` prompt** offering the full view, issued strictly after persistence (D1).
- Honest rendering of every terminal state, including the failure stage and a one-line failure message.
- The persisted run directory plus a pointer to `result.md` when that file actually exists (Q7).
- `picocolors` as a new **exact-pinned** runtime dependency, ratified at design per the `@clack/prompts` precedent (D2), confined to one TUI module.
- Rewriting `src/adapters/driving/tui/__test__/result.test.ts` and extending the scripted-prompter fixtures with the post-run answer.
- CLAUDE.md closeout: the "Current state" epic facts and the runtime-dependency list.

### Out Of Scope

- **Any change under `src/core/**`** — in particular a structured findings/severity model beside the verdict parser (D3; `risk-e6f2h2-004` stands as a guard: if execution finds itself editing core, stop, that is level C).
- The CLI surfaces (D4): `cli/render/format-review.ts`'s `key<TAB>value` contract (`REVIEW_OUTCOME_FIELDS`) and `format-runs.ts` are untouched. H1's deliberate `formatTuiErrorLine` duplication stays (Q9).
- `marked` / `marked-terminal` and therefore **rendered** markdown (D2). The full view prints raw text.
- Any pager, scrolling, interactive finding navigation, or output truncation (Q8).
- `[E6.F2.H3]` `sentinel open` (⚪), E7 items (E2E smoke, dogfooding, docs, release).
- Changing the prompt seam (`TuiPrompter`), the TTY guard, the cancel semantics, or the exit-code contract established by `[E6.F2.H1]`.

### Non-Goals

- Making the `[SEV: …]` convention a contract. It is a harness *prompt* instruction; user harnesses may declare any output shape (`risk-e6f2h2-001`). This story reads it opportunistically and must never claim more than it can prove.
- Re-deriving or second-guessing the verdict. `state` and `verdict` come from the core as-is and are rendered, never recomputed.
- Persisting anything new, or changing what `run-store-fs` writes.

## Expected Behavior

The digest's **fields, their conditions and their order** are the contract; the literal labels below are indicative and fixed at design.

```
Review result: <state>
Verdict: <verdict>                       (or an explicit "no verdict" line)
Failure: <stage> — <one-line message>    (only when a failure exists)
Findings: <counts by severity>           (or the degradation line)
  [blocker] <finding text, verbatim>     (every blocker and major, one line each)
  [major]   <finding text, verbatim>
Run directory: <absolute path | ->
Full review: <runDir>/result.md          (only when that file exists)
```

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `ok` run, engine followed the convention | Digest with verdict, every blocker/major listed verbatim, minor/nit counted, run directory + `Full review` path; then the full-view prompt | Backlog acceptance; `fixtures/claude-code/valid-verdict.json` is the honest sample |
| `ok` run, engine reported no findings | Digest states no `[SEV: …]` findings were found and points at the full view — it never asserts "no findings" as fact | Degradation and "genuinely clean" are indistinguishable from the adapter's position (`risk-e6f2h2-001`) |
| `ambiguous` run | Digest says explicitly that no verdict could be parsed from the engine output; findings extraction is still attempted on the markdown; full-view prompt offered | `harnesses/*/output.md` "Ambiguity Rule"; `Verdict` is absent, not empty |
| `engine-error` **with** `engineOutput` (parse-stage fault) | Failure stage + message AND the markdown-dependent sections (findings, `Full review`, prompt) — both are set on this path | `src/core/run/run-review.ts` documents `engineOutput` present whenever the ENGINE stage succeeded, `failure` not exclusive with it |
| `engine-error` / `timeout` / `validation-failed` **without** `engineOutput` | Failure stage + one-line message, no findings section, no `Full review` line, **no prompt** | Nothing to show; markdown-dependent output is keyed on the data, never on the state |
| Full view accepted | The engine output is printed to stdout verbatim, line by line, colorized only where the severity convention matches | D2 honesty: raw markdown text, not rendered markdown |
| Full view declined or cancelled | Nothing further is printed; the digest already rendered stands unchanged | D1 |
| Any answer to the full-view prompt | Exit code unchanged: 0 on the persisted path, 1 on the persist-failure path | D1; H1 property "completed + persisted → 0" |
| `persistRun` throws | Digest still rendered with `Run directory: -` and no `Full review` line, the two H1 stderr diagnostics still emitted, full view still offered when markdown exists, exit 1 | H1 AC-8 / CLI D13 mirror preserved; this branch is the only place the markdown exists at all |
| Very large engine output | Printed in full: no pager, no truncation marker, no extra interaction | Q8; terminal scrollback is the pager |
| Non-TTY / cancel before the run / empty states | Identical to `[E6.F2.H1]` | No pre-run behavior changes |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | The digest shows the terminal state always, and the verdict on its own labelled line when one exists; when the run completed without a verdict the digest says so explicitly instead of silently omitting the line | Renderer unit tests in `tui/__test__/result.test.ts` for `ok`×{approve, request-changes, comment} and for `ambiguous` | must |
| AC-2 | Every finding classified `blocker` or `major` appears in the digest on its own line carrying its severity and the finding's own text; `minor` and `nit` findings are counted, not listed | Unit test fed the `result` text of `fixtures/claude-code/valid-verdict.json` (1 major, 1 minor): the major line appears verbatim, the minor appears only in the counts | must |
| AC-3 | Finding extraction is an adapter-local heuristic: a line counts as a finding when its trimmed text (after an optional list/quote marker) starts with `[SEV: <level>]`, `<level>` ∈ {blocker, major, minor, nit} matched case-insensitively; everything after the marker is carried **verbatim**, never re-split, so `file:line` ranges (`calc.js:6-8`) and non-em-dash separators survive | Unit tests: the fixture line, a range, a `- [SEV: …]` list-prefixed line, an indented line, a hyphen separator, an unknown level (ignored) | must |
| AC-4 | Graceful degradation: when `engineOutput` exists but no line matches, the digest emits one line saying no findings in the `[SEV: …]` format were found and pointing at the full view — never "no findings", never an empty findings section | Unit test with non-conforming markdown asserts that exact line and the absence of any count claim | must |
| AC-5 | Markdown-dependent output (findings section, `Full review` line, full-view prompt) is keyed on the presence of `engineOutput`, never on the terminal state — including `engine-error` carrying both `engineOutput` and `failure` | Parameterized flow test over the five terminal states × {`engineOutput` present, absent} | must |
| AC-6 | When a failure exists the digest shows its pipeline stage and exactly one message line — `record.failure.message` on the persisted path, `formatTuiErrorLine(result.failure.error)` on the persist-failure path — and no output anywhere contains a stack frame | Per-state flow tests; assert no `at ` frames in `io.out`/`io.err` (H1 AC-9 bar) | must |
| AC-7 | The digest always ends with the run directory (`-` when persistence failed — never fabricated) and emits the `Full review: <runDir>/result.md` line **iff** persistence succeeded and `engineOutput !== undefined`, mirroring exactly when `run-store-fs` writes that file | Three flow tests: persisted+markdown (both lines), persisted without markdown (no `Full review`), persist-failure (`-`, no `Full review`) | must |
| AC-8 | When the completed run carries `engineOutput` with at least one non-whitespace character, the flow asks exactly **one** additional `confirm` prompt after the digest; "yes" prints the full view, "no" and cancel print nothing more | Three scripted-prompter tests (`answer(true)`, `answer(false)`, `cancel()`): assert `prompter.prompts` has exactly 5 entries and the stdout tail in each case | must |
| AC-9 | A completed run with absent or blank `engineOutput` asks **no** post-run prompt | Flow test scripted with exactly the four pre-run answers: a fifth prompt would exhaust the script and throw, so the absence is proved structurally | must |
| AC-10 | The exit code is a function of (run completed, run persisted) only: 0 on the persisted path, 1 on the persist-failure path — identical across accept / decline / cancel of the full view, and the digest lines already emitted are unchanged in all three | 3×2 matrix test over {accept, decline, cancel} × {persisted, persist-failed} | must |
| AC-11 | The full-view prompt is issued strictly **after** `persistRun` settles, and `persistRun` is still called exactly once per completed run whatever the terminal state (H1 AC-8 preserved) | The `persistRun` fake records `prompter.prompts.length` at call time and asserts 4; existing exactly-once and request-identity cases stay green | must |
| AC-12 | The full view emits the engine output verbatim: stripping ANSI from the emitted lines reproduces `engineOutput.split("\n")` exactly — no heading/emphasis/list transformation — and no markdown-rendering dependency (`marked`, `marked-terminal`) is added | Unit test on the emitted lines after ANSI-stripping; `package.json` review | must |
| AC-13 | No pager and no truncation: a large engine output (≥500 lines) is emitted in full, with no truncation marker and no additional interaction | Flow test with a 500-line `engineOutput`: assert the emitted line count and that no sixth prompt was asked | must |
| AC-14 | `picocolors` is added exact-pinned to `dependencies`, imported from exactly one module under `src/adapters/driving/tui/` and nowhere else in `src/`; color is decoration only — every fact it conveys (severity, state, verdict) is also present as plain text, and the suite's content assertions hold under both `NO_COLOR=1` and `FORCE_COLOR=1` | `package.json` diff; import review; adapters project run under both env settings | must |
| AC-15 | `[E6.F2.H1]` AC-7 is **explicitly superseded**, not silently worked around: `result.test.ts`'s `slice(-3)`/`slice(-2)` literal-tail assertions are rewritten to this spec's contract while its AC-8 coverage (exactly-once persistence, no-history diagnostic, non-zero exit, request identity) survives intact, and `render.ts`'s H1/H2 boundary doc comment is replaced by an H2 one | Diff review checklist item; the four AC-8 cases are still present in the file; PR description records the supersession (`risk-e6f2h2-003`) | must |
| AC-16 | Guards and gate: `npm run check` green (five guards; no cross-adapter import — no CLI file is touched and `formatTuiErrorLine` stays duplicated per Q9/D4), `npm test` green with the 754-test baseline intact apart from the rewritten rendering assertions, and the diff contains **zero** changes under `src/core/**` | Full gate run before the PR; `git diff --stat src/core` empty | must |
| AC-17 | CLAUDE.md is updated as the closeout step: the epic-level "Current state" facts (E6 complete, remaining MVP work) and the runtime-dependency list (`picocolors`) reflect reality | Diff includes CLAUDE.md; plan schedules it as the explicit last stage (H1 D0 precedent) | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `risk-e6f2h2-001` (medium, open) | "Blockers at a glance" rests on a prompt convention, not a contract | Bounded by AC-3/AC-4: the heuristic is opportunistic and its failure mode is an honest degradation line, never a false "no findings" |
| `risk-e6f2h2-002` (low, narrowed by D2) | One new runtime dependency; the full view is raw text, not rendered markdown | AC-12/AC-14 pin both the honesty and the confinement |
| `risk-e6f2h2-003` (low) | A completed story's AC is superseded | AC-15 makes it an explicit, reviewed act |
| `risk-e6f2h2-004` (low, closed by D3, retained as a guard) | Scope-creep vector into core | AC-16 asserts an empty `src/core` diff |
| `risk-e6f2h2-005` (low, **new**) | Uncapped blocker/major listing can flood the digest for a pathological review | Deliberate: capping risks hiding a blocker, which would break the backlog acceptance. Harness prompts mandate ~120-char one-line summaries. Revisit if E7.F1.H1 dogfooding shows real floods |
| `risk-e6f2h2-006` (low, **new**) | Behavioral change: the process now waits for input after the run instead of exiting. A user who walked away returns to a pending prompt | Accepted: the surface is interactive by definition and H1's non-TTY guard guarantees no script can reach this prompt. Cancel is a value, so Esc/Ctrl+C resolves it cleanly (AC-10) |

## Open Questions And Decisions

### Firm user decisions encoded (not reopened)

`e6f2h2-D1` digest + opt-in full view · `e6f2h2-D2` `picocolors` only, raw markdown · `e6f2h2-D3` extraction in the TUI adapter · `e6f2h2-D4` TUI only.

### Resolved in this spec (A-level, recorded for the audit history)

| Id | Question | Resolution | Rationale |
|---|---|---|---|
| e6f2h2-A1 (Q5) | H1 AC-7's pinned literal tail | Explicitly superseded by AC-1..AC-8; the suite is rewritten, its AC-8 coverage preserved (AC-15) | The pin existed to stop H2's surface slipping in early; that purpose is now served, and removing it must be visible in the diff and the PR |
| e6f2h2-A2 (Q6) | Non-`ok` states and `ambiguous` | Failure stage + one message line whenever `failure` exists; markdown-dependent sections keyed on `engineOutput`, never on `state`; `ambiguous` states plainly that no verdict was parsed (AC-5, AC-6) | `src/core/run/run-review.ts` documents `engineOutput` and `failure` as non-exclusive, so state-keyed rendering would be wrong on the parse-fault path |
| e6f2h2-A3 (Q7) | Run-path shape | Run directory always; `Full review: <runDir>/result.md` iff persisted and `engineOutput !== undefined` (AC-7) | `run-store-fs` writes `result.md` under exactly that condition; any looser rule points the user at a file that does not exist |
| e6f2h2-A4 (Q8) | Long output | Full view prints to stdout with no pager and no truncation; the digest bounds itself by listing only blocker/major (AC-13) | Terminal scrollback is the pager; truncation would risk hiding a blocker (`risk-e6f2h2-005`) |
| e6f2h2-A5 (Q9) | `formatTuiErrorLine` duplication revisit | Performed: kept. This story adds a second *intra-TUI* consumer (AC-6) and touches no CLI file, so the cross-adapter overlap does not grow and the `adapters-isolated` guard needs no edit | H1's revisit condition ("only if H2 materially grows the overlap") does not fire; confirmed by D4 |
| e6f2h2-A6 (new) | Is the full view offered on the persist-failure branch too? | Yes, whenever markdown exists — it is the branch where the engine output exists nowhere else on disk. The exit code stays 1 (AC-10) | D1 scopes the toggle to "the result step"; both branches are the result step, and withholding it exactly where nothing was written would invert the story's motivation |
| e6f2h2-A7 (new) | Prompt mechanism for the full view | The existing `TuiPrompter.confirm` seam; no new prompter capability, no `tui-deps.ts` contract change | Keeps the seam and the scripted doubles unchanged — the fixtures need one extra scripted answer, nothing more |
| e6f2h2-A8 (new) | Heuristic shape | Classify by severity marker only, carry the remainder of the line verbatim (AC-3) | Only the severity is needed for grouping and color; not re-splitting on `—` removes the em-dash / line-range / separator fragility entirely |
| e6f2h2-A9 (new) | Blank vs absent `engineOutput` | The full-view prompt requires non-blank markdown (AC-8/AC-9); the `Full review` path line requires only `!== undefined` (AC-7) | Each condition mirrors what it promises: the prompt promises content, the path line promises a file — and `run-store-fs` writes the file for any defined value |

No level-C item arose: nothing in these criteria requires touching `src/core/**`. No new B-level question arose either — `picocolors` (the only public-surface change) was already decided by D2.

### Remaining for design

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Exact digest labels, ordering and spacing | Tests assert literal strings; the spec fixes fields and conditions, not copy | implementation | open — design fixes the copy |
| Colour determinism mechanism (seam vs ANSI-stripping in assertions) | AC-14 requires assertions independent of ambient `NO_COLOR`/`FORCE_COLOR`/TTY | implementation | open — design picks the mechanism |
| Module layout inside `src/adapters/driving/tui/` (renderer vs a separate findings/colour module) and the confinement point for `picocolors` | Keeps the `@clack/prompts` confinement precedent legible | implementation | open — design detail |
| `formatTuiResult` signature change and how `tui-flow.ts` passes `engineOutput`/`failure` at both call sites | Two call sites with different failure shapes (`unknown` vs reduced `message`) | implementation | open — design detail |

## Approval Notes

- D1–D4 encoded; nine A-level questions resolved here (A1–A9, of which A6–A9 are new) and must be recorded in state and history with authorship `claude`.
- `[E6.F2.H1]` AC-7 is superseded by this spec — the supersession belongs in the PR description and the history entry, not only in the diff.
- Two new risks recorded (`risk-e6f2h2-005` digest flood, `risk-e6f2h2-006` post-run wait); both accepted with rationale.
- Next stage: `sddl-design` (picocolors ratification and exact pin, digest copy, colour seam, module layout, renderer signature).

## Budget Notes

- Deliberately above the lite word target, matching the `[E6.F2.H1]` precedent: 17 ACs cover two backlog acceptance bullets, four firm decisions, nine A-level resolutions and an explicit supersession of a completed story's AC. The tables are the contract QA validates against.
