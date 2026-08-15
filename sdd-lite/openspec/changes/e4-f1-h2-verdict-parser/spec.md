# Spec

## Routing Digest

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- digest_summary: Replace the body of `extractBuiltInVerdict` (`src/core/run/builtin-verdict-extraction.ts`) with a defensive `VerdictParser` implementation — tail-window provenance, markdown-fence tolerance, whole-window scan, empty-input tolerance, narrow ANSI-CSI stripping, case-sensitive exact matching, fail-closed contradiction handling — validated against the 12 real E1 fixtures plus 3 hand-written synthetic fixtures, through the already-shipped `deps.parseVerdict` seam. No change to `runReview`'s executable code, the seam mechanism, or the `Verdict`/`VerdictParser` types.
- scope_digest: IN = the parser body inside `builtin-verdict-extraction.ts` (same file, same exported name), its normalization/provenance rule set, 3 synthetic fixtures under `fixtures/synthetic/`, unit tests in `src/core/run/__test__/` against all 15 fixtures (12 real + 3 synthetic), doc-comment updates in the 3 files that narrate H1→H2 handoff. OUT = `runReview`'s public surface or executable flow, the `Verdict`/`VerdictParser` type contracts, JSON/NDJSON envelope parsing, `assemblePrompt`/harness content, any persistence, the `ReviewEngine` port.
- acceptance_digest: 4/4 real marker-bearing fixtures resolve to `"request-changes"`; 8/8 real negative-control fixtures resolve to `null` with no throw; the decoy-then-genuine synthetic fixture resolves to the tail-positioned genuine value, not the early decoy; the contradiction synthetic fixture resolves to `null`; the ANSI-wrapped synthetic fixture resolves correctly after stripping; case-sensitivity and fuzzy-matching rejection each have a dedicated negative test; full gate (`npm run check && npm test`) green.

## Summary

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- spec_status: complete

Story `[E4.F1.H2]` / issue #27. This change replaces H1's deliberately naive built-in verdict extraction with the defensive parser it was always scoped to become, through the seam H1 already shipped. It is a pure-function change: no new port, no adapter, no composition, no touch to `runReview`'s control flow. Per `d-lightweight-ceremony`, this change runs the full canonical lite flow with deliberately lighter machinery than H1 (~3 executor stages, no mid-execution 4R pre-scheduled) — this spec is the one stage that keeps full rigor.

## Scope Boundary

### In Scope

- The parser's algorithm, replacing the current body of `extractBuiltInVerdict` in `src/core/run/builtin-verdict-extraction.ts` (file and exported name unchanged — see "File and naming decision" below).
- The six rules in Expected Behavior below: tail-window provenance, fence tolerance, whole-tail-window scan, empty/absent-input tolerance, narrow ANSI-CSI stripping, case-sensitive exact matching — plus the unchanged (inherited, not re-derived) H1 contradiction rule.
- Three hand-written synthetic fixtures under `fixtures/synthetic/` (new directory), specified exactly in "Synthetic fixtures" below, per `d-synthetic-adversarial-fixtures`.
- Unit tests in `src/core/run/__test__/` (vitest `core` project) exercising all 12 real fixtures (reconstructed text per the inventory table in proposal.md — JSON `.result`, NDJSON concatenated `text`-event `part.text`) and all 3 synthetic fixtures.
- Doc-comment updates (prose only, no behavioral change) in `builtin-verdict-extraction.ts`, `run-review.ts` (the `parseVerdict` field comment), `index.ts` (module doc), and `verdict.ts` (`VerdictParser` comment) — all four currently narrate "H1 ships naive, H2 replaces" in future tense; this change makes that past tense and drops the word "naive" where it no longer applies.
- The explicit persistence-AC deferral statement (below), copyable verbatim into issue #27's checklist.

### Out Of Scope

