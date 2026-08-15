# QA Report — FINAL

## Digest

- change_name: e4-f1-h2-verdict-parser
- mode: final
- reviewed_at: 2026-08-15T18:30:00Z
- scope: whole implemented change (ST-1, ST-2, ST-3), all 16 ACs, full gate
- verdict: **pass**
- gate: `npm run check` green (80 files clean, `tsc --noEmit` clean, depcruise 56 modules / 104 deps, 0 violations); `npm test` 225/225 (16 test files, 0 failures) — both re-run independently by this review, not taken from execution-log.md's report
- diff footprint: exactly matches spec.md's allowed-diff list (AC-15) — `builtin-verdict-extraction.ts`, doc-comment-only hunks in `run-review.ts`/`index.ts`/`verdict.ts`, `fixtures/synthetic/**` (3 new files), `fixtures/README.md` (append-only), `src/core/run/__test__/**` (2 new files). Nothing else. `git diff --stat origin/main...HEAD -- src/ fixtures/` → 10 files changed, 477 insertions(+), 21 deletions(-).

## AC-by-AC (16/16 verified)

| AC | Proof location | Verified how | Status |
|---|---|---|---|
| AC-1 | `builtin-verdict-extraction.test.ts` L25-47, 4 real marker fixtures via `verdict-fixture-loader.ts` | Re-ran `npm test`; independently read `valid-verdict.json`'s and `noisy-output.json`'s raw `.result` content — both genuinely contain `VERDICT: request-changes` (first line / fenced-tail-after-prose respectively), confirming the test isn't asserting against a value it never actually saw | pass |
| AC-2 | Same file, L50-139, 8 real negative controls | Re-ran tests; independently inspected every fixture: `timeout-sigterm.json` has no `.result` field (confirmed via `cat`), `context-overflow.ndjson`/`timeout-sigterm-partial.ndjson` have zero `type:"text"` events (`grep -o` confirms only `step_start`/`error` types), `no-verdict.ndjson` has exactly 2 `text` events totaling well over 400 reconstructed chars (grep count = 2, quoted text length ≈642 raw chars before concatenation) — matches the test's `.length > 400` assertion and the corrected characterization | pass |
| AC-3 | L142-148, `decoy-then-genuine.txt` | Read the fixture byte-for-byte: line 1 = `VERDICT: comment` (decoy), 60 filler lines, line 62 = `VERDICT: approve` (genuine). File is 62 lines / 7714 chars, comfortably clearing the mandatory ≥55-line/≥2200-char dual bound. Computed the tail window myself: `TAIL_LINES=30` selects lines 33-62 (excludes line 1 entirely); `TAIL_CHARS=2000` slices the last 2000 raw chars, which — given line 1 sits ~7696 chars from EOF — also excludes the decoy by a wide margin. Both windows agree the decoy is outside; `collectDistinctVerdicts` sees only `approve`. Test asserts `"approve"`, not `"comment"`, not `null` — all three assertions present | pass |
| AC-4 | L150-153, `contradiction.txt` | Read the fixture: 5 lines, `VERDICT: approve` ... `VERDICT: request-changes`, both well inside any tail window (file is 96 bytes total, under both thresholds so the window is the whole file). Two distinct values → `Set.size === 2` → `null`. Test confirms | pass |
| AC-5 | L155-164, `ansi-wrapped-verdict.txt` | `od -c` / `od -A x -t x1z` independently re-run on the fixture: confirmed three literal `0x1b` (octal `033`) ESC bytes at the three SGR-sequence positions (`\x1b[1m`, `\x1b[32m`, `\x1b[0m`), 29 bytes total, no trailing newline. Test carries both required assertions in one `it`: stripped result is `"approve"`, and a control regex applied to the untouched raw string fails to match — proving stripping is what made the difference, not an accidental match | pass |
| AC-6 | L168-174, inline strings | Re-ran; `"verdict: approve"` and `"Verdict: Approve"` both resolve `null` against the exact regex `^VERDICT:\s*(approve\|request-changes\|comment)$` | pass |
| AC-7 | L178-184, inline strings | `"VERDICT : approve"` (space before colon) and `"VERDICT-approve"` both fail the anchored regex, resolve `null` | pass |
| AC-8 | L188-191, inline fenced string | Marker as sole line inside a bare ` ``` ` fence resolves `"approve"` — proves no special-casing needed, matching design.md's stated rationale | pass |
| AC-9 | L195-198, inline string | Two identical `VERDICT: approve` lines → `Set.size === 1` → `"approve"`, not `null`. Distinct from AC-4's contradiction test — AC-9 uses one repeated value, AC-4 uses two genuinely different values; not a duplicate | pass |
| AC-10 | L202-218, inline strings | `""` → `null`; a >2000-char marker-free string → `null`. Both wrapped in `not.toThrow()` | pass |
| AC-11 | spec.md L88-90, "Persistence deferral" | Read the paragraph directly: it is copy-ready prose naming the blocking story `E5.F2.H1` explicitly and states no placeholder code was written. This review confirms the text exists and is usable — the manual "copy onto issue #27's checklist" step is correctly scoped as a PR-open action, outside this review's remit per the task brief | pass |
| AC-12 | `git diff origin/main...HEAD -- src/core/run/run-review.ts src/core/run/index.ts src/core/run/verdict.ts` | Ran the diff myself: all three hunks are strictly inside `/** ... */` comments or a `//` line — the `deps.parseVerdict ?? extractBuiltInVerdict` line, the `Verdict`/`VerdictParser` type declarations, and `index.ts`'s export list are byte-identical to `origin/main` | pass |
| AC-13 | `builtin-verdict-extraction.ts` (not exported), test L235-243 (mechanical), independent grep | Ran `grep -E "extractBuiltInVerdict\|computeTailWindow\|stripAnsiSgr\|collectDistinctVerdicts" src/core/run/index.ts` myself — exit 1, no match. Test independently asserts `Object.keys(runIndex)` excludes all four names | pass |
| AC-14 | `npm run check` (depcruise) | Re-ran myself: 56 modules / 104 dependencies, 0 violations — no new cross-module import (only pre-existing `Verdict` type import from `./verdict.js`) | pass |
| AC-15 | `git diff --stat origin/main...HEAD -- src/ fixtures/` | Ran myself: 10 files, exactly the allowed list, nothing extra | pass |
| AC-16 | Full gate | Re-ran both commands myself (not trusted from execution-log.md): `npm run check` green, `npm test` 225/225, 0 failures, 16 test files | pass |

