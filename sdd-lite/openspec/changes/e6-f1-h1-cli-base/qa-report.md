# QA Report

change_name: e6-f1-h1-cli-base
mode: stage
review_target: S1-S4 (commits f0de92a, a20dd5a, bd97131, 40a6deb on `claude/validar-estado-proyecto-rcvz8c`)
reviewed_at: "2026-08-24T05:00:00Z"

## Closeout Digest

- verdict: **pass**
- blockers: **0** · high: 0 · medium: 0 · low: 3 (all `info`, none blocking)
- gates re-run independently: `npm run check` exit **0**, `npm test` exit **0** (551 tests / 31 files)
- architecture guards: **clean in intent, not only by exit code** — every new core file imports
  either nothing, a same-module file, or the other module's public `index.js`; no Node builtin,
  no npm import, no adapter, no `src/main/` reference anywhere in `src/core/**`.
- **stage mode: this does NOT close the change.** S5-S11 are unimplemented and unapproved.
- recommended next stage: `sddl-executor` for S5, after a fresh `stage_approval`.

## Independent Validation (re-run, not quoted from the execution log)

| Command | Exit | Literal output |
|---|---|---|
| `npm run check` | **0** | `Checked 124 files in 125ms. No fixes applied.` · `✔ no dependency violations found (84 modules, 183 dependencies cruised)` |
| `npm test` | **0** | `Test Files 31 passed (31)` · `Tests 551 passed (551)` · `Duration 8.88s` |

Both match the expected baseline exactly (biome 124 files, depcruise 84 modules / 183 dependencies,
0 violations; 551 tests / 31 files). Nothing was skipped. `e2e/` does not exist and its project
matches no files — deliberate per AC-14 and `[E7.F1.H1]`, not a finding.

## Acceptance Criteria Verified

| AC | Owner stage | Status | Evidence |
|---|---|---|---|
| AC-5 | S4 | **met** | `persistRun(request, deps)` in `src/core/history/persist-run.ts`, exported from `history/index.ts` with its three types. Composed record checked field-by-field against `RunRecord` (`ports/run-store.ts`) and design §4: every field present, none invented, `diff` reduced by `toDiffSummary` to counts + warning **messages**, `failure` reduced to `{stage, message}` with no `cause`/stack/exception. Returns `{runDir, record}` where `runDir` is `store.save`'s resolution. Only cross-module import is the type-only `../run/index.js`. Tests cover `ok`, `engine-error` with `failure` populated and `verdict` absent, a non-`Error` throwable, and a `store.save` rejection propagated unchanged. |
| AC-8 | S2 | **met** | `reviewTimeoutMs: z.number().optional()` on `GlobalConfigSchema` — literal, no `.default()`, guarded by a test that asserts the key is absent after parsing a document without it. `DEFAULT_REVIEW_TIMEOUT_MS = 600_000` lives in `core/run`. Precedence implemented as `flags.timeoutMs ?? config.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS` with one test per level. Pre-story config shapes and an empty document still parse; `RepoEntrySchema` did not gain the field. |
| AC-9 | S1 | **met** | `package.json` runtime `dependencies` read back: `commander`, `execa`, `yaml`, `zod` — exactly four. No `picocolors`, no `@clack/prompts`, no `marked*`. The lockfile diff is precisely the promotion of the already-present transitive `commander@15.0.0` (removal of `"dev": true`) plus the root dependency entry — no other package added or bumped. |
| AC-14 | all | **met (for this batch)** | Both gates exit 0; 500 → 551 tests with **zero deletions in any pre-existing test file** (`git diff --numstat`: `+47/-0`, `+38/-0`, `+67/-0`). New tests all live in `<module>/__test__/*.test.ts` under the `core` project. |
| AC-1 (S2 precondition only) | S2 | **established** | The cascade lives in core as a pure function that also owns the registry lookup and the internal `resolveEngine` call, so the S7 command will have no precedence logic, no lookup and no engine branch left to hold. The remainder of AC-1 is S6/S7's and is untestable now. |

## Conformance To Design