- Any change to `runReview`'s executable code, its `RunReviewRequest`/`Deps`/`Result` shapes, its terminal-state mapping, or the `deps.parseVerdict ?? extractBuiltInVerdict` seam wiring line itself (only its adjacent doc-comment changes).
- Any change to the `Verdict` or `VerdictParser` type contracts in `verdict.ts` — both are frozen by H1.
- JSON/NDJSON envelope parsing, `.result` extraction, NDJSON `text`-event concatenation, or truncated-line tolerance at the envelope level. The parser in this story receives and normalizes an already-reconstructed plain string; envelope unwrapping is the future `ReviewEngine` adapter's job (E4.F2.x).
- `assemblePrompt`, any harness `output.md` content, or the `ReviewEngine` port. Option B (prompt delimiter contract) is recorded rejected/deferred (see Risks And Trade-Offs), not built.
- Engine-failure classification (`is_error`, exit codes, `engine-error`/`timeout` state mapping). The `is_error`/truncated/no-content fixtures are used here purely as defensive-robustness inputs to the parser (must return `null`, must not throw) — not as evidence for adapter-level state classification.
- Persistence of the ambiguous-run marker (see "Persistence deferral" below).
- Exporting the parser from `src/core/run/index.ts`. It stays module-private, exactly as H1 fixed it (AC-16 there).

### File and naming decision

The parser body replaces the current implementation **inside `src/core/run/builtin-verdict-extraction.ts`**, keeping the exported function name `extractBuiltInVerdict` and its signature `(output: string) => Verdict | null`.

Rationale: `run-review.ts` imports and calls this function by name (`deps.parseVerdict ?? extractBuiltInVerdict`) — keeping the name and file means that line, and the import statement above it, do not change at all, which is the smallest possible diff footprint consistent with `d-lightweight-ceremony` and with the Out-Of-Scope line above ("no change to the seam wiring line itself"). "Built-in" remains an accurate description post-change: it is still the injectable default `runReview` falls back to when `deps.parseVerdict` is not supplied. Only the docstring's claim of "deliberately naive" becomes inaccurate and is corrected in prose (see doc-comment updates above), not by renaming the identifier. H1's AC-16 constraint (not exported from `index.ts`) is restated unchanged in Out Of Scope.

## Expected Behavior

### Parsing algorithm (six rules, each traceable to a proposal finding or a `state.yaml` decision)

1. **Provenance — tail-window scan only** (`d-tail-window-size`, `r-verdict-provenance`). The parser scans only the tail of the output: the **union** of the last 30 lines and the last 2000 characters, whichever span is **larger** — never the full output. Concretely: compute `tailByLines` = the last 30 lines joined back together, and `tailByChars` = the last 2000 characters of the raw string; the scanned window is whichever of the two is longer (by character count), since either one may extend further back than the other depending on average line length. This is an explicit judgment call, not derived from data (`d-tail-window-size` rationale) — no fixture pins an exact number; the decoy-then-genuine synthetic fixture is what actually validates the boundary it draws, not the real corpus.
2. **Fence tolerance.** A candidate line inside a markdown code fence (` ``` `) still matches — the parser does not special-case or strip fence delimiters; it simply does not require the marker line to be free of surrounding fence context. Demanded by `claude-code/noisy-output.json` and `opencode/noisy-output.ndjson` (marker is the last content line inside a ` ```markdown ` fence).
3. **Whole-tail-window scan.** Within the scanned window (rule 1), the marker may appear on any line — not anchored to the window's first or last line. Demanded jointly by `valid-verdict.*` (marker is the first line of a short output, which falls inside the window) and `noisy-output.*` (marker is the last content line, after prose).
4. **Empty/absent-input tolerance.** The parser never throws. Empty string, non-string/undefined-ish input coerced to a string, and unstructured non-JSON garbage text (e.g. a raw log dump) all resolve to `null` cleanly. Demanded by `timeout-sigterm.json` (no `.result` field at all — reconstructed text is empty), `no-verdict.ndjson` / `context-overflow.ndjson` (no `text` events — empty reconstructed text), `timeout-sigterm-partial.ndjson` (truncated mid-stream), and `unknown-model-stdout.txt` (not JSON/NDJSON at all).
5. **Narrow ANSI-CSI stripping.** Before matching, strip SGR (Select Graphic Rendition) escape sequences matching `\x1b\[[0-9;]*m` from the scanned window. "Narrow" means exactly this: only SGR color/style codes are stripped; no other CSI sequences (cursor movement, erase, etc.) are recognized or removed, and no general terminal emulation is attempted. Required defensively by PRD §4 even though **zero fixtures in the 12-file real corpus contain ANSI bytes** (confirmed by grep across all 12 files, per proposal.md) — validated exclusively by the ANSI-wrapped synthetic fixture.
6. **Case-sensitive, exact match; no fuzzy matching.** The marker regex is `^VERDICT:\s*(approve|request-changes|comment)$` applied to each trimmed candidate line inside the scanned window, unchanged from H1. Explicitly: no case folding (`verdict:`, `Verdict:` do not match), no fuzzy/typo tolerance (`VERDICT :` with a space before the colon, `VERDICT-approve`, or any near-miss do not match). Justification: all 4 real marker-bearing fixtures use the exact literal casing and spacing already; folding or fuzzying the match is pure injection-surface growth with zero corpus justification (proposal.md, Normalization-vs-Injection Tension table).

