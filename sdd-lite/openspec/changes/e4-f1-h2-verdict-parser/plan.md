# Plan

## Execution Digest

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- digest_summary: Three sequential executor stages, per `d-lightweight-ceremony`. ST-1 swaps the parser body in place (the risky stage — it replaces the implementation behind an existing caller, `run-review.ts`, and its 200 existing passing tests, with no new tests of its own yet to prove the new rules). ST-2 builds and mechanically size-checks the three synthetic fixtures plus the README provenance note — inert, touches no code, cannot regress anything. ST-3 writes the fixture-reconstruction loader and the full 16-AC test file, carrying the six open obligations recorded in `state.yaml` (`d-design-open-questions`) and the three spec-revalidation traps forward explicitly.
- stage_plan_digest: ST-1 parser body + doc comments (four files) · ST-2 synthetic fixtures + README note (fixtures-only, no code) · ST-3 fixture loader + full AC test suite + full gate.
- validation_digest: measured baseline `npm test` = **200/200 passing, 15 test files** (run before this plan was written). ST-1 exits on `npm run check` green and `npm test` still 200/200 (no new tests — the existing suite is the only regression net at this stage, and it is expected to pass unchanged because its verdict-bearing fixtures are short strings that fall entirely inside the new tail window with no ANSI bytes). ST-2 exits on `npm run check`/`npm test` unchanged at 200/200 (fixtures and README are inert until ST-3 reads them) plus the mandatory shell size checks (`wc -l`, `wc -c`, a tail-offset check, and a byte-level ANSI check). ST-3 exits on `npx vitest run --project core -t "extractBuiltInVerdict"` green, then the full gate: `npm run check && npm test` at 200 existing + ~24 new (≈224 total), `git diff --stat` scope check, and the AC-13 mechanical export assertion passing as part of the suite itself.

## Summary

- change_name: e4-f1-h2-verdict-parser
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

`design.md` already fixes every file's content — three file-private helpers, the pinned pipeline order, the test layout, the fixture-loader contract, and the AC→test mapping. This plan fixes only the order, the per-stage exit check, and the traps that would let a stage report green while proving nothing.

**Why three stages, and why this order (not design.md's plausible ordering of implementation → fixtures → tests, but close to it, reordered for regression safety):** this change is not building leaf files with no importers (H1's ST-1/ST-2 pattern) — it is replacing the body of `extractBuiltInVerdict`, which `run-review.ts` already imports and calls, and which `run-review.test.ts` already exercises indirectly through short fixture strings like `"Looks solid.\nVERDICT: approve\n"`. That means:

- An implementation-first stage (ST-1) is not merely "safe to land in isolation" the way H1's leaves were — it is **actively validated** by the 200 pre-existing tests, because every existing verdict-bearing fixture in `run-review.test.ts` is a short, ANSI-free, case-correct string that falls entirely inside the new tail window under the new algorithm too. If ST-1 breaks something, the *existing* suite already catches it, without waiting for ST-3's new tests. This is the closest this change gets to H1's "leaf files land green in isolation" property, and it is the reason ST-1 goes first rather than last.
- A fixtures-only stage (ST-2) is fully inert with respect to the tree's test/typecheck state — nothing imports `fixtures/synthetic/**` yet — so it can be sequenced anywhere without risk. It is placed second (not first) so that if ST-1 surfaces a structural surprise in the parser body, the fixture construction (which encodes exact size-bound arithmetic from spec.md) is not wasted work built against a possibly-wrong algorithm.
- ST-3 necessarily goes last: it is the only stage that imports both ST-1's implementation and ST-2's fixtures, and it is where all 16 ACs actually become provable.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Replace `extractBuiltInVerdict`'s body with the three-helper defensive parser (tail-window computation, narrow SGR stripping, distinct-verdict collection) in the pinned pipeline order; update the four H1→H2 doc comments to past tense | — | `src/core/run/builtin-verdict-extraction.ts` (body replaced, export name/signature unchanged), `src/core/run/run-review.ts` (doc-comment on the `parseVerdict` field only), `src/core/run/index.ts` (module doc-comment only), `src/core/run/verdict.ts` (`VerdictParser` doc-comment only) | `npm run check`; `npm test` still 200/200 (no new tests this stage — the pre-existing suite is the regression net, per the ordering rationale above). Partial AC-12 (git diff shows comment-only hunks in the three non-parser files), partial AC-13 (source inspection: still absent from `index.ts`'s export list), partial AC-14 (depcruise clean, no new import beyond the existing `Verdict` type import) | yes | yes | pending |
| ST-2 | Build the three synthetic fixtures under `fixtures/synthetic/` and append the provenance note to `fixtures/README.md` | ST-1 (sequenced after for the reason above; not a true dependency — see Dependencies And Sequencing) | `fixtures/synthetic/decoy-then-genuine.txt` (new), `fixtures/synthetic/contradiction.txt` (new), `fixtures/synthetic/ansi-wrapped-verdict.txt` (new), `fixtures/README.md` (append-only provenance section) | `npm run check`; `npm test` still 200/200 (fixtures are inert — nothing imports them yet). Mandatory shell checks (see "Traps" below) must be run and their output recorded, not assumed | no | yes | pending |
| ST-3 | Write the fixture-reconstruction loader and the full 16-AC test file; run the full gate | ST-1, ST-2 | `src/core/run/__test__/verdict-fixture-loader.ts` (new), `src/core/run/__test__/builtin-verdict-extraction.test.ts` (new) — all 16 ACs | `npx vitest run --project core -t "extractBuiltInVerdict"` first (fast loop), then `npm run check && npm test` full green (200 existing + ~24 new ≈ 224, exact number recorded in `execution-log.md`, not assumed), then `git diff --stat` (AC-15) | yes | yes | pending |

