# Proposal

## Routing Digest

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- digest_summary: Replace H1's deliberately naive built-in verdict extraction (`extractBuiltInVerdict`) with a defensive `VerdictParser` through the already-shipped `deps.parseVerdict` seam, owning both normalization (handling real engine output shapes) and provenance (where a marker is trustworthy enough to accept), because the two are one problem: every normalization rule that widens matching also widens what a diff-embedded marker can spoof.
- feasibility_signal: high — the seam, `Verdict`/`VerdictParser` types, and `runReview`'s `null → ambiguous` mapping are shipped and tested; the 12-fixture corpus from `[E1.F1.H3]` (#9) is on `main` and readable now. Residual risk is policy (how permissive, what counts as provenance-safe), not availability.
- scope_sketch_digest: IN = a pure `VerdictParser` implementation in `src/core/run/`, its normalization rules justified line-by-line against the real corpus, a provenance policy for marker placement, unit tests against all 12 fixtures. OUT = persistence of the ambiguous-run marker (deferred to `RunStore` / E5.F2.H1 per `d-persistence-ac-deferred`), any change to `runReview`'s public surface, any change to the `ReviewEngine` port or engine adapters (E4.F2.x).

## Summary

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (with open questions)
- exploration_performed: true

## Problem And Desired Outcome

`extractBuiltInVerdict` (`src/core/run/builtin-verdict-extraction.ts`) is deliberately naive by design: anchored, case-sensitive, single-line, zero normalization. Its own doc-comment names this story as its replacement. Run against the real 12-fixture corpus captured in `[E1.F1.H3]` (#9), it parses correctly on the two fixtures where the marker is a bare, unwrapped, first-line string (`valid-verdict.*`), and it silently fails on the two fixtures where the marker is real but the line does not stand alone in isolation the way the naive matcher expects: `noisy-output.*`, where `VERDICT: request-changes` is the last content line inside a ```` ```markdown ```` fence, after several paragraphs of prose. `trim()`-per-line still matches that exact line, so `extractBuiltInVerdict` actually already succeeds there too — the real gap is not that fixture, it is everything the naive matcher is _not_ built to reason about: whether a match found deep in noisy or attacker-influenced output should be trusted at all, and what to do with output that has no clean single-JSON-string shape to split into lines from in the first place (NDJSON event streams, a raw non-JSON log dump, absent-`result`-field error documents).

Desired outcome: one pure `VerdictParser` function, exercised against all 12 real fixtures, that (a) reliably resolves the 4 fixtures which genuinely contain a verdict to the correct value, (b) reliably resolves the other 8 to `null` (no false positives), and (c) ships with an explicit, written provenance policy for which part of the output a marker may be trusted from — because relaxing the naive matcher's anchoring to handle real engine noise is exactly what makes a diff-embedded `+VERDICT: approve` line easier for the model to echo back convincingly. Persistence of the resulting `ambiguous` mark (issue #27's third acceptance criterion) is out of reach here — no `RunStore` exists — and is explicitly deferred, not stubbed, per `d-persistence-ac-deferred`.

## Fixture Inventory

All 12 fixtures from `fixtures/claude-code/` and `fixtures/opencode/`, read in full. "Contains marker" means the reconstructed logical output text (`.result` for Claude Code JSON; concatenated `text`-event `part.text` for OpenCode NDJSON) contains at least one line matching `VERDICT: approve|request-changes|comment`.

