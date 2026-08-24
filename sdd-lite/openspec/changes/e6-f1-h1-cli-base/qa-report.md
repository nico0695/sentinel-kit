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