## Traps That Make A Green Test Worthless

Carried forward verbatim from the spec-revalidation round (`state.yaml`, `sddl-spec` notes — 3 MAJOR findings, all confirmed against source before being fixed). Each is a way this change's *own* history already went wrong once; the executor must actively check these, not assume the plan already prevents them:

1. **The `decoy-then-genuine.txt` dual size bound is two independent conditions, not one.** The fixture must satisfy **both** ≥55 lines **and** ≥2200 characters. If an executor honors only the line count with short filler lines, the file falls under 2000 total characters, the last-2000-characters window degenerates to *the entire file*, wins the union in `computeTailWindow`, readmits the early decoy (`VERDICT: comment`) into the scanned window, trips the fail-closed contradiction rule, and the fixture resolves to `null` — **failing AC-3 instead of passing it**, silently, with a test that still runs and reports a result. ST-2's exit criteria must include running, and recording the output of:
   ```
   wc -l fixtures/synthetic/decoy-then-genuine.txt   # must be > 56
   wc -c fixtures/synthetic/decoy-then-genuine.txt   # must be > 2250
   tail -c 2000 fixtures/synthetic/decoy-then-genuine.txt | grep -c "VERDICT: comment"   # must be 0
   ```
   Do not treat design.md's "60 filler lines × 131 chars" arithmetic as a substitute for running these — it is a construction target, the `wc`/`tail` output is the proof.
2. **`opencode/no-verdict.ndjson` has real prose content, not empty text.** It contains two `text` events totaling ~449 characters of genuine review prose with no marker line — this was the spec-stage's own MAJOR factual correction (the original proposal.md inventory wrongly called it empty, and the error had already propagated into a draft of rule 4 before being caught). A test asserting this fixture resolves to `null` because "there's no text to parse" is testing the wrong property — it must resolve to `null` because the parser correctly finds *no marker in real content*, which is the more valuable and different guarantee (rule 4's second sub-case, spec.md). ST-3's `verdict-fixture-loader.ts` must reconstruct this fixture's actual concatenated `text`-event content (not treat it as empty), and the corresponding `it` block in the "negative controls" describe group should be written to reflect that it is a non-trivial real-content case, not a trivially-empty one — the AC-2 assertion (`null`, no throw) is unchanged, but a comment or test name implying "empty input" here would misdescribe what is actually being proven.
3. **The ANSI fixture must be built with literal ESC bytes via `printf`, not by hand-typing control characters into an editor.** Design.md is explicit: `printf '\033[1m\033[32mVERDICT: approve\033[0m' > fixtures/synthetic/ansi-wrapped-verdict.txt`, no trailing newline. A hand-typed or copy-pasted control character risks the editor normalizing or mis-encoding the byte, silently producing a fixture that either already matches the bare marker regex (defeating the point of the test) or never matches even after stripping (a false failure unrelated to the parser). AC-5 requires **both** assertions in the same `it`: `extractBuiltInVerdict(raw)` resolves to `"approve"` (stripping happened), **and** a direct regex check against the raw, unstripped string shows no match (proving the stripping step is what made the difference — without this second assertion, a fixture that happened to match some other way would still pass, proving nothing about SGR stripping specifically).

## AC Ownership (16/16 assigned, no orphans)