**16/16 verified.**

## Binding obligations (`d-design-open-questions`, `d-st1-evidence-obligation`)

1. **Tail-window tie-break documented as "provably immaterial," not "conservative."** CONFIRMED. Source doc-comment (`builtin-verdict-extraction.ts` L32-39) states the suffix argument in full ("both candidates are suffixes of the same raw string ... two suffixes of one string with equal length are necessarily identical in content. There is no input for which the tie-break's direction changes the result.") — this correctly supersedes design.md's original "keep it because it's the more conservative choice" framing, which state.yaml's `d-design-open-questions` (1) explicitly identified as a false premise and ordered corrected. **PASS.**
2. **Defensive non-string guard has a test using an explicit cast.** CONFIRMED. `builtin-verdict-extraction.test.ts` L221-233, `describe("defensive non-string-input coercion ...")`, uses `extractBuiltInVerdict(123 as unknown as string)` — an explicit cast past the type signature, exercising the coercion branch rather than leaving it untested. **PASS.**
3. **AC-13 has a mechanical test, not just manual inspection.** CONFIRMED. `builtin-verdict-extraction.test.ts` L235-243 imports `../index.js` as a namespace and asserts `Object.keys(runIndex)` excludes all four internal names (`extractBuiltInVerdict`, `computeTailWindow`, `stripAnsiSgr`, `collectDistinctVerdicts`) — a genuine positive-space mechanical assertion, not a comment or a manual note. **PASS.**

**All three obligations: PASS.**

## Contract fidelity

- **Pipeline order.** Confirmed against `extractBuiltInVerdict`'s actual body (L91-98): `computeTailWindow(raw)` runs on the raw unstripped string first, then `stripAnsiSgr(window)` strips only the already-windowed slice, then `collectDistinctVerdicts(stripped)` matches. This is the exact order spec.md and design.md pin — windowing before stripping, so ANSI bytes count toward the 2000-char tail budget (design.md's documented, deliberately-not-fixed consequence). No reordering found.
- **Contradiction rule scoped to the tail window.** Confirmed: `collectDistinctVerdicts` receives `stripped` (the windowed-then-stripped text), not `raw`. The `Set` size-based decision (0/1/>1 → null/value/null) is unchanged from H1 in logic, correctly now operating over a bounded window instead of the whole output.
- **Case-sensitive exact matching, no fuzzy/fold-casing.** `VERDICT_LINE` regex (`^VERDICT:\s*(approve|request-changes|comment)$`) is unchanged from H1, module-level, used only inside `collectDistinctVerdicts`. AC-6/AC-7 tests confirm no folding, no space-before-colon tolerance, no hyphen tolerance.

No deviation found between spec.md's six rules and the shipped implementation.

## Test-quality findings

- No vacuous-pass risk found in any of the 25 tests. Specifically checked the four highest-risk cases called out in the task brief:
  - **AC-2's `opencode/no-verdict.ndjson` test** (L97-105) uses the corrected characterization: asserts `output.length > 400` (real prose, not empty), matching the spec-revalidation fix recorded in `state.yaml`. Independently confirmed the fixture really has 2 `text` events with substantial content, not zero.
  - **AC-5's test** (L155-164) carries both required assertions — stripped-matches and raw-does-not-match — in the same `it` block, not split across two tests where one could pass without the other.
  - **AC-9's repeated-value test** (`"VERDICT: approve"` twice) is structurally distinct from AC-4's contradiction test (`"VERDICT: approve"` then `"VERDICT: request-changes"`, two DIFFERENT values) — not a disguised duplicate of the same property.
  - **AC-3's test** asserts three things (`toBe("approve")`, `not.toBe("comment")`, `not.toBeNull()`), closing the gap where a parser that returned neither the decoy nor the genuine value (e.g., a bug returning `null`) could otherwise slip past a single positive assertion.