| Fixture | Marker? | Textual form / wrapping | Expected outcome |
|---|---|---|---|
| `claude-code/valid-verdict.json` | Yes | Bare, unwrapped, **first** line of `.result`; findings follow below it. No fence, no ANSI. | `ok` / `request-changes` |
| `claude-code/noisy-output.json` | Yes | Inside a ```` ```markdown ```` fence, **last** content line, after ~5 paragraphs of prose preamble. No ANSI. | `ok` / `request-changes` |
| `claude-code/no-verdict.json` | No | Full prose review in `.result`, no `VERDICT:` line anywhere. | `ambiguous` |
| `claude-code/auth-error.json` | No | `is_error:true`; `.result` = one-line error string (`"Invalid API key · Fix external API key"`). | `ambiguous` (see open question 1 — this is arguably an engine-adapter concern, not the parser's) |
| `claude-code/context-overflow.json` | No | `is_error:true`; `.result` = one-paragraph "Prompt is too long…" message. | `ambiguous` (same caveat) |
| `claude-code/timeout-sigterm.json` | No | `is_error:true`, `terminal_reason:"aborted_streaming"`; **no `.result` field at all** — only an `errors` array. | `ambiguous`; parser must tolerate empty/absent output, not throw |
| `opencode/valid-verdict.ndjson` | Yes | NDJSON stream; one `type:"text"` event whose `part.text` starts with `VERDICT: request-changes` as its first line. No fence, no ANSI. | `ok` / `request-changes` |
| `opencode/noisy-output.ndjson` | Yes | One `type:"text"` event; inside a ```` ```markdown ```` fence, **last** content line, after 2 bullet points. No ANSI. | `ok` / `request-changes` |
| `opencode/no-verdict.ndjson` | No | **CORRECTED (spec-stage validation):** two `type:"text"` events with ~449 chars of real prose ("I'm checking the surrounding file…", "Findings: …calc.js:5-7…"), no `VERDICT:` line anywhere. This is a real-content-without-marker case, NOT an empty-output case. | `ambiguous`; reconstructed text is non-empty prose |
| `opencode/context-overflow.ndjson` | No | NDJSON `type:"error"` events (`ContextOverflowError`), no `text` events. | `ambiguous`; empty reconstructed text |
| `opencode/timeout-sigterm-partial.ndjson` | No | Single `step_start` line; file intentionally truncated mid-stream per `fixtures/README.md`. | `ambiguous`; empty/partial text, must not throw on truncation |
| `opencode/unknown-model-stdout.txt` | No | **Not JSON/NDJSON at all** — raw `pino`-style log dump with an `ERROR (#n): failed { … }` block and a JS stack trace. | `ambiguous`; parser must not false-positive on unstructured text |

**No fixture contains ANSI escape codes anywhere in the text the parser would see.** Confirmed by direct grep (`\x1b\[`) across all 12 files (zero matches) and by both engine spike write-ups: `docs/engines/claude-code.md` states JSON-format output has "no banner/progress/ANSI when not a TTY"; `docs/engines/opencode.md` states plain-text mode is "no ANSI — verified" and that ANSI only appears in progress noise / stderr, which the adapter does not forward into `engineResult.output`.

## Measurable Restatement Of "≥90% Parsed" (`r-parse-rate-criterion`)

The denominator is the fixtures that **contain** a verdict marker: **4 of 12** (`valid-verdict.*` × 2 engines, `noisy-output.*` × 2 engines). The other 8 must independently assert `ambiguous` with zero false positives — they are not part of the "parsed" percentage, they are the negative-control set.

The arithmetic collapses the criterion to something stricter than it sounds: with a denominator of 4, any result short of 4/4 (100%) is at most 3/4 = 75%, which fails a ≥90% bar. **Against this exact corpus, "≥90% parsed" is equivalent to "all 4 marker-bearing fixtures parse to the correct value, and all 8 marker-less fixtures parse to `null`."** The spec should state the criterion in exactly these terms rather than repeat the percentage, since the percentage is not meaningfully tunable at this corpus size.

## Normalization-vs-Injection Tension (`r-normalization-vs-injection`)

Rules the corpus actually demands, and what each one widens:

| Rule | Why the corpus demands it | What it widens |
|---|---|---|
| Markdown code-fence tolerance (marker line inside ` ``` ` is still matched) | `noisy-output.*` × 2 — the only marker is inside a fenced block | A marker an attacker gets the model to echo inside a fenced code example (e.g., quoting a diff hunk) becomes just as trustworthy as a genuine one |
| Non-first-line / whole-output scan (not anchored to line 1) | `noisy-output.*` — marker is the last content line after several paragraphs; `valid-verdict.*` — marker is the first line | Any position in the output becomes a candidate; a marker embedded early (e.g., while the model is quoting/discussing a diff line) is indistinguishable from one stated as a genuine conclusion, unless a positional policy is added (see Provenance Options) |
| Empty/absent-output tolerance (return `null`, never throw) | `timeout-sigterm.json` (no `.result` field), `no-verdict.ndjson` / `context-overflow.ndjson` (no `text` events) | Nothing — this is pure robustness, no matching surface added |
| Non-JSON plain-text tolerance | `unknown-model-stdout.txt` | Nothing — the parser already only sees a plain string (envelope unwrapping is the adapter's job, see below); this just confirms garbage input must not crash or false-match |

Rules the corpus does **not** demand and this proposal recommends **against** adding without a fixture to justify them:
- **ANSI stripping.** Zero fixtures need it (see inventory note above). PRD §4 line 240 lists it as defensive parsing "as fallback for plain text outputs," so recommend keeping a narrow, cheap ANSI-CSI-stripping pass anyway (it does not broaden what counts as a marker, only cleans bytes before matching) — but flag that no real fixture can validate it; a hand-written synthetic fixture would be needed, and it does not count toward the ≥90%/corpus figure above.
- **Case folding.** All 4 real markers use the exact literal casing `VERDICT:` and exact lowercase values. No fixture has a differently-cased marker. Recommend keeping the match case-sensitive — folding case is pure injection-surface growth with zero corpus justification.
- **Fuzzy/typo matching.** No fixture has a near-miss marker (e.g., `VERDICT :`, `Verdict:`). Recommend not adding it.
- **Envelope unwrapping (JSON `.result` extraction, NDJSON `text`-event concatenation, NDJSON truncated-line tolerance).** This is real corpus behavior, but it happens **before** `deps.parseVerdict` is called — `run-review.ts` passes `parse(engineResult.output)`, where `engineResult.output` is already a plain string produced by the `ReviewEngine` adapter (E4.F2.x, not built yet). The `VerdictParser` in this story receives and normalizes a plain string; it does not parse JSON or NDJSON itself. Worth stating explicitly in spec so the boundary is not re-litigated at design time.

## Provenance Options (`r-verdict-provenance`, `d-provenance-in-scope`)

Two mechanisms were named in the seeded decision. Both are sketched against the actual corpus:

**Option A — constrain extraction to the output tail.** Only scan the last *K* lines (or last *N* characters, whichever is larger, to stay generous) of the output for the marker, ignoring earlier lines entirely. This directly matches `noisy-output.*` (marker is the literal last content line) and, with a sufficiently generous window, also covers `valid-verdict.*` (whose entire output is short enough to fall inside almost any reasonable tail window even though the marker there sits at line 1, not the end). **Caveat: no fixture in the corpus pins an exact window size**, and no fixture demonstrates the adversarial case this option exists to defend against (a marker-shaped line quoted early in a long response, with the genuine verdict later). The window size is therefore a judgment call for spec, not something derivable from data — flagged as open question 2 below.

**Option B — a delimiter contract in the prompt template**, e.g. requiring the harness output contract to wrap the verdict in a sentinel token the model must reproduce exactly (`<<<SENTINEL_VERDICT>>>VERDICT: approve<<<END>>>`), checked in `src/core/review/assemble-prompt.ts`. **Checked and found infeasible for this story:** `assemblePrompt`'s `renderOutputContract` only renders whatever string lives in `resolvedHarness.harness.outputContract` — that string is harness content (`output.md` files), owned by E3, not code in `src/core/review/`. Adding a delimiter would mean either editing E3-owned harness content (a cross-module scope violation this story should not make unilaterally) or opening a coordinating E3 story. More decisively: **none of the 12 captured fixtures were produced under a delimiter contract** — all 4 marker-bearing fixtures use the plain `VERDICT: <value>` line the current harnesses already specify. Adopting a delimiter as the *primary* mechanism now would parse 0/4 of the real corpus and fail the ≥90% criterion outright. Recommend recording Option B as a deferred/rejected alternative for a future hardening story (paired with an E3 change), not pursued here.

**Recommendation: Option A** (generous tail window), explicitly documented as an approximation the real corpus cannot fully validate — it is silent on the adversarial case Option A exists to defend against. Recommend spec add one or two hand-written (non-E1) adversarial fixtures to pin this behavior, separate from the ≥90% real-corpus figure.

## Initial Scope Sketch

### Likely In Scope

- A `VerdictParser`-shaped pure function in `src/core/run/` (module-private or exported per spec's naming call) implementing: markdown-fence tolerance, tail-window-constrained scanning (provenance), the H1 conservative contradiction rule (more than one distinct value ⇒ `ambiguous`) unless spec revisits it, empty/absent-input tolerance, narrow ANSI-CSI stripping.
- Wiring as the default `deps.parseVerdict` where `runReview` is composed (in `src/main/`, once it exists) or left as an injectable seam for now, per spec.
- Unit tests under `src/core/run/__test__/` (vitest `core` project) against all 12 real fixtures plus any synthetic adversarial/ANSI fixtures spec adds, using the reconstructed-text form documented in the inventory above (this story does not re-derive JSON/NDJSON envelope parsing).
- An explicit deferral note (spec + issue #27) for the persistence acceptance criterion, naming `E5.F2.H1` as the blocker.

### Likely Out Of Scope / Non-Goals

- Any change to `runReview`'s public surface, its `null → ambiguous` mapping, or the `Verdict`/`VerdictParser` type contracts — all already shipped and frozen by H1.
- JSON/NDJSON envelope parsing, `.result` extraction, or NDJSON truncated-line handling — that is the `ReviewEngine` adapter's job (E4.F2.x), not this story's.
- Engine-failure classification (`is_error`, exit codes, `engine-error`/`timeout` terminal states) — those fixtures (`auth-error`, `context-overflow`, `timeout-sigterm*`) are used here only as defensive-robustness inputs to the parser (must return `null`, must not throw), not as evidence for adapter-level state mapping.
- Persistence of the ambiguous-run marker — deferred to `E5.F2.H1` (`RunStore`), per `d-persistence-ac-deferred`. Not stubbed.
- Any change to `assemblePrompt`, harness `output.md` content, or the `ReviewEngine` port (Option B is recorded as rejected/deferred, not built).
- A delimiter-based verdict contract of any kind in this change.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Seam availability | `deps.parseVerdict`, `Verdict`, `VerdictParser`, and the `null → ambiguous` mapping in `run-review.ts` are shipped, tested, and untouched by this story. | high |
| Oracle availability | All 12 real fixtures are on `main`, read in full, and the correct expected outcome for each is now written down (see inventory). | high |
| Architecture fit | A pure function in `src/core/run/`, no new port, no adapter, no composition. All five guards trivially satisfiable. | high |
| Scope boundary risk | Low structurally, medium on policy: the provenance window size and the contradiction-tie-breaking rule are judgment calls the corpus does not fully pin down. | medium |
| Corpus sufficiency for the security-relevant behavior | Low. Zero fixtures exercise the actual injection scenario (marker-shaped text quoted early, real verdict later) or a contradiction case. The ≥90% figure is fully satisfiable without ever testing the property H2 is supposed to harden. | low |

## Open Questions For Spec

1. **(A-level, recommend: include as defensive tests only)** Should the parser's test suite exercise the 6 fixtures with `is_error:true` / no-content NDJSON (`auth-error`, `context-overflow`, `timeout-sigterm*`, opencode `no-verdict`/`context-overflow`)? Recommendation: yes, as "must return `null`, must never throw" robustness assertions on the exact reconstructed text those fixtures represent — but explicitly not as evidence for `engine-error`/`timeout` state classification, which belongs to the future engine adapter.
2. **(B-level, no corpus ground truth)** What is the tail-window size for Option A (provenance constraint)? No fixture pins a number. Recommendation: a generous default (e.g., last ~30 lines or last ~2000 characters, whichever is larger) sized to include `valid-verdict.*` in full while still excluding a hypothetical much-earlier quoted line in a long response — needs explicit confirmation since it is a tunable security parameter, not a derived one.
3. **(B-level)** Contradiction semantics: keep H1's conservative "more than one distinct value anywhere ⇒ `ambiguous`," or something else now that the marker-search surface is wider? No fixture demonstrates a contradiction. Recommendation: keep H1's rule (fail closed) — it is the safer default and nothing in the corpus argues for changing it.
4. **(A-level, recommend: keep, low cost)** Keep narrow ANSI-CSI stripping per PRD §4 even though zero fixtures need it, since (a) it is explicitly required by the PRD as defensive parsing for plain-text fallback, and (b) it does not widen what counts as a marker, only cleans bytes beforehand. Must ship with a hand-written synthetic fixture, separate from the ≥90%-of-real-corpus figure.
5. **(B-level, recommend: reject/defer)** Confirm Option B (delimiter contract in the prompt template) is recorded as a deferred/rejected alternative rather than pursued now — it cannot parse any of the 4 real marker-bearing fixtures as currently captured and requires an E3-owned content change this story should not make unilaterally.
6. **(B-level, already decided upstream)** Restate the persistence-AC deferral in spec's acceptance criteria list, explicitly naming `E5.F2.H1` as the blocker and noting the same on issue #27 before the PR, per `d-persistence-ac-deferred`.

## Contradictions Found

- **PRD §4 (line 212) vs. real corpus.** The PRD's output contract states the machine-parsable `VERDICT:` line is required "at the top" of the response. The real captured corpus (`noisy-output.*`, both engines) places the only marker at the very **end** of a fenced block, after several paragraphs of prose — and `fixtures/README.md` labels this fixture a "defensive-parsing case," i.e. it is expected to parse successfully despite violating the documented "at the top" placement. Real model behavior does not honor the harness's positional instruction, and the test fixture written against that reality expects the parser to tolerate the violation. This is worth surfacing to spec explicitly rather than silently building a parser that ignores what the PRD says and matches what the fixture demands — the two are in tension and the PRD wording should probably be corrected (or clarified as aspirational, not enforced) in a follow-up, not silently overridden here.

## Approval Notes

- Scope is `[E4.F1.H2]` / issue #27 alone, building on the two scoping decisions already recorded in `state.yaml` (`d-provenance-in-scope`, `d-persistence-ac-deferred`) — this proposal does not reopen either.
- The most consequential open item for spec is question 2 (tail-window size): it is the one place where the ≥90%-satisfiable behavior and the actual security property H2 exists to deliver diverge, because the corpus that proves the former is silent on the latter.
- Recommended next stage: `sddl-spec`, which should fix the tail-window size (or an equivalent provenance rule), the contradiction rule, and the ANSI/synthetic-fixture policy as firm acceptance criteria, and restate the persistence deferral verbatim.
- The PRD "at the top" vs. corpus reality contradiction (above) should be flagged to the user; it does not block spec (the fixture's expectation is the one to build against, since it reflects real engine behavior), but the PRD wording is inaccurate and worth a documentation follow-up.

## Budget Notes

- Lite artifact, and per `d-lightweight-ceremony` this change runs deliberately lighter than H1 (~3 executor stages, no mid-execution 4R pre-scheduled). Sections above stay compact; the exact tail-window number, contradiction rule, and fixture list for `__test__/` belong to `sddl-design`/`sddl-spec`, not here.