| AC | Owning Stage | Notes |
|---|---|---|
| AC-1 | ST-3 | 4 `it`s against real marker-bearing fixtures via the loader built in this stage |
| AC-2 | ST-3 | 8 `it`s against real negative-control fixtures — trap 2 above applies to the `opencode/no-verdict.ndjson` case |
| AC-3 | ST-3 (fixture built in ST-2) | trap 1 above governs whether the fixture is even buildable correctly |
| AC-4 | ST-3 (fixture built in ST-2) | short, hand-written, no size-bound risk |
| AC-5 | ST-3 (fixture built in ST-2) | trap 3 above; both assertions mandatory |
| AC-6 | ST-3 | 2 inline-string `it`s, no fixture dependency |
| AC-7 | ST-3 | 2 inline-string `it`s |
| AC-8 | ST-3 | 1 inline-string `it` |
| AC-9 | ST-3 | 1 inline-string `it` (repeated-identical-value collapse) |
| AC-10 | ST-3 | 2 inline `it`s (`""` and a long marker-less string); also where the `d-design-open-questions` cast-based defensive-guard test lands, as the same "never throws on defensive input" family |
| AC-11 | ST-3 (process step, not code) | persistence deferral paragraph copied verbatim onto issue #27's checklist at PR-open; recorded in `execution-log.md`, not itself a unit test |
| AC-12 | ST-1 (opened), reconfirmed ST-3 | `git diff` on `run-review.ts`/`index.ts`/`verdict.ts` shows comment-only hunks — checkable as soon as ST-1 lands, reconfirmed unchanged at the ST-3 full-gate `git diff --stat` |
| AC-13 | ST-1 (source inspection) + ST-3 (mechanical test) | `d-design-open-questions` obligation (c): ST-3 adds the mechanical assertion — import the module namespace from `../index.js`, assert `Object.keys()` does not contain `"extractBuiltInVerdict"` — upgrading this from manual inspection to an enforced test |
| AC-14 | ST-1 (opened), reconfirmed ST-3 | `npm run check` / `depcruise src` — no new import beyond the existing `Verdict` type import; reconfirmed at the final gate |
| AC-15 | ST-3 | `git diff --stat` at the end of ST-3 — the only point where the whole diff (ST-1 + ST-2 + ST-3 files) is assembled |
| AC-16 | ST-3 | Full gate: `npm run check && npm test`, 200 existing tests still passing plus all new ones |

## `d-design-open-questions` Obligations Carried Into Stages (do not re-derive)

Per `state.yaml`, three A-level resolutions bind the executor and must not be re-litigated or silently reinterpreted:

- **(a) Tail-window tie-break is provably immaterial, not a conservative default.** `computeTailWindow`'s `tailByChars.length > tailByLines.length` comparison means `tailByLines` wins ties — but both candidates are suffixes of the same raw string (`split`/`join` on `"\n"` round-trips exactly; `slice(-N)` is a suffix by construction), and two equal-length suffixes of one string are necessarily identical in content. ST-1's doc-comment on `computeTailWindow` must state this as a proven fact ("the tie-break cannot affect output, because..."), not phrase it as "the safer choice" or similar language implying an unresolved risk.
- **(b) The defensive non-string guard stays, and owes a test using an explicit cast.** ST-1 keeps the one-line coercion (`typeof output === "string" ? output : String(output ?? "")`) at the top of `extractBuiltInVerdict`. ST-3 must add a test that exercises this branch specifically — calling the function with a non-string value via an explicit cast (e.g. `extractBuiltInVerdict(42 as unknown as string)` or an equivalent cast past the type signature) — so the branch is not left untested. This is additional to, not a replacement for, AC-10's `""`/long-string cases.
- **(c) AC-13 is mechanical, not manual.** Already reflected in the AC ownership table above; restated here because it is easy to under-scope as "just check the export list by eye."

## Validation Strategy

- **Per stage.** ST-1 is the only pre-test-suite stage and its exit condition is unusually strong for a "no new tests" stage: the pre-existing 200-test suite is expected to pass **unchanged**, and it is a real regression signal (not a rubber stamp) because `run-review.test.ts`'s verdict-bearing fixtures are short, ANSI-free, exactly-cased strings that exercise the new algorithm's happy path even though they were written against the old naive one. ST-2 has no test-suite signal at all (fixtures are inert) — its proof is the shell checks in the Traps section, run and recorded, not assumed. ST-3 is the only stage with new test coverage and is where the full gate runs.
- **Fast loop inside ST-3.** `npx vitest run --project core -t "extractBuiltInVerdict"` while iterating; the full `npm run check && npm test` gate only once that passes.
- **Cross-boundary note (inherited convention, restated for this change).** `.dependency-cruiser.cjs` excludes `__test__/` paths from `depcruise src`, so `verdict-fixture-loader.ts`'s `node:fs`/`node:url` imports are sanctioned test-only scaffolding, not a violation of `core-no-io-libs` — that guard applies to `src/core/**` production code, not to files under `__test__/`. Do not "fix" this by trying to route file reads through a port.

## Dependencies And Sequencing

