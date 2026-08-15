# S19 — [E4.F1.H2] Verdict and ambiguity parser, seed through PR #65

- **Date**: 2026-08-15
- **Branch**: `claude/validar-e1-preparar-e4-m1xkhl`
- **Scope**: `[E4.F1.H2]` (issue #27) end to end: seed → proposal → spec → adversarial spec
  revalidation → design → plan → ST-1..ST-3 → final QA `pass_with_notes` → PR #65. Also: detected
  and handled the mid-session merge of PR #64 (`[E4.F1.H1]`, from S18).
- **sdd-lite changes**: [`e4-f1-h2-verdict-parser/`](../../sdd-lite/openspec/changes/e4-f1-h2-verdict-parser/)
  (**completed** — QA final `pass_with_notes`, 16/16 ACs)

## Objective

Continue E4 with `[E4.F1.H2]`: replace H1's deliberately naive built-in verdict extraction with a
defensive parser, hardened against real engine output and against the injection scenario the naive
version was never asked to resist. Run the change with deliberately lighter ceremony than H1
(user asked to save tokens), while keeping the spec stage at full rigor.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S19-D1 | Model tiering for H2: Sonnet for proposal/design/plan/executor/QA, Opus (session default) for spec and orchestration | Opus throughout (H1's approach); Sonnet throughout | User asked where cheaper models are safe. Spec fixes the contract every later stage validates against — highest blast radius from an error. Execution/QA stages are mechanical and test-verified. Data from H1: executor stages landed green on the first pass without needing Opus | `claude→user` |
| S19-D2 | `[E4.F1.H2]` owns verdict provenance (`r-verdict-provenance`), not just normalization | Defer provenance to a separate future story | Normalization and provenance pull in opposite directions: every rule that makes matching more permissive (fence tolerance, whole-window scan) also widens what an injected marker can look like. Deciding them separately means hardening the parser now and patching the hole it opens later | `claude→user` |
| S19-D3 | Issue #27's third acceptance criterion ("ambiguous run persisted with a marker") is deferred with an explicit record, not stubbed | Pull a minimal persistence stub into H2 to close the criterion | Persistence is `RunStore` (`E5.F2.H1`), which does not exist; H1 already fixed that this flow writes no run anywhere. A stub would expand H2's scope into E5 and create an interface E5.F2.H1 would later have to replace | `claude→user` |
| S19-D4 | ~3 executor stages instead of H1's 6, no mid-execution 4R review pre-scheduled (`d-lightweight-ceremony`) | Full H1-style ceremony (6 stages + mid-execution 4R) | Risk-profile justification, not just budget: H2 is one pure function plus its fixture corpus, no composition, no concurrency. Empirical argument: H1's expensive four-lens review missed the git option-injection defect that the PR's free automated reviewer (Copilot) caught for free | `claude` |
| S19-D5 | Adversarially revalidate spec.md before routing to design, with a fresh-context Sonnet validator running in parallel with the orchestrator's own checks | Trust the spec worker's self-report and route straight to design | User explicitly asked to revalidate before advancing, anticipating possible corrections | `user` |
| S19-D6 | Accept and fix all 6 validation findings (3 MAJOR, 3 MINOR) in place rather than re-running the spec stage from scratch | Reject the spec and regenerate; accept as-is and fix only what blocks design | Every finding was independently confirmed against source/fixtures before acting. All were surgical corrections (wrong corpus claim, a buildability trap, a stale doc claim, three wording/hint fixes) — fixing in place was faster and lower-risk than regeneration, and the errors mostly originated one level upstream (in proposal.md) and were fixed at the source too | `claude` |
| S19-D7 | Resolve all three questions design.md escalated (tail-window tie-break, defensive non-string guard, AC-13 automatability) at the orchestrator level rather than sending back for another design pass | Route back to design for a second pass | All three were genuinely A-level once examined: the tie-break turned out to be mathematically immaterial (both windows are suffixes of the same string; equal length implies identical content), the guard was a one-line addition with an attached test condition, and AC-13's mechanical form was one ordinary assertion the design worker had incorrectly ruled out | `claude` |
| S19-D8 | Add a mandatory ad-hoc evidence obligation to ST-1 (run the four real marker fixtures through the new parser and record the output) before approving it | Approve ST-1 on the strength of the 200-test baseline alone | Plan itself flagged ST-1 as the riskiest stage: it replaces executable code behind a live caller, and none of the 200 pre-existing tests exercise the tail window, the narrowed contradiction scope, or ANSI stripping — the baseline proves "nothing broke," not "the new behavior works" | `claude` |
| S19-D9 | Detected PR #64 was merged mid-session (via a `git push` remote hint) and rebased the H2 seed commit onto the new `main` instead of continuing on the stale branch | Ignore the hint and keep committing on the old base; ask the user before acting | The branch's PR had closed — new commits on it would not land in any open PR. Rebase was the correct, low-risk recovery (one commit, clean rebase, force-with-lease) and was reported after the fact rather than blocking on it, since it was mechanical and reversible | `claude` |
| S19-D10 | Fix all 3 PR #65 Copilot review findings directly (tail-window allocation, docstring contradiction, test-loader over-claim) rather than replying without fixing | Reply explaining without fixing; relaunch sddl-executor/qa for a formal amendment stage | All three verified real against source first. Bounded, single-production-file-plus-test-file scope, matching the exemption used for H1's PR #64 review response. None was security-relevant on its own, but the performance finding's fix surfaced and fixed a genuine correctness bug (see Deviations) that would have shipped un-caught otherwise | `claude` |

## Deviations

- **Spec.md needed 6 corrections after an adversarial revalidation round**, at the user's request,
  before routing to design. 3 MAJOR: (1) a factually wrong corpus claim — rule 4 described
  `opencode/no-verdict.ndjson` as having "no text events, empty reconstructed text"; it actually has
  2 real text events with ~449 chars of prose. The error originated in `proposal.md`'s inventory
  table and propagated into the spec; both documents were corrected. (2) A fixture-construction trap
  in `decoy-then-genuine.txt`'s original description: a 55-line hint and a "decoy outside both
  windows" constraint that the hint alone does not guarantee — a literal build with short filler
  lines could total under 2000 characters, degenerate the char-window to the whole file, readmit
  the decoy, and fail AC-3 instead of passing it. Fixed with a mandatory dual bound (≥55 lines AND
  ≥2200 chars) plus a post-build check. (3) `fixtures/synthetic/` silently falsified
  `fixtures/README.md`'s framing of the whole tree as "real captured outputs", and AC-15's
  allowed-diff list didn't permit fixing it — added to scope. 3 MINOR wording/hint fixes.
- **design.md correctly escalated 3 open questions instead of silently deciding them** — one of
  which rested on a false premise (the tail-window tie-break "concern" was mathematically
  impossible to actually matter). Caught and corrected at the orchestrator level rather than
  carried forward as an unexamined default.
- **Two `state.yaml` self-inflicted YAML edit bugs**, both caught by validating the file
  (`python3 -c "import yaml; ..."`) before committing, neither reaching git: (1) a `str.rindex`
  lookup for an empty `resolved_at: ""` field matched the wrong (non-empty) occurrence in a
  larger file, requiring a follow-up `Edit` to fix one checkpoint's `resolved_at`. (2) A batch
  risk-closure script's lookahead regex `(?=  - id: |\nnext_action:)` required a `\n` already
  consumed by the preceding line's match, so the last of four risk-closure edits silently failed
  every retry until the regex itself was corrected (removing the extra `\n`). Both are process
  friction, not artifact corruption — unlike S18's `state.yaml` explosion incident, nothing bad
  was ever committed here because validation ran before every commit.
- **PR #64 (H1, from S18) was merged mid-session**, discovered from a `git push` remote hint rather
  than proactively. The branch was rebased onto the new `main` (one commit, clean, force-with-lease)
  before continuing H2 work. See `S19-D9`.
- **A self-authored optimization introduced a real bug, caught before it reached the repo.**
  Fixing PR #65's performance finding (replacing `raw.split("\n")` with a backward `lastIndexOf`
  scan) required a loop that terminates on "no more newlines found". The first version relied on
  `lastIndexOf` returning `-1` for that signal — but `String.lastIndexOf` clamps a negative
  `fromIndex` to `0` and then checks index `0` normally, so it can return `0` (a valid index)
  instead of `-1` when the search has actually run out of room. This broke the exhaustion check
  for inputs with fewer newlines than the tail-window bound. Found by fuzz-comparing the new
  implementation against the original `split/slice/join` over ~2000 random cases before
  committing anything — not by inspection. Fixed with an explicit `searchEnd <= 0` guard checked
  before each `lastIndexOf` call, re-verified against the same fuzz suite (all equivalent), and
  pinned with a dedicated regression test. Nothing incorrect was ever committed.

## Work done

- **Model-tiering analysis** presented to the user with H1's actual subagent token spend as
  evidence (~600-700k across proposal/spec/design/plan/executor/QA/4R-review), recommending Sonnet
  for proposal/design/plan/executor/QA and keeping Opus for spec + orchestration.
- **`e4-f1-h2-verdict-parser` lite flow, seed through QA** (artifacts linked above, not copied):
  seed (`1dd1f80`) with two scoping decisions pre-settled by the user; proposal (`23c3fbf`, Sonnet
  worker) — full 12-fixture inventory (4/12 contain a marker, 8/12 negative controls, zero ANSI
  bytes), collapsed the ≥90% criterion to a measurable 4/4 target; spec (`e8ab064`) — 16 ACs, six
  parsing rules, three synthetic fixtures, persistence deferral restated copy-ready; spec
  revalidation and fix (`86afc24`) — see Deviations; design (`5d86d26`, Sonnet) — three
  file-private helpers, pinned pipeline order, new test-file layout, 3 open questions correctly
  escalated and resolved by the orchestrator; plan (`a86a431`, Sonnet) — 3 sequential stages,
  measured test baseline (200, not guessed), traps list derived from the spec revalidation's own
  findings.
- **ST-1** (`33843ff` approval, `06a6ee0` execution): parser body rewritten with the three helpers;
  four doc-comments updated to past tense. One design deviation (a `biome-ignore` for the
  deliberate ESC byte in the SGR regex, behavior-neutral). Mandatory four-fixture evidence run
  confirmed all four real marker fixtures still resolve to `"request-changes"`. `npm run check`
  green, `npm test` 200/200 unchanged — both independently re-verified by the orchestrator, plus a
  full read of the resulting source file against `design.md`.
- **ST-2** (`3b0c0e4` approval, `08ecd01` execution): three synthetic fixtures
  (`decoy-then-genuine.txt` 62 lines/7714 chars, `contradiction.txt`, `ansi-wrapped-verdict.txt`)
  plus a `fixtures/README.md` provenance note. All three mandatory build checks
  (`wc`/`tail`/byte-inspection) run and independently reproduced by the orchestrator (`od` used in
  place of unavailable `xxd`, equal evidentiary value). `npm run check` and `npm test` unchanged.
- **ST-3** (`0b39675` approval, `b5ff846` execution — final execution stage): `verdict-fixture-loader.ts`
  (test-only envelope reconstruction) and `builtin-verdict-extraction.test.ts` (25 tests) covering
  all 16 ACs, including the AC-13 mechanical export assertion and the defensive-guard cast test.
  `npm run check` green, `npm test` **225/225** (200 + 25) — independently re-verified, both new
  files read in full by the orchestrator.
- **Final QA review** (`9db8029` approval, `b9df21c` closeout): fresh-context Sonnet worker,
  final mode. Verdict `pass_with_notes` — 16/16 ACs verified against actual file bytes (not
  execution-log framing): `od`-level ANSI byte inspection, manual tail-window arithmetic on the
  decoy fixture, direct read of the real E1 corpus. All three binding obligations
  (`d-design-open-questions`, `d-st1-evidence-obligation`) confirmed honored in code. One MINOR
  finding (open_risks not marked resolved in the ledger despite being substantively closed) —
  closed immediately: all four risks (`r-verdict-provenance`, `r-normalization-vs-injection`,
  `r-parse-rate-criterion`, `r-contradiction-semantics`) resolved with AC cross-references.
  `sddl-code-review` status corrected from `pending` to `skipped` (it was deliberately never
  scheduled, per `d-lightweight-ceremony`) for an accurate final record.
- **Issue #27** updated: first two acceptance criteria checked, third marked deferred with the
  spec's persistence-deferral paragraph and the `E5.F2.H1` blocker named.
- **PR #65 opened**: `[E4.F1.H2] Verdict and ambiguity parser`, `Closes #27`. 2 of max 5 PRs open
  (alongside none currently — PR #64 merged this session).
- **PR #65 review response** (`ef2ffde`): GitHub Copilot's automated review left 3 comments, all
  verified real before acting. (1) `computeTailWindow`'s `raw.split("\n")` allocated over the
  full output just to keep a 30-line tail — replaced with a backward `lastIndexOf` scan
  (`lastNLines`), fuzz-verified equivalent to the original over ~2000 random cases before
  committing. The rewrite itself surfaced a genuine bug (`String.lastIndexOf` clamps a negative
  `fromIndex` to `0` instead of "not found", breaking the loop's exhaustion check) — caught by
  the same fuzz comparison, fixed, and pinned with a new regression test. (2) The file header
  contradicted `computeTailWindow`'s own doc ("never the whole thing" vs. "at most") — aligned.
  (3) The test-only fixture loader's "never throwing" doc-comment was false for malformed JSON —
  made tolerant, matching its sibling function's existing pattern. Full gate re-verified green
  (226/226); replied on all three PR threads with the fix commit.
- **Mid-session recovery**: rebased the branch onto `main` @ `5ae835c` (post-PR-#64-merge) after
  detecting the merge from a `git push` hint; force-with-lease pushed the single unmerged H2-seed
  commit on top.

## Pending and next steps

- **User**: review and merge PR #65.
- **Claude, next session**: `E4.F2` (#28-30) — real engine adapters (`engines/claude-code`,
  `engines/opencode`, cascading resolution). This is the E4 epic's remaining work and the owner
  of several risks recorded in both H1's and H2's `state.yaml` files: the timeout-precedence rule,
  kill-before-cleanup ordering, the unbounded non-engine await gap in the git adapter, and the
  eager-harness-load blind spot.
- **⚪ optional and untouched**: #10, #16, #25 (unchanged from S18).

## Open questions for the user

- —