### Contradiction rule (inherited from H1, unchanged)

More than one **distinct** value found anywhere in the scanned tail window ⇒ `null` (fail-closed; `runReview` maps this to `ambiguous`). Repeated occurrences of the identical value collapse to that one value, not a contradiction. This rule is not re-derived here — H1 already fixed it, and no fixture (real or synthetic) argues for changing it (proposal.md open question 3) — but its scope now covers the whole tail window instead of the whole output, per rule 1 above, and the contradiction synthetic fixture (below) proves it still fires under the widened scan.

### Envelope boundary (restated, not re-derived)

The parser receives and normalizes an already-reconstructed plain string. It does not parse JSON or NDJSON, does not know about `.result` fields or `text` events, and does not attempt truncated-line repair. `run-review.ts` passes `parse(engineResult.output)` where `engineResult.output` is already produced by the `ReviewEngine` adapter (E4.F2.x, not built yet). This boundary is inherited from proposal.md and is not re-litigated here.

### Synthetic fixtures (`d-synthetic-adversarial-fixtures`)

Three new plain-text files under `fixtures/synthetic/` (new directory, sibling to `fixtures/claude-code/` and `fixtures/opencode/`). Unlike the real corpus, these are **not** JSON/NDJSON envelopes — they are the plain reconstructed text the parser receives directly, since these fixtures exist to pin parser behavior, not envelope-unwrapping behavior. They do **not** count toward the ≥90%/4-of-4 real-corpus figure (`r-parse-rate-criterion` stays defined against the 12 real fixtures alone) — they are the sole evidence for the provenance and contradiction properties the real corpus cannot exercise at all.

1. **`fixtures/synthetic/decoy-then-genuine.txt`** — proves the tail-window provenance rule resolves to the genuine, tail-positioned verdict and ignores an earlier decoy of the same marker shape.
   - Structure: line 1 is a standalone decoy line reading exactly `VERDICT: comment` (marker-shaped, but a value distinct from the genuine one), followed by at least 55 lines of filler prose (any content not matching the marker regex — e.g. a repeated placeholder sentence discussing unrelated implementation detail), followed by a final line reading exactly `VERDICT: approve`.
   - Sizing constraint: total length must place line 1 outside **both** the last-30-lines window and the last-2000-characters window, so the decoy is excluded from the scanned tail under rule 1's union regardless of average line length; the genuine line (last line) must fall inside both.
   - Expected outcome: `"approve"` (the genuine, tail-positioned value) — **not** `"comment"` (the decoy) and **not** `null`.

2. **`fixtures/synthetic/contradiction.txt`** — proves the contradiction rule still fires with the widened whole-tail-window scan.
   - Structure: a short output (well within any reasonable tail window) containing two standalone lines with **two distinct** verdict values, e.g. `VERDICT: approve` followed later (after a short prose transition, such as "Actually, reconsidering the edge case, I'll revise:") by `VERDICT: request-changes`. Both lines must fall inside the scanned tail window (keep the file short — well under 30 lines / 2000 chars total — so this is unambiguous).
   - Expected outcome: `null` (ambiguous — two distinct values present).