- No test imports production internals directly (all 25 tests exercise `extractBuiltInVerdict` only through its public signature), consistent with design.md's stated rationale that every helper's behavior is fully observable through the return value.

## Scope-fidelity findings

- `runReview`'s executable code: untouched (confirmed via diff — `run-review.ts`'s only hunk is a doc-comment).
- The `deps.parseVerdict ?? extractBuiltInVerdict` wiring line: byte-identical to `origin/main` (confirmed by direct diff inspection — the line does not appear in any hunk).
- `Verdict` / `VerdictParser` type contracts (`verdict.ts`): unchanged; only the `VerdictParser` doc-comment was reworded (tense only).
- `extractBuiltInVerdict` still not exported from `index.ts`: confirmed by grep and by the new mechanical test (AC-13, above).
- No file outside spec.md's allowed-diff list appears in `git diff --stat origin/main...HEAD -- src/ fixtures/`.

**No scope leak found.**

## Risk closeout audit

`state.yaml`'s four `open_risks` entries are all still listed without an explicit `resolved` marker, but each is substantively addressed by this change's shipped behavior:

- `r-verdict-provenance` (medium) — addressed: rule 1 (tail-window scan, `computeTailWindow`) is exactly the provenance policy this risk called for; AC-3 is the mandatory proof it actually works.
- `r-normalization-vs-injection` (medium) — addressed: spec.md's rule 6 rationale states the injection-surface trade-off explicitly per rule (no fuzzy matching, "zero corpus justification" for folding); each of the six rules in Expected Behavior carries its own justification, not a blanket normalization pass.
- `r-parse-rate-criterion` (low) — addressed: AC-1 pins the denominator as 4/4 real marker-bearing fixtures exactly, resolving the ambiguity the risk flagged.
- `r-contradiction-semantics` (low) — addressed: AC-9 (repeated collapse) and AC-4 (distinct-value fail-closed) together answer the "does position/context break a tie" question the risk raised — position does not matter, only distinctness of value does.

**Finding (MINOR, bookkeeping only):** none of these four `open_risks` entries in `state.yaml` carry a `resolved`/`closed` field or cross-reference to the AC that closes them, even though the substance is fully proven. This does not block completion — the implementation genuinely closes all four — but the state.yaml risk ledger is stale relative to the change's own evidence. Recommend closing them explicitly (with AC cross-references) as part of marking the change completed, or in a fast follow-up before the next change reads this ledger.

**Risk audit: all four closeout claims are substantively supported by the implementation; one bookkeeping gap noted (MINOR, non-blocking).**

## Language / consistency

- All persisted content in the diff (comments, test names, fixture prose, README section) is English. No Spanish found anywhere in `src/`, `fixtures/`, or the sdd-lite artifacts for this change.
- No `services/`/`utils/` folder introduced.
- No new domain error class was added by this change (confirmed: `builtin-verdict-extraction.ts` has no `throw`, no `Error` subclass; the parser is fail-closed-to-`null` by design, never throws) — so the "errors named per convention" check is vacuously true, as the task brief anticipated. Confirmed, not assumed.

## Findings

No BLOCKER or MAJOR findings.

1. **MINOR** — `state.yaml`'s `open_risks` section (`r-verdict-provenance`, `r-normalization-vs-injection`, `r-parse-rate-criterion`, `r-contradiction-semantics`) is not updated to reflect that this change resolves all four. Substance is proven; ledger bookkeeping is stale. Recommend closing with AC cross-references at completion time.

INFO count: 0 beyond the above.

## Verdict

**pass_with_notes**

Rationale for `pass_with_notes` rather than plain `pass`: the implementation, tests, and scope are fully verified and green with no functional gap — the sole finding is a documentation/bookkeeping gap in `state.yaml`'s risk ledger, not a defect in the shipped change. This does not block marking the change completed, but should be closed out (trivially) alongside completion.

## Next action

Mark `e4-f1-h2-verdict-parser` completed; close the four `open_risks` entries in `state.yaml` with AC cross-references (r-verdict-provenance → AC-3, r-normalization-vs-injection → spec.md rule rationale, r-parse-rate-criterion → AC-1, r-contradiction-semantics → AC-4/AC-9) as a small closeout edit; then open the story PR (`[E4.F1.H2]`, `Closes #27`) with the AC-11 persistence-deferral paragraph copied verbatim onto issue #27's checklist, per the workflow contract.