- **S2 precedence table — verbatim.** All ten rows of design §"Precedence implemented by `resolveReviewRequest`" match the implementation, including the two that are easy to get wrong: `cleanupPolicy` is omitted (asserted with `Object.hasOwn`, so `runReview`'s `"always"` default stands) and `limits`/`validations`/`validationTimeoutMs` are conditionally spread rather than set to `undefined`, as `exactOptionalPropertyTypes` requires. No silent divergence found.
- **S4 `RunRecord` field table — verbatim.** Each of the 15 `RunRecord` fields traces to design's source column; `engine = result.engineName ?? request.engineName` and `validationOutput` from the **request** (correct: `RunReviewResult` carries none, `runReview` merges computed output back into it at line 437 of `run-review.ts`).
- **D1** honoured: no command exists yet, and nothing in this batch pre-empts the zero-logic rule — `main` and the adapters were not touched at all.
- **D3** honoured: `.optional()`, not `.default()`, with a dedicated mutation guard test.
- **D4** honoured: `commander` is the single addition.
- **D5** honoured: `resolveReviewRequest` + `DEFAULT_REVIEW_TIMEOUT_MS` + both input types exported from `run/index.ts`, pure, no I/O, path string-concatenated (no `node:path`).
- **D7** honoured: `toRunStorageKey` is exported from its own file for its two call sites but **absent from `history/index.ts`** — confirmed by reading the barrel diff, which adds only `persistRun` and its types.

## The S3 Regression Question

S3 changed the observable behaviour of two use cases merged by `[E5.F2.H2]`. Verified:

- **No pre-existing test was edited or deleted** — both files are pure appends (`+38/-0`, `+47/-0`).
- **The surviving suites are not vacuous.** The pre-existing `listRuns`/`getRun` assertions use separator-free aliases (`sentinel-kit`, `never-saved`), so they now exercise the *pass-through* branch of `toRunStorageKey` and still assert the exact argument reaching `store.list`/`store.get`. They remain a real regression guard for `[E5.F2.H2]`, just of the identity case.
- **The new coverage is the non-identity case**, including one test asserting the run **id** is not normalised — the correct boundary.
- **The adapter-side guard is intact.** `RunStore.contract.ts` (`save` with `repoName: "a/b"` rejected) and `run-store-fs.test.ts` (`adapter.get("a/b", "x")` rejects) were read and are unmodified, so the schema still refuses a separator; core now simply never hands it one. Nothing was edited that should not have been.
- **`persistRun` is consistent with both readers**: a run written under `owner__repo` is exactly the run `listRuns`/`getRun` read back.

## Test Quality

The new suites assert properties rather than restating the implementation: per-row precedence with
distinguishable values, `Object.hasOwn` absence checks (which `toEqual` cannot make), idempotency
`f(f(x)) === f(x)`, a negative-duration clamp, and an unchanged rejection propagation. One assertion
does not hold up — see F-1.

## Findings

| Id | Severity | Area | Finding | Evidence | Next action |
|---|---|---|---|---|---|
| F-1 | low (`info`) | test quality, S4 | **The "no diff body persisted" stringify assertion is vacuous.** `expect(JSON.stringify(record)).not.toContain(diffBody)` cannot fail: `diffBody` contains real newlines, which `JSON.stringify` emits as the two-character escape `\n`, so the raw substring is absent even from a record that persists the diff verbatim. Reproduced directly: stringifying `{diff:{files:[{path:"src/a.ts",content:diffBody}]}}` yields `contains raw diffBody? false`. | `src/core/history/__test__/persist-run.test.ts:193` | **Not blocking**: the sibling assertion on the same record, `not.toContain("src/a.ts")`, *is* sound (the same reproduction yields `contains src/a.ts? true`), and it fails for any record that leaks the `files` array — so AC-5's property is genuinely covered. Optional hardening in a later stage: assert on an escape-free token such as `"-old"`, or assert `Object.keys(record.diff)` directly. |
| F-2 | low (`info`) | dependency metadata | `commander@15.0.0` declares `engines.node >= 22.12.0`; `package.json` declares `>= 22`. Confirmed in `node_modules/commander/package.json`. CI pins node [22, 24] so it is unaffected; a consumer on Node 22.0-22.11 would see `EBADENGINE`. | `package.json`, `node_modules/commander/package.json` | Already tracked as `risk-e6h1-008` (open, low, decide before `[E7.F2.H3]`). Correctly not fixed in passing — S1's scope was "`package.json` … nothing else". No new action. |
| F-3 | low (`info`) | artifact hygiene | The `risk-e6h1-006` entry in `state.yaml` carries `summary` and `severity` but no `status:` field; every other risk has one. | `state.yaml` open_risks, last entry | Not corrected here: this stage is fenced out of `open_risks`. The orchestrator or the S9/S10 executor that owns that risk should add `status: open`. |

No BLOCKER or CRITICAL finding. No architecture-guard violation.

## Known Open Risks — Did S1-S4 Make Them Worse?

- **`risk-e6h1-009` (stored `owner__repo` echoed back in `repoName`) — unchanged, correctly scoped.**
  S4 could only have made it worse by persisting the raw alias, which the store's
  `RunRecordPathFieldsSchema` would reject on every registered repo; writing the storage key is the
  only correct choice and it keeps writer and readers consistent. The residue is purely a rendering
  concern and stays with S6/S7, which must echo the alias the user typed rather than
  `RunSummary.repoName`/`RunRecord.repoName`. Carried forward, unchanged severity (medium).
- **`risk-e6h1-006` (first full graph assembly) — narrowed, not worsened.** S2/S3/S4 removed the two
  integration mismatches that were most likely to surface in `main`: the missing timeout source and
  the alias/storage-key collision D7 predicted. The residual risk is exactly the wiring S8/S9 add,
  still mitigated only by S10's mandatory manual smoke. Unchanged severity (medium).

**Are S5-S7 safe to build on this foundation? Yes.** The three core additions are pure or
store-only, fully unit-covered, and shaped exactly as design fixed them, so the CLI stages can be
written as parse-and-delegate shells with no cascade, no lookup and no record composition left to
own. Two facts S5-S7 must carry: the renderer must not print the stored `repoName` (`risk-e6h1-009`),
and `--timeout` arrives from commander as a string that the command must parse to a number before it
type-checks against `ResolveReviewRequestFlags.timeoutMs`.

## Observations (not findings)

- `toRunStorageKey` maps `a/b` and a literal `a__b` to the same storage key. Unreachable in practice —
  `deriveAlias` builds `owner/repo` from URL segments — and rejecting it would put validation inside a
  pure mapping helper. Recorded only so a future multi-segment alias scheme reconsiders it.
- `DEFAULT_REVIEW_TIMEOUT_MS`'s doc comment says it lives "beside `DEFAULT_VALIDATION_TIMEOUT_MS`";
  the two are in the same module but different files, and the validation constant is module-private
  while this one is barrel-exported (as D5 requires). Substance matches AC-8; wording is loose.
- A negative or out-of-range `reviewTimeoutMs` in `config.yaml` passes `z.number()` and is caught later
  by `runReview`'s stage-1 guard (`run-review.ts:346-353`) as an `InvalidRunRequestError` — the same
  arrangement `validationTimeoutMs` already uses. Consistent, no change recommended.

## Verdict

**pass** — the S1-S4 batch delivers exactly what spec, design and plan authorised, both gates are
green on independent re-run, the architecture guards hold in intent, the S3 behaviour change left
`[E5.F2.H2]`'s suites meaningful and unedited, and the three findings are informational. Stage mode:
the change stays `implementing`; only `final` mode may close it.

## Next Action

Take a fresh `stage_approval` to the user for **S5** (CLI shell: `createCli`, `CliDeps`, error/version/
root-help behaviour), then run `sddl-executor` for S5 alone. No correction round is required before it.

---

# QA Report — S5-S7 batch

change_name: e6-f1-h1-cli-base
mode: stage
review_target: S5-S7 (commits 41421c9, c00e210, 81cab90 on `claude/validar-estado-proyecto-rcvz8c`; frozen diff `git diff c00e210~3..HEAD -- src`, 18 files, +2488/-5)
reviewed_at: "2026-08-24T06:00:00Z"

## Closeout Digest

- verdict: **pass**
- blockers: **0** · high: 0 · medium: 0 · low: 2 (both `info`, neither blocking)
- gates re-run independently: `npm run check` exit **0**, `npm test` exit **0** (638 tests / 37 files)
- architecture guards: **clean in intent, not only by exit code** — the CLI adapter imports
  `commander` and four core barrels and nothing else; it constructs no adapter and reads no
  `process`, no `node:*`, no filesystem.
- **one mutation-verification claim was independently reproduced** (S7 traps 1 and 4, plus S6's
  `risk-e6h1-009` guards) — the counts matched the execution log exactly.
- **stage mode: this does NOT close the change.** S8-S11 are unimplemented and unapproved.
- recommended next stage: `sddl-executor` for S8, after a fresh `stage_approval`.

## Independent Validation (re-run, not quoted from the execution log)

| Command | Exit | Literal output |
|---|---|---|
| `npm run check` | **0** | `Checked 140 files in 774ms. No fixes applied.` · `✔ no dependency violations found (94 modules, 209 dependencies cruised)` |
| `npm test` | **0** | `Test Files  37 passed (37)` · `Tests  638 passed (638)` · `Duration  7.83s` |

Both match the expected numbers exactly (biome 140 files, depcruise 94 modules / 209 dependencies,
0 violations; 638 tests / 37 files). Nothing skipped. `e2e/**` empty and `src/main/cli.ts` still the
`[E0.F1.H3]` `--version` stub are both by design (`[E7.F1.H1]`, S9), not findings.

## Mutation Verification — Independently Reproduced

The batch's credibility rests on three stages claiming they broke the code and watched the right
tests fail. Three of those claims were re-run from scratch (each mutation applied to the source,
suite run, source restored; `git status` is empty and `npm test` green afterwards):

| Claim | Mutation applied | Log's claim | **Observed** |
|---|---|---|---|
| S7 trap 2 (persistence) / trap 1 (exit code) | `if (result.state !== "ok") throw` inserted before the `persistRun` call in `review-command.ts` | `Tests  6 failed \| 22 passed (28)` | **`Tests  6 failed \| 22 passed (28)`** — exact match |
| S7 trap 4 + S6 `risk-e6h1-009` | `formatReviewOutcome` renders `record.repoName`; `formatRunSummaryLine` renders `summary.repoName` | 1 review test + 3 runs tests | **`Tests  3 failed \| 84 passed (87)`**, failing on both `echoes the alias the user typed…` tests and `passes the alias verbatim to listRuns…` |

The guards are real: they fail for the exact defect they name, and they fail for nothing else. The
`risk-e6h1-009` fixtures genuinely carry `owner__repo` in `repoName`, so the guards are not vacuous.

Beyond the mutation runs, an additional probe was written and discarded: driving one `SentinelCli`
instance twice (`review … --timeout 60000 --engine opencode`, then `review` with no flags) does
**not** leak the first invocation's option values into the second. `createCli` builds the
`commander` program once and reuses it, so this was worth confirming rather than assuming.

## Acceptance Criteria Verified

| AC | Status | Evidence |
|---|---|---|
| AC-1 | **met (mechanically)** | Every command body was read line by line. `repo add`: builds a `RegisterRepoRequest` by conditional spread, one thunk call, one renderer. `repo list`: one thunk call, `Object.entries` iteration, one line per entry — no sort, no filter, no merge. `runs list`/`runs show`: one thunk call each, no translation of the alias, no re-ordering (`RunStore.list` is already ascending). `review`: `loadContext` → `resolveReviewRequest` (core) → `runReview` → `persistRun` → renderer, with no cascade, no registry lookup and no `RunRecord` composition. The only non-delegating code in the whole adapter is `parseTimeoutMs` (shape-only, upper bound left to `runReview`'s pre-flight) and the tab/newline collapsing in the renderers — presentation, not domain. **The testability proof holds**: `cli-test-doubles.ts` is a capturing `CliIo` plus a bag of thunks that throw unless overridden, and all 87 adapter tests run on it. No driven adapter, no filesystem, no `process` is needed to drive any command. |
| AC-2 | **met** | All eight levels are asserted, each on a distinct `Usage:` line: root and `-h` (`help.test.ts`), `repo` / `repo add` / `repo list` (`repo.test.ts:227-264`), `runs` / `runs list` / `runs show` (`runs.test.ts:326-351`), `review` (`review.test.ts:476-499`). Beyond non-emptiness, the tests assert the option **descriptions** appear (`--local-path <path>`, `--base-branch <branch>`, `--harness <name>`, `--type`, `--engine`, `--timeout`, `repository alias`, `run id`). Root help names `SENTINEL_HOME`, `~/.sentinel` and `SENTINEL_OPENCODE_MODEL`; all exit 0 with empty stderr. |
| AC-3 | **met** | `commandRegistrars` is exactly `[registerRepoCommands, registerReviewCommand, registerRunsCommands]`. Five leaf paths, five use cases, one thunk call each, `review` adding `persistRun` as D1 authorises. No sixth command was smuggled in; a test per path asserts the request object the thunk received. |
| AC-4 | **met for this batch** | `--version`/`-V` print the **injected** version as exactly one stdout line, exit 0, no decoration. The `package.json` half is S9's (`src/main/cli.ts` is still the `[E0.F1.H3]` stub), exactly as plan.md's coverage row (`AC-4 S5+S9`) declares. |
| AC-6 | **met, "exactly once" verified not trusted** | `persistRun` is called unconditionally, once, immediately after `runReview` resolves — a single call site, no branch, no loop. Tests assert `persistRunRequests` has length **1** and that the persisted `request` and `result` are the *same objects* (`toBe`, identity) handed to and returned by `runReview`; the non-`ok` case is covered for `engine-error`, `ambiguous`, `timeout` and `validation-failed`. Length **0** is asserted for every path that produces no run: unregistered alias, unresolvable harness, unknown engine, bad `--timeout`, and `runReview` itself throwing. The mutation run above confirms the guards fail when persistence is skipped. |
| AC-10 | **met** | Records on stdout, diagnostics on stderr, asserted stream-by-stream. Empty registry and empty run history both produce `io.out === []` plus exactly one stderr note, exit 0. Field order is asserted against the exported `*_FIELDS` tuples rather than hand-copied strings. Tabs and newlines inside a scalar are collapsed, so a two-line failure message stays one record — asserted directly. |
| AC-11 | **met for this batch** | `resolveReviewRequest` composes `validations`/`validationTimeoutMs` and the command forwards the request verbatim; tests assert `["npm test","npm run check"]` and `45_000` from the entry, and the `30_000` config fallback with `validations`/`limits` as **absent keys** (`Object.hasOwn`), not `undefined`. Wiring `createExecProcessRunner` is S9's half. |
| AC-12 | **met, structurally** | `grep` for `.state` outside `__test__` returns three matches, all inside a renderer building a display field (`format-review.ts:82`, `format-runs.ts:76`, `:153`) — independently re-read and confirmed. No exit-code table exists anywhere in the adapter; `[E6.F1.H2]`'s surface was not pre-empted. Exit codes come from exactly two places: `CommanderError.exitCode`, and the catch-all's literal `1`. Five tests pin exit 0 across `engine-error`, `ambiguous`, `timeout`, `validation-failed` and a `request-changes` verdict; non-zero is asserted only for usage/invocation failure. The mutation run confirms 6 tests fail the moment a terminal state reaches an exit decision. |
| AC-13 | **met** | `formatErrorLine` is message-only with no per-error-type branching. All ten core error families are instantiated for real and thrown through the real `run` path; each renders as exactly one stderr line **equal to `error.message`**, with `not.toContain("\n")`, `not.toContain(" at ")` and `not.toContain(error.name)`. Async rejections, multi-line messages and non-`Error` throwables render identically. |

## `risk-e6h1-009` Upheld Across S6 And S7

`grep -rn "repoName" src/adapters/driving/cli --include='*.ts'` outside `__test__` returns matches
only in doc comments and on the **request** side (`listRuns({ repoName: repo })`,
`getRun({ repoName: repo, id })`, `persistRun({ repoName: repo, … })`). **No renderer reads the field
off a store result.** All three renderers take the requested alias as their first parameter, and all
three commands pass the positional the user typed. No denormalising helper was added; D7's
input-only scope is unchanged.

**The S7 `runDir` exclusion is narrow, not vacuous.** The guard filters exactly the lines matching
`^runDir\t` and asserts `owner__repo` appears in none of the remaining nine fields — while the
fixture record carries `repoName: "owner__repo"` and the fixture `runDir` genuinely contains it. The
mutation run proves the guard still fires: rendering `record.repoName` fails that very test. The
exclusion is justified — `runDir` is a real filesystem path derived from the storage key, and hiding
it would be a lie about where the run was written.

## Architecture Guards In Intent

Confirmed by reading, since `src/main/` is still empty and `depcruise` cannot yet see the wiring:

- **`adapters-isolated`** — the adapter's entire import surface is `commander` plus four core
  barrels (`core/history/index.js`, `core/repos/index.js`, `core/run/index.js`,
  `core/review/index.js` in a test). Nothing under `src/adapters/driven/**`, nothing from another
  driving adapter.
- **`wiring-only-in-main`** — `grep "new [A-Z]"` returns exactly two constructions:
  `new Command()` (the adapter's own commander program) and `new InvalidArgumentError(...)` (a
  commander error type). **No driven adapter, no port implementation and no use-case binding is
  constructed anywhere in the CLI.** Every fact arrives through `CliDeps`.
- **`core-no-adapters`** — unaffected: the batch modified exactly one core file, a test
  (`persist-run.test.ts`, the F-1 hardening).
- `grep -rnE "\bprocess\b|node:"` outside `__test__` matches only two doc comments. The adapter
  never touches `process`, which is what makes `run` return an exit code instead of calling
  `process.exit`.

## Prior Finding F-1 — Closed

The S1-S4 report's F-1 (a vacuous `not.toContain(diffBody)` assertion) was hardened inside S5. The
replacement compares against `JSON.stringify(diffBody).slice(1,-1)` — the escaped form the
serializer actually emits — and *also* asserts `serializedDiffBody !== diffBody`, so the assertion
tells on itself the day the fixture body loses its newlines. The sound sibling
(`not.toContain("src/a.ts")`) was kept; the file is a pure `+9/-2` edit with the test count
unchanged at 8. **F-1 is resolved.** F-3 is resolved too: `risk-e6h1-006` now carries
`status: open`. F-2 remains tracked as `risk-e6h1-008`.

## Test Quality — Do The 87 Adapter Tests Assert Behaviour?

Yes. They are observable-behaviour tests, not implementation restatements:

- **Streams are captured separately** and asserted as whole arrays (`toEqual([])`), so an
  accidental stdout diagnostic fails a test rather than being tolerated by a substring check.
- **Identity assertions** (`toBe`) prove `persistRun` receives the very objects `runReview` was
  given and returned — a property `toMatchObject` could not establish.
- **Absence is asserted with `Object.hasOwn`**, distinguishing an absent key from an `undefined`
  value, which is what `exactOptionalPropertyTypes` actually promises.
- **Field order is asserted against the exported `*_FIELDS` tuples**, so the contract and the test
  cannot drift apart independently.
- **Negative properties are pinned**: registry order is *not* sorted, store order is *not* re-sorted,
  absent fields are *not* fabricated (`["-","-",…]` for a `corrupt` entry), the prompt is *not*
  dumped, `owner__repo` is *not* printed.
- **The error suite instantiates the ten real core error classes** and throws them through the real
  `run` path, so it covers the shell's catch-all rather than the formatter in isolation.

Every suite drives the whole CLI through `createCli(...).run(argv(...))` rather than calling a
command function directly — the same path `src/main/cli.ts` will take.

## D6 And D4 Upheld

- **D6** — `grep -i "json"` outside `__test__` returns only doc comments describing `--json` as
  *deferred*, plus one `metadata.json` reference. No `--json` option is declared on any command; no
  serialization surface exists.
- **D4** — `package.json` runtime dependencies read back exactly `commander`, `execa`, `yaml`, `zod`.
  No `picocolors`, no `@clack/prompts`, no `marked*`; no ANSI escape, colour or spinner anywhere in
  the adapter.

## S7's Carry-Forward For S9 — Coherent

`CliDeps` requires `loadContext`, `clonesDir` and `now`, all three consumed only by `review`.
Checked against what S8/S9 will actually have:

- `clonesDir` — design's `sentinelPaths(root)` returns it (`<root>/clones`), so S9 hands
  `sentinelPaths(...).clonesDir` to `CliDeps`. **Critically, the same value must reach
  `RegisterRepoDeps.clonesDir`**: `registerRepo` clones to `` `${deps.clonesDir}/${alias}` `` and
  `resolveReviewRequest` derives `` `${input.clonesDir}/${alias}` `` — independently re-read at
  `register-repo.ts:84` and `resolve-review-request.ts:117`. The two string concatenations are
  identical, so one shared value keeps `repo add` and `review` pointing at the same directory. A
  divergence here is the wiring mismatch `risk-e6h1-006` predicts, and it is cheap to prevent by
  deriving both from the same `sentinelPaths` call.
- `loadContext` — design A-5 puts it in `container.ts` over `ConfigStore`; nothing about it changed.
- `now` — trivially `Date.now`.

No incoherence found. S9's contract is fully determined by what S5-S7 shipped.

## Findings

| Id | Severity | Area | Finding | Evidence | Next action |
|---|---|---|---|---|---|
| F-4 | low (`info`) | spec conformance, S6 | **`repo add` on a cloned repository prints `-` where spec's behaviour table promised the resolved local path.** The table row reads "prints alias + resolved local path"; `formatRegisterOutcome` renders `entry.localPath`, which `registerRepo` populates **only** when `--local-path` was passed. For the ordinary cloning path the field is absent, so the user sees `alias⇥registered⇥-` and is never told where the clone landed. `registerRepo` computes the path (`register-repo.ts:84`) but does not return it. | `src/adapters/driving/cli/render/format-repos.ts:70-73`; `src/core/repos/register-repo.ts:84,~118` | **Not blocking, and the S6 decision not to re-derive `${clonesDir}/${alias}` in a renderer was the right call** — that is core's cascade and duplicating it would violate AC-1. The clean fix is additive core surface (`RegisterRepoResult` gaining the resolved path), which this story did not authorise. Record it for S10's smoke to observe on a real clone, and raise it as a B-level question at S11 or in `[E7.F2.H1]`. |
| F-5 | low (`info`) | UX, S7 | **`review`'s outcome block omits the run id**, so the natural follow-up `sentinel runs show <repo> <id>` requires the user to read the id out of `runDir`'s last path segment. `REVIEW_OUTCOME_FIELDS` carries `runDir` but no `id`, and `PersistRunResult` returns `{runDir, record}` where `RunRecord` carries no id either. | `src/adapters/driving/cli/render/format-review.ts:53-64`; `src/core/history/persist-run.ts` | **Not blocking and spec-conformant** — the spec's behaviour table asks for "terminal state, verdict (when present) and the absolute run directory", which is exactly what is printed. Recorded so `[E6.F1.H2]`/`[E7.F2.H1]` can decide whether the id becomes a rendered field; deriving it in the renderer from `runDir` would be the kind of re-derivation AC-1 exists to prevent. |

No BLOCKER, no CRITICAL, no architecture-guard violation, no regression.

## Known Open Risks — New Evidence

- **`risk-e6h1-009` — held, and now mechanically guarded.** Three renderers, three alias parameters,
  zero reads of the stored field, four regression tests, all mutation-verified. The standing rule for
  later renderers (TUI, `--json`) is unchanged; the guards are the enforcement.
- **`risk-e6h1-010` (D9) — untouched.** `review` renders no `RunNotFoundError`; `runs show` renders
  it verbatim through `formatErrorLine`, so `runs show owner/repo missing` still says
  `Run not found: owner__repo/missing`. Unchanged severity, still accepted for `[E7.F2.H2]`.
- **`risk-e6h1-006` — narrowed further, still the batch's residual.** S5-S7 fixed the `CliDeps`
  contract completely, so the remaining integration surface is only S8/S9's wiring of six adapter
  factories plus the three `review`-only facts above. The `clonesDir` sharing noted in the
  carry-forward section is the one concrete mismatch worth pre-empting in S9. Unchanged severity;
  S10's smoke stays non-negotiable.
- **`risk-e6h1-008` — unchanged.** No dependency was added or bumped in this batch.

## Verdict

**pass** — S5-S7 deliver a CLI adapter that meets AC-1 mechanically rather than rhetorically: every
command is a parse-and-delegate shell drivable with two test doubles, no domain fact is derived,
filtered, sorted or merged in the adapter, and no adapter is constructed inside it. AC-2, AC-3,
AC-6, AC-10, AC-12 and AC-13 are met as written and their guards were shown to be capable of
failing. Both gates are green on independent re-run at the exact expected numbers. The two findings
are informational and neither weakens continuation confidence. Stage mode: the change stays
`implementing`; only `final` mode may close it.

## Next Action

Take a fresh `stage_approval` to the user for **S8** (`src/main/paths.ts` — `resolveSentinelHome`,
`sentinelPaths`, `resolvePackageRoot`), then run `sddl-executor` for S8 alone. No correction round
is required first. When S9 is planned, wire one `sentinelPaths(...)` result into **both**
`RegisterRepoDeps.clonesDir` and `CliDeps.clonesDir` — they must be the same string.

---

# QA Report — FINAL (whole change)

change_name: e6-f1-h1-cli-base
mode: final
review_target: the whole implemented change — `git diff origin/main...HEAD` on `claude/validar-estado-proyecto-rcvz8c`, 25 commits, 56 files, +8612/-68
reviewed_at: "2026-08-24T21:30:00Z"

## Closeout Digest

- verdict: **pass**
- blockers: **0** · high: 0 · medium: 0 · low: 3 (all `info`)
- gates re-run independently: `npm run check` exit **0**, `npm test` exit **0** (674 tests / 38 files),
  `npm run build` exit **0**, `npm run dev -- --version` exit **0** printing `0.0.0`.
- all **14 acceptance criteria met**, verified against code and tests rather than test names.
- **scope integrity: clean.** Every file in the diff traces to spec, to one of D1-D11, or to a
  recorded risk. **No undeclared fifth widening was found.**
- **completion allowed: YES.** `lifecycle_status: completed`.
- S8, S9, S9b, S10b and S10c never received a stage-mode QA; this final review covers them directly.

## Independent Validation (re-run, not quoted from the execution log)

| Command | Exit | Literal output |
|---|---|---|
| `npm run check` | **0** | `Checked 143 files in 826ms. No fixes applied.` · `✔ no dependency violations found (97 modules, 226 dependencies cruised)` |
| `npm test` | **0** | `Test Files 38 passed (38)` · `Tests 674 passed (674)` · `Duration 20.07s` |
| `npm run build` | **0** | `ESM dist/cli.js 105.05 KB` · `⚡️ Build success in 41ms` |
| `npm run dev -- --version` | **0** | `tsup --silent && node dist/cli.js --version` → `0.0.0` |

Every number matches the expected baseline exactly. Nothing was skipped. The product smoke was
deliberately **not** re-run (it clones a repository and invokes a real engine); it is assessed from
its recorded evidence below. `e2e/` matches no files — deliberate, `[E7.F1.H1]`.

## Acceptance Criteria — All 14

| AC | Status | Evidence (code first, tests second) |
|---|---|---|
| AC-1 | **met** | Read all four command modules end to end. `repo-commands.ts`: `toRegisterRequest` is flag→field mapping only; `repo list` iterates `Object.entries` without sorting or filtering. `runs-commands.ts`: no sort, no alias translation, no merge. `review-command.ts`: the body is `loadContext → resolveReviewRequest → runReview → persistRun → render`, with the entire flag→repo→global cascade inside `core/run`. No `RunRecord` is composed in the adapter, no port is called, no adapter is constructed. `parseTimeoutMs` checks shape only and explicitly leaves the upper-bound rule to `runReview`. Renderers are pure `(…) => string`. Mechanically enforced: `depcruise` 0 violations over 97 modules, and every command test drives the command with fake use cases and a capturing `CliIo` alone. |
| AC-2 | **met** | Every level declares `.description()` on the group, each positional and each option. `ROOT_HELP_FOOTER` documents `SENTINEL_HOME` **and** its `~/.sentinel` default, plus `SENTINEL_OPENCODE_MODEL` (D8). Tests: `help.test.ts` (root exits 0, non-empty usage, `SENTINEL_HOME`, `SENTINEL_OPENCODE_MODEL`, `-h`, routing propagated to subcommands), plus per-group help tests in `repo.test.ts`, `runs.test.ts`, `review.test.ts`. |
| AC-3 | **met** | Exactly six paths registered by three registrars; one use case per path; `review` the only two-use-case path. `CliUseCases` has exactly six members and every one has a call site. No extra command exists — no `repo branches`, no `open`. |
| AC-4 | **met** | `.version(deps.version, "-V, --version", …)`; `version.test.ts` asserts exit 0, the injected version on stdout, and **exactly one line with no decoration**. Confirmed live: `npm run dev -- --version` → `0.0.0`. |
| AC-5 | **met** | `persistRun` in `core/history`, barrel-exported with its three types. `diff` reduced by `toDiffSummary` to counts + warning **messages** (no file bodies); `failure` reduced to `{stage, message}` (no `cause`, no stack, no exception object). Returns `{runDir, record}`. Its only cross-module import is the type-only `../run/index.js`. The vacuous stringify assertion reported as F-1 in the S1-S4 review **has since been fixed** (`persist-run.test.ts` now compares against the escaped form the serializer actually produces). |
| AC-6 | **met** | `persistRun` is called unconditionally after `runReview` resolves, outside any state branch. Tests: persists exactly one run with the result `runReview` returned; persists a non-`ok` terminal state; prints the run directory; **persists nothing when `runReview` throws** and nothing for an unregistered alias. |
| AC-7 | **met** | `resolveSentinelHome(env, homeDir)` is pure (both inputs are parameters), trims, treats blank as unset, and `resolve()`s. `sentinelPaths(root)` derives all eight fields from one root, all absolute. `container.ts` calls `sentinelPaths(...)` **once** and nothing else in the file concatenates a path. 24 tests in `paths.test.ts`, including "does not read `process.env`" and "derives every field from the single root it was given". |
| AC-8 | **met** | `reviewTimeoutMs: z.number().optional()` — literal, no `.default()`. `DEFAULT_REVIEW_TIMEOUT_MS = 600_000` in `core/run`. Precedence is the single expression `flags.timeoutMs ?? config.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS`, one test per level, plus a guard that a document without the field parses to a record where the key is absent. |
| AC-9 | **met** | `package.json` runtime `dependencies` read back verbatim: `commander`, `execa`, `yaml`, `zod` — exactly four. No `picocolors`, no `@clack/prompts`, no `marked*`. `package-lock.json` diff is 2 lines. |
| AC-10 | **met** | Results go through `deps.io.stdout`, diagnostics and errors through `deps.io.stderr`; `processIo` uses `process.stdout.write` (one write per line), never `console.log`. Renderers use a fixed field order with a literal `-` for absent fields, exported as `REPO_LINE_FIELDS` / `REGISTER_OUTCOME_FIELDS` / `REVIEW_OUTCOME_FIELDS` / `RUN_SUMMARY_FIELDS` so tests assert the contract rather than a copied string. Tabs/newlines inside a value collapse to spaces, so one record can never split across two lines. Empty registry and empty run list write **nothing** to stdout and a note to stderr. |
| AC-11 | **met** | `createExecProcessRunner()` is instantiated in `container.ts` and passed as `RunReviewDeps.processRunner`. `resolveReviewRequest` forwards `entry.validations` and the `entry.validationTimeoutMs ?? config.validationTimeoutMs` cascade. Test: "forwards the repository's declared validations and their timeout (AC-11)" asserts both reach the `runReview` fake. `[E5.F1.H2]` is no longer dead code. |
| AC-12 | **met** | Nothing in the adapter reads `result.state` to decide an exit code — `runProgram` returns 0 on success, the `CommanderError.exitCode` for usage failures, and 1 for a thrown error. Tests: exit **0** for `engine-error`, exit **0** for a `request-changes` verdict, non-zero for an unregistered alias (persisting no run), for an unresolvable harness, and for an unknown engine. No exit-code table exists anywhere in the diff. |
| AC-13 | **met** | `formatErrorLine` has **no per-error-type branching** — it reduces any throwable to one line, collapsing embedded newlines, with a name fallback. Never touches `stack` or `cause`. Commands do not catch: errors propagate to `createCli`'s single catch-all. Tests: sync and async rejection, multi-line collapse, non-`Error` throwable, "never includes a stack trace", plus one per command group. |
| AC-14 | **met** | Both gates exit 0. 500 → 674 tests / 28 → 38 files. `git diff --numstat` over every `__test__` path shows **zero deleted lines in any test file** — no pre-existing suite was weakened or removed to make this change pass. New tests live in `<module>/__test__/*.test.ts`; `src/main/**/__test__` was added to the `adapters` project and `docs/testing.md` was updated in the same commit that did it. `e2e/` stays empty. |

## Does It Deliver A Working Product?

Yes, and the evidence supports it — with one honest qualification.

The smoke exercised the full graph against a real repository and a real engine: clone → remote-only
ref resolution → worktree → 1-file/11-line diff → 220-line prompt → `claude-code` invocation →
verdict parse (`request-changes`) → persistence of `prompt.md`/`result.md`/`metadata.json` → read-back
through `runs list` / `runs show`. That is the whole `[E6.F1.H1]` surface except `repo list`, and it
discharged `risk-e6h1-006` for the reason the risk existed: it found `risk-e6h1-014`, a high-severity
defect that 661 unit and contract tests could not see. The first run's failure is itself corroborating
evidence for three ACs — it produced `state: engine-error`, `failureStage: worktree`, **exit 0**, and a
**persisted run** — which is AC-12, AC-6 and D1 confirmed by a real failure rather than by a fake.

The qualification is F-7 below: the transcript itself was not persisted, and the Stage Overview table
still marks S10 `pending`. Nothing material about the product is unverified — the two gaps in
automated coverage are `container.ts` (F-6) and the deliberate absence of `e2e/` (`[E7.F1.H1]`).

## Scope Integrity — No Undeclared Widening

Every one of the 56 files traces:

| Group | Traces to |
|---|---|
| `src/adapters/driving/cli/**` (13 files) | spec IN-scope, S5-S7 |
| `src/main/{cli,container,paths}.ts` + `paths.test.ts` | spec IN-scope, S8-S9, AC-7/AC-11 |
| `src/core/run/resolve-review-request.ts` + test + barrel | **D5**, AC-8 |
| `src/core/history/persist-run.ts` + test + barrel | **D1**, AC-5 |
| `src/core/history/run-storage-key.ts`, `get-run.ts`, `list-runs.ts` + tests | **D7** (+ D9 accepting its error-path leak as `risk-e6h1-010`) |
| `src/core/repos/ports/config-schemas.ts` + test | **D3**, AC-8 |
| `src/adapters/driven/git/**` (3 files) | **D11** / `risk-e6h1-014`, S10b + S10c |
| `package.json`, `package-lock.json`, `vitest.config.ts`, `docs/testing.md` | **D4**, S1 |
| `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `docs/setup-tecnico-sentinel.md` | **D10**, S9b |
| `sdd-lite/{openspec/config.yaml,project-context.md,skill-catalog.md}` | the two pre-story bootstrap-refresh commits (922b1bd, fdf0477) |
| `sdd-lite/openspec/changes/e6-f1-h1-cli-base/**` | this change's own artifacts |

`.dependency-cruiser.cjs` is **untouched** — no guard was relaxed to let this change through, which
is the check that matters most for the extraction guarantee. `tsconfig.json`, `biome.json` and
`tsup.config.ts` are untouched. No new port, no new driven adapter, no core use-case signature
changed. **No fifth widening.**

### The four widenings, each verified bounded

- **D1 `persistRun`** — one file, one use case, additive barrel export. Does not touch `runReview`,
  does not add a dependency to `history`, imports `run` only through its public barrel. Bounded.
- **D5 `resolveReviewRequest`** — one pure file, no I/O, no `node:path`, additive barrel export.
  It absorbs a cascade that would otherwise have lived in the adapter, so it makes AC-1 easier to
  keep rather than widening behaviour. Bounded.
- **D7 alias normaliser** — 31 lines, module-private (**not** exported from `history/index.ts`,
  re-verified), idempotent, applied at exactly three input sites. The `[E5.F2.H2]` suites were
  appended to, never edited; they now exercise the pass-through branch and remain real guards.
  Its one known consequence is recorded as `risk-e6h1-010`. Bounded.
- **D11 git ref resolution** — the largest widening and the one changing merged `[E2.F1.H2]` code.
  Verified: one new private `resolveCommitish`, funnelled from all three ref-taking methods, with
  the per-method error class passed in so `mergeBase` still fails as `GitMergeBaseError` and never
  as `GitWorktreeError`. Local refs keep precedence over remote (git's own DWIM order); two remotes
  carrying the same name **reject** rather than guess; an unresolvable ref still rejects, carrying
  the original git diagnostic as `cause`. `--detach` was kept, so PRD §5.1 (never a checkout in the
  managed clone) still holds — and there is a contract test asserting the clone gains no local
  branch. `GitPort`'s signatures are unchanged. Cost: one to two extra `git` invocations per call.
  Bounded, and correct.

## Test Quality — Would It Catch A Regression?

Yes, materially better than at the point the smoke embarrassed the suite.

- **The blind fixture that caused `risk-e6h1-014` is closed at the contract level, not patched at
  the call site.** `GitFixture` gained `remoteOnlyBranch(+Sha)`, `ambiguousBranch(+LocalSha/+RemoteSha)`,
  `multiRemoteBranch` and `knownCommitSha`, built by a real second remote in the harness, and 13 new
  contract cases run across `worktreeAdd`, `mergeBase` **and** `diff`. Because they live in
  `GitPort.contract.ts`, any future `GitPort` implementation inherits them. S10b/S10c recorded that
  the new tests fail against the pre-fix implementation — the guards were shown capable of failing.
- **The suites assert properties, not implementation echoes**: `Object.hasOwn` absence checks
  (which `toEqual` cannot make), idempotency `f(f(x)) === f(x)`, field-count assertions against the
  exported field-order constants, "preserves the store's ordering rather than re-sorting it",
  "persists nothing when `runReview` throws", "does not read `process.env`", "prefers the LOCAL ref".
- **Zero deletions in any pre-existing test file** across the whole change.
- **Remaining blind spots**, honestly stated: `container.ts` (F-6) and the deliberately empty `e2e/`.
  I looked for another fixture of the `risk-e6h1-014` shape — a fixture whose setup silently excludes
  the failing case — and found none in the diff's new suites.

## Findings

| Id | Severity | Area | Finding | Evidence | Next action |
|---|---|---|---|---|---|
| F-6 | low (`info`) | test coverage, S9 | **`container.ts` — 218 lines of hot-path composition-root wiring — has no automated test at all.** It is the one module the fake-based suites structurally cannot reach, and it is exactly where `risk-e6h1-006`'s failure class lives. Two behaviours are verified only by reading and by a one-off smoke that used `claude-code`: the `opencode` branch of `createEngine` (its `SENTINEL_OPENCODE_MODEL` unset/blank error message, D8) has **never been executed**, and `ensureHomeRoot`'s lazy `mkdirSync` is exercised only on the `repo add` path. | `src/main/container.ts` has no `__test__` sibling; `grep` finds no importer of `createCliDeps` other than `src/main/cli.ts`. | **Not blocking.** `createCliDeps` already takes `env`, `homeDir` and `io` as injectable options, so this is testable without refactoring, and `[E7.F1.H1]`'s e2e smoke is the story that owns it. Worth one line in the PR description. |
| F-7 | low (`info`) | artifact honesty | **The S10 smoke has no execution-log entry, and the Stage Overview contradicts the risk register.** The table at `execution-log.md:23` still reads `S10 … pending`, while three `state.yaml` risk resolutions (`risk-e6h1-006`, `-013`, `-014`) state that the smoke ran and passed. The smoke transcript — the single piece of evidence that the assembled product works end to end — was not persisted anywhere; only prose summaries of it exist. | `execution-log.md:23` vs. `state.yaml` `open_risks` entries for `risk-e6h1-006`/`-013`/`-014`. | **Not blocking** — the evidence is specific and internally consistent (exact paths, file counts, line counts, terminal states), and its most load-bearing claim was independently corroborated by the S10b/S10c fix it produced. Recommended: S11 records an S10 entry and flips the Stage Overview row before the PR is opened. |
| F-8 | low (`info`) | doc consistency | **A third stale bookkeeping mention exists beyond the two S9b recorded.** `sdd-lite/skill-catalog.md` still asserts "`src/adapters/driving/{cli,tui}` are still empty placeholders and `src/main/cli.ts` is still the `--version` stub from `[E0.F1.H3]`". It is false the moment this change merges, and unlike the `paths.ts` and `project-context.md` mentions it was not recorded as known-stale. It matters slightly more than the others because stage workers read `skill-catalog.md` as the runtime standards digest. | `sdd-lite/skill-catalog.md`, added by 3fc1fef/fdf0477. | **Not blocking.** Sweep it together with the `project-context.md` snapshot at the next bootstrap refresh (or in S11). |

No BLOCKER, no CRITICAL, no architecture-guard violation, no security-relevant finding. Nothing
sensitive is persisted: `persistRun` reduces `failure` to `{stage, message}` and never writes a
`cause`, a stack or an exception object, and `formatErrorLine` never prints one.

## The Two Known Stale Mentions — Should Either Block?

**No, neither should block the PR.**

- **`src/main/paths.ts:12` and `:101`** — the doc-comments justify `resolvePackageRoot` by "the two
  entry depths (`src/main/cli.ts` under `npm run dev` vs. `dist/cli.js` when installed)". After D10
  both *runtime* entrypoints are `dist/cli.js`, so the parenthetical example is stale. **The function
  itself is still correct and still needed** — `paths.test.ts` loads the module from `src/main/`, and
  an installed `dist/cli.js` sits at a different depth from the repo checkout, which a fixed `../..`
  would get wrong. Comment-only, no behaviour, no reader can be misled into a wrong change. A
  two-line correction, best folded into whichever change next touches the file.
- **`sdd-lite/project-context.md:21`, `:62`, `:94`** — a bootstrap snapshot explicitly dated
  `2026-08-23` and labelled "observed in the working tree" at the *start* of `[E6.F1.H1]`. A dated
  snapshot going stale is what dated snapshots do; the file already names its own refresh trigger
  ("E6 runtime deps merged"), which this change fires. Refreshing it is the orchestrator's or
  `sddl-init`'s job, not a code reviewer's blocker.

## The Six Open Risks — Open By Decision, Not Neglect

Each was checked against its owner stage's record; all six carry an explicit reason for staying open,
and all six are things the PR reviewer should be told:

| Risk | Sev | Why it is open, not neglected | Tell the reviewer? |
|---|---|---|---|
| `risk-e6h1-008` | low | `commander@15` declares `engines.node >=22.12.0` vs. the package's `>=22`. S1's scope was "`package.json` … nothing else", and `engines` is *published* metadata. CI (node 22/24) unaffected; only a consumer on 22.0-22.11 would see `EBADENGINE`. Owner: `[E7.F2.H3]` (first publish). | Yes — it is a consequence of D4. |
| `risk-e6h1-009` | medium | D7 authorises **input** normalisation only, so stored objects still carry `owner__repo` in their own `repoName`. Mitigated by construction: every renderer echoes the caller's alias, with three dedicated tests. Open because the *stored field* is still the storage key. | Yes — it constrains any future renderer. |
| `risk-e6h1-010` | low | The same leak on the error path: `RunNotFoundError`'s message is composed in the driven adapter, which only ever sees the storage key, so a failed `runs show owner/repo x` prints `owner__repo/x`. Explicitly decided by **D9** (the two fixes are a fourth core behaviour change or per-error branching that AC-13 forbids). | Yes — it is a user-visible string, decided deliberately. |
| `risk-e6h1-011` | low | `repo add` on a **cloned** repo prints `-` where the spec's Expected-Behavior row promised the resolved local path, because `registerRepo` persists `localPath` only when `--local-path` was given. Not an AC; the clean fix is more core surface, which is unauthorised. This is the change's one literal deviation from the spec's behaviour table. | **Yes — this one especially.** It is the only place the shipped behaviour differs from a spec table row. |
| `risk-e6h1-012` | low | `review`'s outcome block omits the run id (the user must read it off `runDir`'s last segment). Spec-conformant as written — AC-6 requires the directory, not the id. Usability note for `[E6.F1.H2]` / `[E7.F2.H1]`. | Yes, briefly. |
| `risk-e6h1-015` | low | The per-repo parent directory under `worktrees/` is left behind empty after cleanup. The worktree itself is correctly removed; harmless, bounded at one directory per repo, no growth per run. Found by the smoke. | Yes, briefly. |

## Verdict

**pass.** All 14 acceptance criteria are met against code and tests, not against test names. All four
gates are green on independent re-run at exactly the expected numbers. The architecture guards hold
by construction and not merely by exit code — `.dependency-cruiser.cjs` was never touched, `src/core`
imports no Node builtin, no npm package outside `zod`, no adapter and no `src/main`, and every adapter
is instantiated in exactly one file. Scope is intact: every file traces to spec, to D1-D11 or to a
recorded risk, each of the four widenings is as bounded as claimed, and there is no undeclared fifth.
The product is demonstrated working end to end by the smoke, whose most valuable output was finding a
high-severity defect that the test suite has since been taught to catch at the port-contract level.
The three findings are informational, the two known stale mentions are cosmetic, and the six open
risks are each open by a recorded decision.

**Completion is allowed, and this review marks the change `completed`** — `lifecycle_status: completed`.
What remains (`S11`'s closeout declaration, the PR description declaring D1/D5/D7/D11, the mandatory
`history/` entry) is session bookkeeping the workflow contract owns, not implementation.

## Next Action

Close out and open the PR: `[E6.F1.H1] Base command CLI`, `Closes #36`. The description must declare
the **four** authorised widenings (D1 `persistRun`, D5 `resolveReviewRequest`, D7 the alias normaliser
changing `[E5.F2.H2]`'s observable behaviour, D11 the git ref-resolution fix to `[E2.F1.H2]`'s merged
code), list the six open risks — calling out `risk-e6h1-011` as the one deviation from a spec
behaviour row — and note F-6 (`container.ts` is untested) and F-7 (record the S10 entry / flip the
Stage Overview row first). Then write the `history/` entry. Never merge the PR.

---

# QA Report — FINAL (re-run after S12, the PR #73 fix round)

- **Mode**: `final` (second final-mode run; the change was reopened from `completed` by D12)
- **Change**: `e6-f1-h1-cli-base`
- **Primary target**: commit `2633f51` — `git diff f6c6e00..HEAD`, 13 files, +669/-63
  (3 source, 3 render, 1 deps, 1 container, 3 test files, 3 artifacts)
- **Reviewed at**: 2026-08-25
- **Verdict**: `pass` — **completion is allowed; this review returns the change to `completed`**

## Closeout Digest

S12 answers five verified human review findings. All five are genuinely fixed, not merely
present. The one user-impacting fix (`R4-001`) is correct on the path that matters: the happy
path is byte-identical, no `runDir` is fabricated, `result.state` is still never read for an exit
decision, and the rethrow does reach `createCli`'s catch-all. The two questions S12 itself flagged
for QA are answered below: **the two stderr lines do NOT violate AC-13**, and the AC-12 amendment
**is** honest and matches the code — but the execution log says the opposite of what the commit
did, which is this round's only real finding. `R2-004` is behaviour-preserving by construction and
by evidence. The new `R2-001`/`R2-002` tests genuinely catch drift — verified by four independent
mutations, not by reading the claim. No blocker, no high, no medium; five low findings recorded as
info. Nothing under `src/core/**` was touched (`git diff f6c6e00..HEAD -- src/core/` is empty).

## Independent Validation (re-run, not quoted from the execution log)

| Command | Exit | Literal outcome | Expected | Match |
|---|---|---|---|---|
| `npm run check` | **0** | `Checked 143 files in 162ms. No fixes applied.` · `✔ no dependency violations found (97 modules, 229 dependencies cruised)` | 143 / 97 / 229 / 0 violations | exact |
| `npm test` | **0** | `Test Files 38 passed (38)` · `Tests 681 passed (681)` (30.78s) | 681 across 38 | exact |
| `npm run build` | **0** | `ESM dist/cli.js 107.36 KB` · `Build success in 59ms` | success | yes (105.05 → 107.36 KB, the second renderer) |
| `npx vitest run --project adapters src/adapters/driven/git` | **0** | `Tests 40 passed (40)` | 40/40 | exact |

Product smoke deliberately not re-run (handoff instruction; the change is adapter-local and
`R2-004`'s only behavioural surface is the GitPort contract suite, re-run above).

**681 = 674 + 7.** Every pre-existing test still passes and the seven new ones are the claimed
four (`R4-001`) + two (`R2-001`) + one (`R2-002`). The happy path was not disturbed.

**226 → 229 dependencies**, same 97 modules. The three new edges are exactly the ones claimed:
`format-review.ts` → `core/run` (request/result types), `format-review.ts` → `format-error.ts`
(intra-adapter, not adapter-to-adapter), `review-command.ts` → `core/history`
(`PersistRunResult` type). All three point inward or sideways within the same driving adapter;
0 guard violations, and the guards were the enforcement, not the assertion.

## 1. Is `R4-001`'s fix actually correct?

| Property | Verdict | Evidence |
|---|---|---|
| Happy path byte-identical | **yes** | `formatReviewOutcome` builds the identical `scalars` array and now defers to `renderOutcome`, which is the previous body moved verbatim (`REVIEW_OUTCOME_FIELDS.map((key, i) => \`${key}\t${field(scalars[i])}\`)`). No scalar changed, no field added. The 674 pre-existing tests confirm it. |
| Nothing fabricates a `runDir` | **yes** | `formatUnpersistedReviewOutcome` passes `undefined` as the tenth scalar; `field(undefined)` → `-`. Mutation: replacing it with `"/runs/fabricated"` fails the guarding test. |
| `result.state` never read for an exit decision | **yes** | `review-command.ts` reads `result` only to render. The rethrow is unconditional — the same error, whatever the terminal state. No branch on `state`, no exit-code table. |
| The rethrow reaches the catch-all | **yes** | `throw error` inside the action handler rejects `parseAsync`; the error is not a `CommanderError`, so `runProgram` renders it via `formatErrorLine` and returns `1`. Mutation: replacing `throw error` with `return` fails the exit-code test. |
| The unpersisted fields equal what `persistRun` would have recorded | **yes** | `persist-run.ts` derives `engine = result.engineName ?? runRequest.engineName`, `harness = runRequest.harnessType`, `durationMs = Math.max(0, now() - startedAtEpochMs)` — the renderer mirrors all three exactly, and `R2-003` now guarantees the same clock feeds both ends. |
| The stderr diagnostic is truthful | **yes** | `run-store-fs.ts` stages into a temp dir and `rename`s atomically, with best-effort `rm` of the staging dir in its own catch. On failure nothing is visible under the final dir, so "no history was written and `sentinel runs show` will not find it" is literally accurate. |

## 2. AC-13 and the two stderr lines — explicit judgement

**Not a violation.** AC-13 constrains *how a core typed error renders*: "one-line messages on
stderr with no stack trace and no raw exception object". The rethrown `RunPersistenceError` renders
as exactly one line through `formatErrorLine`, with no stack, no `cause` chain and no raw object —
the guarantee is intact and asserted (`err[1]` is compared with `toBe(writeFailed.message)`).
AC-13 says nothing about how many stderr lines a *command* may write, and AC-10 explicitly assigns
"diagnostics, warnings and error messages" to stderr, which is exactly what the first line is. A
reading in which AC-13 caps a command's total stderr output would also forbid `commander`'s own
multi-line usage errors, which AC-2 requires. S12's reading is the correct one.

Two qualifications, neither blocking (recorded as F-11 below): the two lines are partly
redundant — `RunPersistenceError`'s message already says the run could not be persisted — and the
second line discloses the attempted run directory while stdout shows `runDir -`. A user reading
both is told a path exists and does not exist. It is defensible (the path was *attempted*), but it
is the kind of thing `[E6.F1.H2]`'s exit-code/diagnostic pass should tidy.

## 3. Is the AC-12 amendment honest?

**The amended text matches the code**, clause by clause: outcome rendered on stdout (yes),
`runDir` shows `-` (yes), one diagnostic on stderr (yes), exit non-zero (yes, `1`), no sixth
terminal state (yes — `TerminalState` is untouched, `src/core/` has an empty diff). The decision is
recorded as **D13** (level B, `decided_by: user`) with context, rationale and consequences, and the
consequence line explicitly anticipates the spec edit. Amending an AC mid-change is therefore
recorded, not silent — the correct handling.

**But the audit trail contradicts itself** (F-9): the same commit's execution-log entry closes with
"`spec.md`'s AC-12 wording still predates D13's boundary case … Updating spec text was not in S12's
artifact scope", while that commit *does* amend AC-12. A reader of the log would believe the spec
is stale when it is not.

## 4. Is `R2-004` behaviour-preserving?

Yes, and by construction rather than by assertion. The old body initialised `directFailure` to a
synthetic "returned no revision" `Error`, overwrote it in `catch`, and fell through to the remote
scan. The split reproduces both branches exactly: `revParseCommit` returns `{ sha }` only for a
non-empty `stdout`, returns the *same* synthetic error for an empty one, returns the raw throwable
from `catch`, and never throws. `resolveCommitish` then calls `resolveRemoteTrackingCommit` with
that failure as `cause`. Semantics verified individually:

- **Local-over-remote precedence** — unchanged: still `git rev-parse --verify <commitish>^{commit}`
  first, git's own DWIM order untouched.
- **Ambiguity rejected, not guessed** — unchanged: step 2 still requires exactly one
  `refs/remotes/<remote>/<name>` match; zero and 2+ both reject.
- **Per-method error class** — unchanged: `ErrorClass`/`context` travel into step 2, which is the
  only thrower.
- **`--detach` receives a resolved SHA** — unchanged: `worktreeAdd` still resolves first, then
  passes `revision` to `worktree add --detach`.
- No contract case edited (`git diff --stat` lists only `git-cli.ts` under `driven/git`), 40/40
  contract tests pass on re-run.

## 5. Would the new `R2-001`/`R2-002` tests catch drift?

Yes — verified by mutation, in both directions, rather than by reading the claim. Tree restored
byte-identical after each (`git status --porcelain` empty).

| Mutation | Result |
|---|---|
| Swap `"url"`/`"baseBranch"` in `REPO_LINE_FIELDS` (constant drifts) | `Tests 1 failed` |
| Swap `field(summary.baseRef)`/`field(summary.targetRef)` in `formatRunSummaryLine` (renderer drifts) | `Tests 1 failed` |
| Replace `throw error` with `return` in `review-command.ts` | `Tests 1 failed` |
| Fabricate `"/runs/fabricated"` as the tenth scalar | `Tests 1 failed` |

The reviewer's complaint is answered: the assertions bind each declared field *name* to the value
at its position, so neither side can move alone. Adding a field to a constant is caught even
earlier — the tests' `Record<(typeof FIELDS)[number], string>` makes it a `tsc` error, so
`npm run check` fails before the test does.

## 6. Regression and scope

- `git diff f6c6e00..HEAD -- src/core/` → **empty**. No core file, no `TerminalState`, no port.
- No config file touched: `.dependency-cruiser.cjs`, `tsconfig.json`, `biome.json`,
  `tsup.config.ts`, `package.json` are all absent from the diff. No dependency added.
- No pre-existing test assertion deleted. The one assertion dropped during authoring
  (`not.toContain("at ")`) was in a *new* test and is disclosed in the log; it was dropped for a
  real reason (the fixture message literally contains " at ") and the whole-array equality around
  it is stronger.
- `R2-003` is exactly one shared `now` in `container.ts`, handed to both `persistRun`'s deps and
  `CliDeps.now`. Correct, and it is what makes the unpersisted `durationMs` comparable.

## Findings

All `low`, all recorded as **info**. None blocks completion.

| Id | Severity | Finding | Evidence |
|---|---|---|---|
| F-9 | low | The S12 execution-log entry states AC-12's spec text was *not* updated and that doing so "was not in S12's artifact scope", but the same commit amends AC-12. The audit trail contradicts the commit it documents. | `execution-log.md` last bullet vs `git diff f6c6e00..HEAD -- .../spec.md` |
| F-10 | low | The amended AC-12 sentence appends D13's clause *before* the pre-existing parenthetical, so `(unknown command/flag, unregistered repo, unreadable config, unknown engine/harness)` now reads as enumerating the persistence case rather than "usage or invocation failure". The row's verification column also still names only the two original tests, not the four new ones. | `spec.md` AC-12 |
| F-11 | low | A persistence failure prints two partly redundant stderr lines, the second disclosing the attempted run directory while stdout shows `runDir -`. Not an AC-13 violation (see §2); a UX tidy for `[E6.F1.H2]`. | `review-command.ts` diagnostic + `RunPersistenceError` message |
| F-12 | low | `renderRecord` in `format-repos.ts` and the mapping in `format-runs.ts` bind values to fields by *length* only, unlike `format-review.ts`'s `renderOutcome`, which uses the key. Drift is still caught (by `tsc` and the new tests, both verified), but a value added without a declared field is silently dropped rather than failing. | `format-repos.ts` `renderRecord`, `format-runs.ts` |
| F-13 | low | `state.yaml`'s `artifacts.review_ledger` points at `review-ledger.md`, which has never existed for this change — the five findings came from PR threads, not a ledger run. Pre-existing, not S12's doing. | `ls` in the change directory |

**Carried forward**: F-6 (`container.ts` has no automated test; the `opencode` branch of
`createEngine` has never executed) remains open for `[E7.F1.H1]`. Its shape grew by one line —
`R2-003`'s shared clock binding lives in `container.ts` and is likewise verified only by reading.
F-7 and F-8 are unaffected by S12.

## Known Open Risks

Unchanged by S12: 9 resolved, 6 open by recorded decision (`-008`, `-009`, `-010`, `-011`, `-012`,
`-015`). S12 touched no risk surface — it added no new external behaviour beyond D13's documented
boundary case, which is itself a recorded decision rather than a risk.

## Verdict

`pass`. The fix round fixes what it claims to fix, and it did not break the thing a fix round
usually breaks: the happy path is provably untouched (674/674 pre-existing tests, an unchanged
renderer body, an empty core diff) and the newly complex error path is pinned by four tests that
were each shown to fail under mutation. The two questions S12 escalated are answered — AC-13 holds,
and the AC-12 amendment is honest — leaving one documentation contradiction (F-9) and four cosmetic
notes, none of which is a defect in shipped behaviour.

**Completion is allowed, and this review returns the change to `completed`** —
`lifecycle_status: completed`.

## Next Action

Answer and resolve the five PR #73 review threads (the orchestrator's job — this stage posted
nothing to GitHub and performed no git action), quoting the evidence above for `R4-001` and
`R2-004`. Fix F-9 while doing so: the S12 execution-log bullet should say the AC-12 amendment
*was* made, per D13. Then update the `history/` entry for this session. Never merge the PR.