3. **`fixtures/synthetic/ansi-wrapped-verdict.txt`** — proves narrow SGR stripping (rule 5) still lets a wrapped marker match.
   - Structure: a marker line wrapped in ANSI SGR sequences, e.g. the literal bytes `\x1b[1m\x1b[32mVERDICT: approve\x1b[0m` as the sole content line (bold + green color codes around an otherwise-exact marker).
   - Expected outcome: `"approve"` after stripping; asserts the raw (unstripped) string would **not** match the marker regex directly, so the test also proves the stripping step actually runs.

### Persistence deferral (`d-persistence-ac-deferred`)

Issue #27's third acceptance criterion — "an `ambiguous` run is persisted with a marker" — is **not satisfiable in this change**. Persistence requires a `RunStore`, which is `E5.F2.H1` and does not exist yet; H1 already fixed that this flow writes no run anywhere. This is an explicit deferral, not a stub: no placeholder persistence code is written. The blocker is `E5.F2.H1`. This paragraph is intended to be copied verbatim into issue #27's checklist before the PR is opened, next to that acceptance criterion.

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | All 4 real marker-bearing fixtures resolve to `"request-changes"`: `claude-code/valid-verdict.json` (`.result`), `claude-code/noisy-output.json` (`.result`), `opencode/valid-verdict.ndjson` (concatenated `text` events), `opencode/noisy-output.ndjson` (concatenated `text` events) | unit tests in `src/core/run/__test__/`, one per fixture | must |
| AC-2 | All 8 real negative-control fixtures resolve to `null` and the parser never throws: `claude-code/no-verdict.json`, `claude-code/auth-error.json`, `claude-code/context-overflow.json`, `claude-code/timeout-sigterm.json`, `opencode/no-verdict.ndjson`, `opencode/context-overflow.ndjson`, `opencode/timeout-sigterm-partial.ndjson`, `opencode/unknown-model-stdout.txt` | unit tests, one per fixture, asserting `null` and no thrown error | must |
| AC-3 | `decoy-then-genuine.txt` resolves to `"approve"` (the tail-positioned genuine value), proving the provenance rule ignores the early decoy | unit test against the synthetic fixture | must |
| AC-4 | `contradiction.txt` resolves to `null`, proving the fail-closed contradiction rule still fires under the widened whole-window scan | unit test against the synthetic fixture | must |
| AC-5 | `ansi-wrapped-verdict.txt` resolves to `"approve"` after stripping; a control assertion shows the raw (unstripped) string does not match the bare marker regex | unit test against the synthetic fixture, both assertions | must |
| AC-6 | Case sensitivity: a hand-constructed input with lower/mixed-cased marker text (`verdict: approve`, `Verdict: Approve`) resolves to `null` | unit test with an inline string, not a fixture file | must |
| AC-7 | Fuzzy/typo matching is rejected: a hand-constructed near-miss (`VERDICT : approve` with a space before the colon, `VERDICT-approve`) resolves to `null` | unit test with an inline string | must |
| AC-8 | Fence tolerance is independently pinned with a minimal hand-constructed fenced string (marker as the sole line inside ` ``` ` fences), beyond what the real fixtures already demonstrate | unit test with an inline string | should |
| AC-9 | Repeated identical values collapse to one verdict, not a contradiction: a hand-constructed input with two identical `VERDICT: approve` lines resolves to `"approve"` | unit test with an inline string | should |
| AC-10 | Empty/absent-input tolerance beyond the fixtures: parser called with `""` and with a long non-JSON string containing no marker-shaped line resolves to `null`, never throws | unit test with inline inputs | must |
| AC-11 | The persistence deferral statement is present in this spec verbatim-copyable form and is noted on issue #27's checklist before the PR is opened | manual check at PR time | must |
| AC-12 | No change to `runReview`'s executable code, the `deps.parseVerdict ?? extractBuiltInVerdict` line, or the `Verdict`/`VerdictParser` type contracts — only doc-comment prose changes in the four named files | `git diff` on `run-review.ts` and `verdict.ts` shows comment-only hunks | must |
| AC-13 | `extractBuiltInVerdict` is still **not** exported from `src/core/run/index.ts` (H1's AC-16, restated) | source inspection + `npm run check` | must |
| AC-14 | Architecture guards hold: no import from `src/adapters/`, `src/main/`, or any I/O library other than the zod whitelist; no new cross-module import | `npm run check` (depcruise) | must |
| AC-15 | No scope leak: the diff touches only `src/core/run/builtin-verdict-extraction.ts`, doc-comments in `run-review.ts`/`index.ts`/`verdict.ts`, `fixtures/synthetic/**`, and `src/core/run/__test__/**` | `git diff --stat` | must |
| AC-16 | `npm run check` and `npm test` both green; every pre-existing test still passes | local run before PR | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| The ≥90% real-corpus criterion is satisfiable without exercising the actual injection scenario H2 exists to defend against | medium | Mitigated structurally: AC-3/AC-4 make the two synthetic fixtures mandatory, not optional, and they are the only evidence for the provenance/contradiction properties — the real corpus is silent on both (proposal.md, Feasibility Signal table). |
| Tail-window sizing (30 lines / 2000 chars, union) is a judgment call, not derived from data | medium | Explicitly flagged as such per `d-tail-window-size`; the decoy-then-genuine fixture pins the boundary this number draws. Revisit if a future real fixture demonstrates a marker legitimately placed outside this window. |
| Option B (prompt delimiter contract) is rejected/deferred rather than built | low | Checked against `assemble-prompt.ts` in the proposal: infeasible here (E3-owned harness content) and parses 0/4 real fixtures as currently captured. Recorded as a future hardening story paired with an E3 change, not pursued in this change. |
| ANSI stripping and the ANSI synthetic fixture validate a defensive path no real fixture exercises | low | Required by PRD §4 regardless; the synthetic fixture is the only test coverage for it and is treated as first-class (AC-5, must), not optional. |
| `d-lightweight-ceremony` skips a mid-execution full-4R review | low | Justified in `state.yaml`: the corpus is the oracle for a pure function, and H1's own expensive four-lens review missed the defect its PR's automated reviewer caught. `sddl-code-review`/`sddl-judgment-day` still run at the change's normal gate; only the mid-execution pre-schedule is skipped, and it is explicitly revisited if the executor reports a structural surprise. |

## Open Questions And Decisions

All open questions from proposal.md were resolved before this spec (see `state.yaml` decisions `d-provenance-in-scope`, `d-persistence-ac-deferred`, `d-synthetic-adversarial-fixtures`, `d-tail-window-size`, `d-lightweight-ceremony`) and are restated as firm rules above, not reopened. No open questions carried forward to design.

## Approval Notes

- **PRD §4 "verdict at the top" vs. corpus reality (informational, non-blocking).** PRD §4 (line 212) states the machine-parsable `VERDICT:` line is required "at the top" of the response. The real captured corpus (`noisy-output.*`, both engines) places the only marker at the very end of a fenced block, after several paragraphs of prose, and `fixtures/README.md` labels this a "defensive-parsing case" — i.e. expected to succeed despite violating the documented placement. This spec builds against fixture reality (rule 3, whole-tail-window scan), since that is what real engine behavior demands and what the fixture corpus expects. Flagged to the user; recommend a PRD wording follow-up (correct or mark aspirational) in a separate documentation change — not addressed here.
- Both prior scoping decisions (`d-provenance-in-scope`, `d-persistence-ac-deferred`) are upheld unchanged; this spec does not reopen either.
- No PRD conflict beyond the one flagged above. The five terminal states, the `null → ambiguous` mapping, and the `Verdict` glossary values (PRD §9) all match what this spec builds against.
- Recommended next stage: `sddl-design`, to fix the internal function decomposition (helper boundaries for the tail-window computation, ANSI stripping, and matching) and the exact test-file layout under `src/core/run/__test__/`.

## Budget Notes

- Per `d-lightweight-ceremony`, this change targets ~3 executor stages against one file's implementation plus one new fixture directory and its tests — smaller in surface than H1 despite a comparably detailed spec. This spec itself is not abbreviated (per the same decision, spec keeps full rigor while later stages run lighter); length reflects the six-rule algorithm, three fully-specified synthetic fixtures, and the 16-item acceptance table needed to keep "≥90% parsed" from silently regressing into an unverified proxy for the injection property this story exists to hardened against.