- ST-1 → ST-2 → ST-3 as written, but the ST-1 → ST-2 edge is a **sequencing choice, not a true dependency**: ST-1 touches only `builtin-verdict-extraction.ts` plus three doc-comment-only files, ST-2 touches only `fixtures/synthetic/**` and `fixtures/README.md`, and neither imports the other. They could be built in either order or even by two independent workers with disjoint write scopes. This plan sequences ST-1 first anyway, so that if the parser body needs to change after ST-1's regression run (200/200 must hold), the fixture-construction work in ST-2 — which encodes exact size-bound arithmetic — is not built against an algorithm that turned out to need revision.
- ST-3 has a true dependency on both: it imports the production function ST-1 produced and reads the fixture files ST-2 produced.
- Doc-comment updates are folded into ST-1 (not a separate stage) for the same reason `index.ts` was folded into H1's ST-3: the four files being corrected all narrate the same H1→H2 handoff this stage completes, so keeping the code change and its doc-comment correction in one reviewable unit avoids a window where the docs say "H2 not yet done" while H2's code has already landed.

### Executor notes (fix these once, avoid re-deriving them)

1. `builtin-verdict-extraction.ts` keeps its file-level `export function extractBuiltInVerdict` — only the body changes. The three new helpers (`computeTailWindow`, `stripAnsiSgr`, `collectDistinctVerdicts`) are file-private (no `export` keyword) — design.md confirmed no test needs to reach them directly.
2. Pipeline order is pinned, not reorderable: window computed on `raw` **before** ANSI stripping, per design.md's "Pipeline Order" section. Do not "fix" the fact that ANSI bytes count toward the 2000-character tail budget — that is documented, deliberate behavior, not a bug.
3. `VERDICT_LINE` regex stays module-level and unchanged from H1's version — do not touch it; the six rules are implemented entirely in the three new helpers plus the orchestrator's decision logic, never by modifying the regex itself.
4. The doc-comment corrections in ST-1 drop the word "naive" only where it no longer applies (per spec.md's File and naming decision) — do not do a broader prose rewrite of those four files beyond what spec.md scoped.
5. `index.ts`'s export block is untouched (not append-only, not edited at all) in this change — `extractBuiltInVerdict` was never exported and stays that way; only its module-doc-comment prose changes.

### Rollback and recovery

- **ST-1 is the riskiest stage** — it is the only one that changes executable code behind an existing caller with existing passing tests, and it is the stage with no new test coverage of its own to prove correctness (that arrives in ST-3). Its safety net is the 200-test regression run, which is real but narrower than the 16 ACs this story exists to prove — a subtle deviation in the tail-window arithmetic or the contradiction-scope change (whole-output → tail-window) could pass 200/200 while still failing AC-3/AC-4/AC-5, since none of the pre-existing 200 tests touch the tail-window boundary or ANSI stripping at all. Rollback: single `git checkout -- src/core/run/builtin-verdict-extraction.ts src/core/run/run-review.ts src/core/run/index.ts src/core/run/verdict.ts` — zero blast radius, since the function's exported name and signature never change and nothing outside these four files is touched.
- **ST-2** rollback: `rm -f fixtures/synthetic/*.txt && git checkout -- fixtures/README.md` (or `git clean` on the new directory) — zero blast radius, nothing imports these files until ST-3.
- **ST-3** rollback: delete the two new files (`rm src/core/run/__test__/verdict-fixture-loader.ts src/core/run/__test__/builtin-verdict-extraction.test.ts`) — the tree returns to ST-2's state; nothing else references them.

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this plan is execution-ready and `sddl-plan` is not terminal here.
- The route is `continue-lite`, so no `macro-plan.md` is produced.

## Approval Notes

- Three code/fixture-touching stages, each gated by its own `stage_approval` before the executor writes anything, per the workflow contract and `d-lightweight-ceremony`'s ~3-stage target (met exactly, not exceeded).
- No mid-execution full-4R review is pre-scheduled (`d-lightweight-ceremony`; `state.yaml` `sddl-code-review` notes). `sddl-code-review`/`sddl-judgment-day` still run at the change's normal gate after ST-3. Re-evaluate only if the executor reports a structural surprise during ST-1 — the stage most likely to produce one, per the Rollback section above.
- All three `d-design-open-questions` obligations are carried forward explicitly (see dedicated section above) rather than left for the executor to re-derive from design.md's "Open Questions" section.
- No settled decision is reopened: `d-provenance-in-scope`, `d-persistence-ac-deferred`, `d-synthetic-adversarial-fixtures`, `d-tail-window-size` all stand as recorded in `state.yaml`.

## Budget Notes

- Measured baseline: `npm test` = **200 passed (200), 15 test files**, run before this plan was written (command: `npm test`, no filters).
- Per `d-lightweight-ceremony`, this plan stays at exactly 3 executor stages against one file's implementation, one new fixture directory, and one new test file plus its loader — proportionate to the smaller surface than H1 despite carrying forward six binding decisions and three spec-revalidation traps in full detail, since those are exactly what the executor needs to avoid repeating mistakes this change's own history already made once.
