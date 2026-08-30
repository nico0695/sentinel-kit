# Spec

## Routing Digest

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- digest_summary: Rewrite the TUI result step (`src/adapters/driving/tui/render.ts` + its two call sites in `tui-flow.ts`) into a compact digest — verdict, blocker/major findings, run path — plus an opt-in full view of the engine's raw markdown, offered by one post-run `confirm` that can change neither the rendered outcome nor the exit code (D1). Severity extraction is an adapter-local heuristic over the harness `[SEV: …]` convention (D3), colorized with `picocolors` only (D2), TUI-only (D4). Zero changes under `src/core/**`.
- scope_digest: IN — TUI digest renderer, findings heuristic + graceful degradation, opt-in raw-markdown full view, per-terminal-state and failure rendering, run directory + conditional `result.md` pointer, `picocolors` exact-pinned, rewritten `result.test.ts`, CLAUDE.md closeout. OUT — any `src/core/**` change (incl. a findings model), the CLI surfaces, `marked`/`marked-terminal` rendered markdown, pager/scrolling/truncation, `sentinel open` (`[E6.F2.H3]`), E7 items.
- acceptance_digest: 21 ACs — digest content (AC-1/2), heuristic + degradation (AC-3/4), markdown-keyed sections (AC-5), failure honesty (AC-6), run paths (AC-7), opt-in full view and its silence when there is nothing to show (AC-8/9), exit-code invariance and post-persist placement (AC-10/11), raw-not-rendered honesty (AC-12), no pager/truncation (AC-13), color as decoration only (AC-14), explicit supersession of H1 AC-7 (AC-15), guards + gate (AC-16), CLAUDE.md closeout (AC-17). **Amendment 1 (fix round 1, `e6f2h2-D12`)** adds AC-18 (the control-sequence neutralisation contract), AC-19 (a finding carrying an interior control character is never silently dropped), AC-20 (AC-14's verification made non-vacuous) and AC-21 (comment-reference hygiene), and amends AC-2/AC-3/AC-6/AC-12/AC-13/AC-14. **AC-12's original byte-verbatim identity is SUPERSEDED** — it is the confirmed vulnerability R1-002.
- amendment_digest: engine output is the stdout of an external agent reviewing possibly untrusted code, and this story created the first path by which it reaches the terminal. Amendment 1 neutralises terminal-control code points (C0 except LF/HT, DEL, C1, U+2028/U+2029) into visible `\xNN` / `\uNNNN` tokens **before** anything renders or matches, in one new pure TUI module. Printable-text fidelity — the intent AC-12 was protecting — is preserved and restated as three testable properties (completeness, restricted identity, non-executability). Zero `src/core/**`.

## Summary

- change_name: e6-f2-h2-result-rendering
- objective: new-feature
- route: continue-lite
- spec_status: formalized; **amended once** (Amendment 1, fix round 1 of 2, `e6f2h2-D12`) — pending checkpoint on the amendment

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

**Amendment 1**: "verbatim" above and throughout now means *never re-parsed, re-split, summarised, truncated or reordered* — not *byte-identical*. Every engine-derived value in this block (the finding text, and the failure message) is neutralised per AC-18 before it is rendered, so a control sequence is shown as a visible token instead of being executed. Values that are not engine-derived (`state`, `verdict`, the stage, the paths) are unaffected.

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
| **(Amendment 1)** Engine output carrying terminal-control bytes — an engine quoting a source line verbatim, which is its normal intended behaviour | Every control sequence is shown as a visible `\xNN` / `\uNNNN` token and executes nothing: the cursor never moves, nothing is erased, no clipboard or window title is written, no line is dropped, added or reordered, and the digest's own lines cannot be overwritten or forged | AC-18, AC-12(c); R1-001 / R1-002. The reviewed source is the source of the bytes — no prompt injection required |
| **(Amendment 1)** A `[SEV: …]` finding whose text carries an interior `\r`, U+2028 or U+2029 | Still counted and, if blocker/major, still listed — with the control visible. It is never silently absent from both the counts and the list | AC-19; R1-003, reproduced: the shipped `(.*)` returns `NO MATCH` for all three |
| Non-TTY / cancel before the run / empty states | Identical to `[E6.F2.H1]` | No pre-run behavior changes |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | The digest shows the terminal state always, and the verdict on its own labelled line when one exists; when the run completed without a verdict the digest says so explicitly instead of silently omitting the line | Renderer unit tests in `tui/__test__/result.test.ts` for `ok`×{approve, request-changes, comment} and for `ambiguous` | must |
| AC-2 | Every finding classified `blocker` or `major` appears in the digest on its own line carrying its severity and the finding's own text; `minor` and `nit` findings are counted, not listed. **AMENDED by Amendment 1 (§A-3)**: "the finding's own text" is the text **after AC-18 neutralisation** — the finding text reaches `stdout` with no prompt of any kind before it (R1-001), so it is the digest's most exposed engine-derived channel and must never carry an executable sequence | Unit test fed the `result` text of `fixtures/claude-code/valid-verdict.json` (1 major, 1 minor): the major line appears verbatim (the fixture holds no neutralised code point, so AC-18 P3 makes this assertion unchanged), the minor appears only in the counts. **Added**: a case whose finding text carries `ESC [1A ESC [2K` asserts the digest line contains the visible `\x1b` tokens and **no** U+001B, and that the forged text cannot occupy a line of its own | must |
| AC-3 | Finding extraction is an adapter-local heuristic: a line counts as a finding when its trimmed text (after an optional list/quote marker) starts with `[SEV: <level>]`, `<level>` ∈ {blocker, major, minor, nit} matched case-insensitively; everything after the marker is carried **verbatim**, never re-split, so `file:line` ranges (`calc.js:6-8`) and non-em-dash separators survive. **AMENDED by Amendment 1 (§A-4)**: the *parsing* tolerance above is unchanged and is the reason not to re-split — "verbatim" continues to mean **never re-parsed, re-split, summarised or truncated**. What changes is *rendering*: the matcher now receives an already-neutralised line (AC-18), so "verbatim" no longer means "byte-identical"; the only transformations ever applied to the remainder are outer-whitespace trimming (unchanged) and AC-18 neutralisation | Unit tests, unchanged: the fixture line, a range, a `- [SEV: …]` list-prefixed line, an indented line, a hyphen separator, an unknown level (ignored). **Added**: an assertion that the separator/range/em-dash cases are byte-identical before and after the amendment (AC-18 P3), proving the parsing tolerance was not traded away for the rendering fix | must |
| AC-4 | Graceful degradation: when `engineOutput` exists but no line matches, the digest emits one line saying no findings in the `[SEV: …]` format were found and pointing at the full view — never "no findings", never an empty findings section | Unit test with non-conforming markdown asserts that exact line and the absence of any count claim | must |
| AC-5 | Markdown-dependent output (findings section, `Full review` line, full-view prompt) is keyed on the presence of `engineOutput`, never on the terminal state — including `engine-error` carrying both `engineOutput` and `failure` | Parameterized flow test over the five terminal states × {`engineOutput` present, absent} | must |
| AC-6 | When a failure exists the digest shows its pipeline stage and exactly one message line — `record.failure.message` on the persisted path, `formatTuiErrorLine(result.failure.error)` on the persist-failure path — and no output anywhere contains a stack frame. **AMENDED by Amendment 1 (§A-5)**: the message is line-collapsed (D9 / `risk-e6f2h2-010`) **and** neutralised per AC-18, because it is a third engine-derived channel into the digest: `claude-code`'s `buildReviewErrorMessage` (`engines/claude-code/envelope.ts:63-65`) returns `envelope.result` — the engine's own text — verbatim as the error message on the `is_error` path, and `collapseToOneLine`'s `/\s*\n\s*/g` removes neither ESC nor a lone CR | Per-state flow tests; assert no `at ` frames in `io.out`/`io.err` (H1 AC-9 bar). **Added**: a pure `formatResultDigest` case whose `failure.message` carries ESC + a lone CR, asserting the `Failure:` line stays one physical line, shows the visible tokens, and contains no U+001B or U+000D | must |
| AC-7 | The digest always ends with the run directory (`-` when persistence failed — never fabricated) and emits the `Full review: <runDir>/result.md` line **iff** persistence succeeded and `engineOutput !== undefined`, mirroring exactly when `run-store-fs` writes that file | Three flow tests: persisted+markdown (both lines), persisted without markdown (no `Full review`), persist-failure (`-`, no `Full review`) | must |
| AC-8 | When the completed run carries `engineOutput` with at least one non-whitespace character, the flow asks exactly **one** additional `confirm` prompt after the digest; "yes" prints the full view, "no" and cancel print nothing more | Three scripted-prompter tests (`answer(true)`, `answer(false)`, `cancel()`): assert `prompter.prompts` has exactly 5 entries and the stdout tail in each case | must |
| AC-9 | A completed run with absent or blank `engineOutput` asks **no** post-run prompt | Flow test scripted with exactly the four pre-run answers: a fifth prompt would exhaust the script and throw, so the absence is proved structurally | must |
| AC-10 | The exit code is a function of (run completed, run persisted) only: 0 on the persisted path, 1 on the persist-failure path — identical across accept / decline / cancel of the full view, and the digest lines already emitted are unchanged in all three | 3×2 matrix test over {accept, decline, cancel} × {persisted, persist-failed} | must |
| AC-11 | The full-view prompt is issued strictly **after** `persistRun` settles, and `persistRun` is still called exactly once per completed run whatever the terminal state (H1 AC-8 preserved) | The `persistRun` fake records `prompter.prompts.length` at call time and asserts 4; existing exactly-once and request-identity cases stay green | must |
| AC-12 | ~~The full view emits the engine output verbatim: stripping ANSI from the emitted lines reproduces `engineOutput.split("\n")` exactly~~ — **SUPERSEDED by Amendment 1 (§A-2, §A-6); this identity is the confirmed vulnerability R1-002.** The full view now guarantees **printable-text fidelity**: `formatFullView(engineOutput, palette)` returns `splitEngineLines(engineOutput).map(neutralizeControls)` with severity colour applied per line and **nothing else** — no heading/emphasis/list transformation, no separator, footer, truncation marker, line number, summary or reordering — and no markdown-rendering dependency (`marked`, `marked-terminal`) is added. Three properties carry the guarantee: **(a) completeness** — the emitted line count equals `engineOutput.split("\n").length` and emitted line *i* derives from source line *i*, so nothing is dropped, merged, elided or reordered; **(b) restricted identity** — when `engineOutput` contains no neutralised code point, `stripAnsi(formatFullView(m, PLAIN_PALETTE)) === m.split("\n")` byte-for-byte, i.e. **the original criterion still holds exactly, on the domain where it was safe**; **(c) non-executability** — for any input, once the palette's own SGR codes are stripped no emitted line contains a code point in AC-18's neutralised set | `full-view.test.ts` + `result.test.ts`: (a) the existing 500-line case plus a control-carrying case, asserting line count and per-index origin; (b) the existing verbatim cases, unchanged, on control-free markdown; (c) a hostile fixture carrying OSC 52 (clipboard write), OSC 0 (window title), OSC 8 (hyperlink), CSI cursor-up + erase-line, BEL, DEL, 8-bit CSI (U+009B) and U+2028, asserted against the AC-18 code-point set after `stripAnsi`. `package.json` review unchanged. **Named assertion change**: `result.test.ts:900` (`formatFullView("a\r\nb", PLAIN_PALETTE)` → `["a\r", "b"]`) becomes `["a", "b"]` per §A-2's CRLF rule — an explicit, reviewed supersession, not a silent test edit | must |
| AC-13 | No pager and no truncation: a large engine output (≥500 lines) is emitted in full, with no truncation marker and no additional interaction. **AMENDED by Amendment 1 (§A-2)**: neutralisation must never become truncation — it changes bytes inside a line and never the presence, count or order of lines (AC-12(a)), and it applies no length cap, so a pathological line is emitted whole | Flow test with a 500-line `engineOutput`: assert the emitted line count and that no sixth prompt was asked. **Added**: the same 500-line case with a control sequence injected into one line still emits exactly 500 lines | must |
| AC-14 | `picocolors` is added exact-pinned to `dependencies`, imported from exactly one module under `src/adapters/driving/tui/` and nowhere else in `src/`; color is decoration only — every fact it conveys (severity, state, verdict) is also present as plain text, and the suite's content assertions hold under both `NO_COLOR=1` and `FORCE_COLOR=1`. **AMENDED by Amendment 1 (§A-7)**: unchanged as a requirement; its *verification* was vacuous under the mandated local gate and is repaired by AC-20 | `package.json` diff; import review; adapters project run under both env settings — **plus AC-20's non-vacuity check**, without which "the assertions hold under both settings" is satisfied by assertions that assert nothing | must |
| AC-15 | `[E6.F2.H1]` AC-7 is **explicitly superseded**, not silently worked around: `result.test.ts`'s `slice(-3)`/`slice(-2)` literal-tail assertions are rewritten to this spec's contract while its AC-8 coverage (exactly-once persistence, no-history diagnostic, non-zero exit, request identity) survives intact, and `render.ts`'s H1/H2 boundary doc comment is replaced by an H2 one | Diff review checklist item; the four AC-8 cases are still present in the file; PR description records the supersession (`risk-e6f2h2-003`) | must |
| AC-16 | Guards and gate: `npm run check` green (five guards; no cross-adapter import — no CLI file is touched and `formatTuiErrorLine` stays duplicated per Q9/D4), `npm test` green with the 754-test baseline intact apart from the rewritten rendering assertions, and the diff contains **zero** changes under `src/core/**` | Full gate run before the PR; `git diff --stat src/core` empty | must |
| AC-17 | CLAUDE.md is updated as the closeout step: the epic-level "Current state" facts (E6 complete, remaining MVP work) and the runtime-dependency list (`picocolors`) reflect reality | Diff includes CLAUDE.md; plan schedules it as the explicit last stage (H1 D0 precedent) | must |
| AC-18 | **(Amendment 1, §A-2 — the neutralisation contract.)** One pure TUI module exposes `splitEngineLines(markdown)` and `neutralizeControls(text)`, and **every** engine-derived string the result step writes to `stdout` or `stderr` passes through `neutralizeControls` before any other processing. `splitEngineLines` = `markdown.split("\n")` with **one** trailing U+000D removed per element (the CRLF terminator), so the element count is exactly `markdown.split("\n").length`. `neutralizeControls` replaces each code point in the **neutralised set** N — U+0000–U+0008, U+000B–U+000C, U+000D, U+000E–U+001F (ESC/U+001B included), U+007F, U+0080–U+009F (8-bit CSI U+009B and OSC U+009D included), U+2028, U+2029 — with a visible ASCII token (`\xNN` for cp ≤ U+00FF, `\uNNNN` for U+2028/U+2029) and performs **no other transformation**: no trimming, collapsing, truncation, reordering, case change or length cap. U+000A (the splitter's line separator) and U+0009 (HT — forward-only, cannot reposition, erase or introduce a sequence, and is the ordinary indentation byte of quoted source) are deliberately **not** in N. Three properties hold: **P1 visibility** — the output contains no code point in N; **P2 idempotence** — `neutralizeControls(neutralizeControls(s)) === neutralizeControls(s)`; **P3 transparency** — a string with no code point in N is returned unchanged | New `__test__/engine-text.test.ts`: a table-driven case per boundary code point (0x00, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1b, 0x1f, 0x20, 0x7e, 0x7f, 0x80, 0x9b, 0x9f, 0xa0, U+2027, U+2028, U+2029, U+202A) embedded between two printable sentinels, asserting the exact expected string — which is what makes "no other transformation" checkable; plus P1/P2/P3 as their own cases; plus `splitEngineLines` cases for `"a\r\nb\nc"`, a lone interior CR, a trailing CR with no LF, `""` and `"a\n"`. Mutation: widening N to include U+0009 fails the 0x09 case; dropping the CRLF rule fails the `"a\r\nb\nc"` case | must |
| AC-19 | **(Amendment 1, §A-4 — R1-003.)** A finding line whose remainder carries an interior control character or Unicode line separator (U+000D, U+2028, U+2029, U+001B, …) is **still recognised**: it is included in the `Findings:` counts and, when `blocker` or `major`, listed on its own digest line, with the control rendered as its AC-18 token. A finding is never silently absent from *both* the counts and the list — the failure mode the amendment closes, in which a single byte deletes a blocker from a tool whose purpose is surfacing blockers, with no degradation notice because other findings matched. Two independent layers must both hold: the neutralise-before-match ordering (AC-18), and `FINDING_LINE`'s remainder group widened from `(.*)` to `([^\n]*)` so an unneutralised caller degrades to a *visible* finding rather than a vanished one | `findings.test.ts` unit cases for interior `\r`, U+2028, U+2029 and ESC (the exact three inputs reproduced as `NO MATCH` against the shipped regex) **and** the same inputs asserted end-to-end through `formatResultDigest`, so neither layer alone satisfies the AC. Mutation: reverting `([^\n]*)` to `(.*)` fails the unit cases; removing the ordering fails the digest cases. **Named assertion change**: `findings.test.ts:223`'s `extractFindings("[SEV: major] a\r\n[SEV: nit] b\r\n")` is rewritten to the amended signature (§A-3) | must |
| AC-20 | **(Amendment 1, §A-7 — R3-002 + R3-001.)** AC-14's verification is non-vacuous under the mandated local gate (`npm test` with `CI` and `FORCE_COLOR` unset), where `picocolors` binds all four roles to global `String` (`node_modules/picocolors/picocolors.js:22`, `let f = enabled ? formatter : () => String`) and `TUI_PALETTE.good === String` is true. (a) No assertion that a role *decorates* may use the ambient `TUI_PALETTE`: the six at `full-view.test.ts:429-434,449-460,462-469` are rewritten against a deterministic palette — the `MARKED` double already used in `result.test.ts:452-457`, or `picocolors.createColors(true)` (verified present, returns real SGR) — and the block's doc-comment is corrected to state what it actually proves. (b) At least one assertion distinguishes the flow passing `TUI_PALETTE` from `PLAIN_PALETTE` at **all three** call sites (`tui-flow.ts:242`, `:272`, `:329`) — AC-14's only user-visible behaviour, currently untested | (a) mutation check: swap each rewritten assertion's palette argument for `PLAIN_PALETTE` with `CI`/`FORCE_COLOR` unset and confirm it now **fails** (today it passes); the existing dual `NO_COLOR=1` / `FORCE_COLOR=1` runs must still agree. (b) mutation check: change one `TUI_PALETTE` argument in `tui-flow.ts` to `PLAIN_PALETTE` and confirm a flow test fails with `CI`/`FORCE_COLOR` unset. §A-7 records two admissible mechanisms for (b) with a recommendation; the AC constrains the outcome, not the mechanism | must |
| AC-21 | **(Amendment 1, §A-8 — R2-001.)** Every acceptance-criterion reference in a comment names its story: the four bare citations in `tui-flow.ts` (`:220` "(AC-7)", `:231` "AC-6:", `:252` "(AC-10)", `:259` "AC-5:") are qualified as `[E6.F2.H2]` criteria, in a module whose header pins it to `[E6.F2.H1]` and whose other bare numbers denote still-live H1 criteria — `:220`'s "(AC-7)" currently resolves against H1's AC-7, the very criterion AC-15 deletes | Diff review: `grep -n "AC-" src/adapters/driving/tui/tui-flow.ts` shows every H2 citation qualified and every remaining bare number resolving to a live H1 criterion. No behaviour change, so no test moves | should |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `risk-e6f2h2-001` (medium, open) | "Blockers at a glance" rests on a prompt convention, not a contract | Bounded by AC-3/AC-4: the heuristic is opportunistic and its failure mode is an honest degradation line, never a false "no findings" |
| `risk-e6f2h2-002` (low, narrowed by D2) | One new runtime dependency; the full view is raw text, not rendered markdown | AC-12/AC-14 pin both the honesty and the confinement |
| `risk-e6f2h2-003` (low) | A completed story's AC is superseded | AC-15 makes it an explicit, reviewed act |
| `risk-e6f2h2-004` (low, closed by D3, retained as a guard) | Scope-creep vector into core | AC-16 asserts an empty `src/core` diff |
| `risk-e6f2h2-005` (low, **new**) | Uncapped blocker/major listing can flood the digest for a pathological review | Deliberate: capping risks hiding a blocker, which would break the backlog acceptance. Harness prompts mandate ~120-char one-line summaries. Revisit if E7.F1.H1 dogfooding shows real floods |
| `risk-e6f2h2-006` (low, **new**) | Behavioral change: the process now waits for input after the run instead of exiting. A user who walked away returns to a pending prompt | Accepted: the surface is interactive by definition and H1's non-TTY guard guarantees no script can reach this prompt. Cancel is a value, so Esc/Ctrl+C resolves it cleanly (AC-10) |
| `risk-e6f2h2-011` (medium, **Amendment 1**) | AC-18 defends against terminal *control*, not against visual spoofing by printable code points: bidi overrides (U+202A–U+202E, U+2066–U+2069), homoglyphs, and a finding whose plain text simply reads `Verdict: approve` all survive neutralisation by design | Accepted and named as a non-goal: the three confirmed findings are control-sequence findings, and widening N to bidi controls would mangle legitimate RTL review text. Bounded by structure — every listed finding is indented two spaces behind a `[blocker]`/`[major]` label, so forged text cannot occupy a digest field's position. Revisit at E7 dogfooding |
| `risk-e6f2h2-012` (low, **Amendment 1**) | The same engine bytes still reach two surfaces this story does not own: the CLI's `runs show` (`cli/render/format-runs.ts:188` emits `record.engineOutput.split("\n")` byte-verbatim) and H1's catch-all `io.stderr(formatTuiErrorLine(error))` | Out of scope by D4 (the CLI is untouched) and by the `adapters-isolated` guard (driving → driving imports are forbidden, so the CLI would need its own copy — see §A-9). Recorded so the gap is a decision, not an oversight; candidate for an E7 story. The TUI catch-all is materially lower risk: `run-review.ts:475` converts engine faults into a `failure` value rather than a rejection, so engine text does not normally reach it |

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

## Amendment 1 — control-sequence neutralisation (fix round 1 of 2; `cp-review-gate-round-1` / `e6f2h2-D12`)

Recorded as an amendment, not a rewrite: every original criterion above is still readable, with its supersession or narrowing marked inline (`[E5.F1.H2]` design Amendment 1 precedent).

### Why the spec had to reopen

A full-4r review over the frozen diff `59b806e..d8ad970` returned three CRITICALs sharing one cause. This story created the **first path by which engine output — the stdout of an external AI agent reviewing arbitrary, possibly untrusted code — reaches the user's terminal**, and it carried no control-character handling at any layer. The premise needs no prompt injection: an engine quoting a source line verbatim inside a finding summary is its normal, intended behaviour, so control bytes present in the *reviewed source* reach the renderer by design. The repo already treats engine output as escape-carrying (`core/run/builtin-verdict-extraction.ts:80` strips ANSI SGR), but that defence is scoped to the verdict window.

Only **R1-002 forced a spec change**: AC-12 *mandated* `stripAnsi(emitted) === engineOutput.split("\n")` and the suite asserted it, so any sanitisation of the full view contradicted the accepted contract. R1-001 and R1-003 are fix-stage work; they appear here because the criteria that describe them (AC-2, AC-3, AC-6) had to stop implying byte-verbatim rendering.

### What AC-12 was protecting, and what replaces it

The intent behind byte-verbatim was **printable-text fidelity**: the user must see the engine's review exactly as written — nothing summarised, truncated, reordered or silently dropped — and, per D2 (no markdown renderer), as raw text rather than rendered markdown. That intent survives entirely. What is removed is the *terminal-control channel*: sequences become **visible rather than executable**. AC-12(b) keeps the original identity verbatim on every input that has nothing to neutralise, so the amendment narrows the old contract's domain instead of discarding it.

### Reproduced, not asserted

Probes run against the target's own modules before writing this amendment:

| Input (`[SEV: blocker] a.ts:2` + …) | shipped `(.*)` | `([^\n]*)` alone | AC-18 order + `(.*)` |
|---|---|---|---|
| interior U+000D | `NO MATCH` | matches, **raw CR carried** | matches, text `a.ts:2\x0dreal` |
| interior U+2028 | `NO MATCH` | matches, **raw LS carried** | matches, text `a.ts:2\u2028real` |
| interior U+2029 | `NO MATCH` | matches, **raw PS carried** | matches, text `a.ts:2\u2029real` |
| `ESC [1A ESC [2K` | matches, **raw ESC carried** | matches, raw ESC carried | matches, text `real\x1b[1A\x1b[2K` |
| trailing U+000D (CRLF) | matches | matches | matches, unchanged |

Also confirmed: `neutralizeControls` is idempotent and transparent on clean input; `"a\r\nb\nc"` keeps a 3-element split; and `TUI_PALETTE.good === String` under the local gate (`createColors(true)` is available and emits real SGR) — the R3-002 tautology, verified rather than inferred.

### Scope of the amendment

- **In scope**: `src/adapters/driving/tui/**` and its suites only — one new pure module, `render.ts`'s composition, `findings.ts`'s remainder group and signature, `tui-flow.ts` comments, the named test changes.
- **Out of scope, deliberately**: `src/core/**` (unchanged — `risk-e6f2h2-004`'s guard still holds; if a fix needs core, that is level C, stop and ask), the CLI surfaces (D4), and everything in `risk-e6f2h2-011` / `risk-e6f2h2-012`.
- **Not neutralised**: `state`, `verdict` and `failure.stage` are closed enums; `runDir` is built by the store from user configuration, not from engine output.
- **No new decision level fired**: the mechanism is internal, reversible and inside one adapter (level A). No B-level item (no new dependency, no public API, no config format). No C-level item.

## Approval Notes

- D1–D4 encoded; nine A-level questions resolved here (A1–A9, of which A6–A9 are new) and must be recorded in state and history with authorship `claude`.
- **Amendment 1** (`e6f2h2-D12`, user-decided at `cp-review-gate-round-1`): AC-12's byte-verbatim identity superseded; AC-2/AC-3/AC-6/AC-13/AC-14 amended; AC-18..AC-21 added; `risk-e6f2h2-011` and `risk-e6f2h2-012` appended. Design mechanism in `design.md` §Amendment 1. Two assertions change by name (`result.test.ts:900`, `findings.test.ts:223`) — reviewed supersessions, to be called out in the PR description alongside AC-15's.
- `[E6.F2.H1]` AC-7 is superseded by this spec — the supersession belongs in the PR description and the history entry, not only in the diff.
- Two new risks recorded (`risk-e6f2h2-005` digest flood, `risk-e6f2h2-006` post-run wait); both accepted with rationale.
- Next stage: `sddl-design` (picocolors ratification and exact pin, digest copy, colour seam, module layout, renderer signature).

## Budget Notes

- Deliberately above the lite word target, matching the `[E6.F2.H1]` precedent: 21 ACs (17 original + 4 from Amendment 1) cover two backlog acceptance bullets, four firm decisions, nine A-level resolutions and an explicit supersession of a completed story's AC. The tables are the contract QA validates against.
- Amendment 1 adds one section and four criteria rather than rewriting the artifact: the original text of every amended criterion stays readable with its supersession marked inline, so a reviewer can see what changed and why, not only the new state.
