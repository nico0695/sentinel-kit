# Design

## Routing Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (story `[E7.F1.H1]`, #41)
- route: continue-lite
- digest_summary: >-
  One new `e2e/` root with a two-test smoke suite driving `createCli(createCliDeps({...})).run(argv)`
  over a hermetic temp git repo and the shipped FakeEngine, reached through one optional,
  test-only `engineOverride` field threaded through `CliDepsOptions` -> `WiringGraphOptions`
  and applied with `??` inside the existing `runReview` thunk. Two config-file edits.
- affected_areas_digest: >-
  New: `e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts`. Modified: `src/main/container.ts`
  (two optional fields + one `??`), `tsconfig.json#include`, `biome.json#files.includes`.
  Untouched: `src/core/**`, all adapters, `EngineNameSchema`, `.dependency-cruiser.cjs`,
  `npm run check` script, CI workflow.
- interfaces_digest: >-
  `CliDepsOptions.engineOverride?: ReviewEngine` (public, `@internal`, test-only) and the private
  `WiringGraphOptions.engineOverride?: ReviewEngine`; consumed as
  `engine: options.engineOverride ?? createEngine(request.engineName, env)`.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- design_status: ready-for-plan (Q8 decided; three A-level artifact-assertion corrections recorded
  in Open Technical Questions — none changes scope, all need acknowledging at QA)

## Design Overview

**D-1 — Q8, the seam (extend, do not restructure).** Add `engineOverride?: ReviewEngine` to BOTH
`CliDepsOptions` (public surface the smoke calls) and the private `WiringGraphOptions` (the only
reader). No `extends` refactor of the three options interfaces, no new shared base type,
`TuiDepsOptions` untouched (the TUI is out of scope, spec Out Of Scope). Rationale: `createCliDeps`
already forwards its whole `options` object into `createWiringGraph`, so declaring the field on both
ends is a two-line diff that makes the value flow with zero call-site change; an `extends` chain
would rewrite exported interface declarations and their doc-comments for no runtime gain, and a
shared base would leak a private wiring type into the public surface. `exactOptionalPropertyTypes`
is on, so the field is a plain optional and callers must omit it rather than pass `undefined`.

**D-2 — interposition point.** Inside `createWiringGraph`'s `useCases.runReview` thunk only:
`engine: options.engineOverride ?? createEngine(request.engineName, env)`. Consequences, all
intended: (a) with the field omitted the expression is `createEngine(request.engineName, env)`
verbatim — per-invocation construction (module doc-comment property 2), the `UnknownEngineError`-
adjacent `default:` throw and the `SENTINEL_OPENCODE_MODEL` failure path are byte-identical (AC-7);
(b) with it present `??` short-circuits, so the fake engine never demands an opencode model;
(c) `createEngine` itself is not touched — it stays a pure name-to-constructor lookup, not a
seam-aware function. `sentinelPaths()` is still called exactly once (property 1): the field is inert
data on the options object and nothing about path derivation moves.

**D-3 — where "test-only" is written.** Full contract as a TSDoc block on
`CliDepsOptions.engineOverride`, tagged `@internal`, stating: injected only by `e2e/`, never reachable
from argv/config/env, `EngineNameSchema` deliberately unchanged (d-003), and that omitting it must
reproduce today's behavior. One-line TSDoc on the `WiringGraphOptions` twin pointing back to it, and
a one-line comment at the `??` site naming d-003 and AC-7. No fourth numbered property is added to
the module doc-comment: that list enumerates invariants, and an optional inert field is not one.

**D-4 — suite shape (AC-4, AC-12).** `e2e/review-flow.test.ts`, two `it`s in one file:
S2+S1+S3+S4 as one continuous happy-path test (`repo add` -> `repo list` -> `review` -> `runs list`
-> `runs show`, each an argv array through one `run(argv)` call, deps rebuilt per leg from the same
`SENTINEL_HOME`), and S5 as a second test scripting `VERDICT: request-changes` and asserting exit
code `1`. Harness `quick` (`skills: []`, so the ProcessRunner stage spawns nothing, N-4). Engine name
resolves to the `GlobalConfigSchema` default `claude-code` and is recorded as such in
`metadata.json#engine` even though the FakeEngine ran — the smoke must NOT assert an engine name;
that is the honest cost of the override seam.

**D-5 — fixture (`e2e/support/hermetic-git.ts`).** Restated inside `e2e/`, not imported from
`src/**/__test__/`, with a header comment naming
`src/adapters/driven/git/__test__/git-cli.test.ts` as its origin. Exports one
`createHermeticRepo()` returning `{ root, repoPath, baseBranch: "main", featureBranch }` plus the
`HERMETIC_GIT_ENV` constant: `realpathSync(mkdtempSync(join(tmpdir(), "sentinel-e2e-")))`,
`git init --bare -b main`, clone, per-invocation `-c user.email` / `-c user.name`, a seed commit on
`main`, a `feature/*` branch with one modified file, both pushed; env pins `GIT_CONFIG_GLOBAL` and
`GIT_CONFIG_SYSTEM` to `/dev/null`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`. Not a `.test.ts`
file, so the `e2e` vitest project does not collect it.

**D-6 — isolation and teardown (AC-3, S6).** Two temp roots per test — the git fixture and
`mkdtempSync(... "sentinel-home-")` passed as `env: { SENTINEL_HOME: <root> }` to `createCliDeps`
(never `process.env` mutation; `homeDir` is also passed a dead temp path so a `SENTINEL_HOME`
regression cannot silently fall back to a real home). Unconditional `afterEach`:
`rmSync(root, { recursive: true, force: true })` on both, in a `try`-free sequence so a failed
assertion still cleans up. Every asserted path is built by `join(sentinelHome, ...)`, which satisfies
AC-3's "assert under the temp root" by construction.

**D-7 — repo identity.** `repo add https://example.test/acme/widget.git --local-path <tmp repo>
--base-branch main --harness quick`. The URL is never dialed (`registerRepo` skips `git.clone` when
`localPath` is set) and `deriveAlias` yields the deterministic alias `acme/widget`; runs therefore
land under `<SENTINEL_HOME>/runs/acme/widget/<ts>/` (`repoName` is the argv alias, slash included,
and `mkdir -p` handles the nesting). `--base-branch main` also skips `git.defaultBranch`, keeping the
flow fully offline.

**D-8 — AC-11 mutation protocol.** Executor applies one mutation at a time, runs
`npx vitest run --project e2e`, records the observed failing assertion, then `git checkout --
<file>` and re-runs green; the tree is left clean (`git status`). Named points, on different layers:
- **M1 (driven storage):** in `run-store-fs.ts` write the metadata file as `meta.json` instead of
  `metadata.json` — expect S3's existence/content assertion and `runs show` (S4) red.
- **M2 (composition root):** in `createWiringGraph` hand `runReview` `worktreesDir: paths.clonesDir`
  — expect the happy path to leave exit code 0 (this is exactly the property-1 class of bug that no
  fake-based unit test can catch).
- **M3 (driving CLI, optional third):** make `resolveReviewExitCode` return `0` for
  `request-changes` — expect S5 red while S2 stays green, proving the negative case earns its place.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `e2e/review-flow.test.ts` (new) | Two-test smoke; S1-S4 in one test, S5 in the second | low |
| `e2e/support/hermetic-git.ts` (new) | Self-contained hermetic git fixture + `HERMETIC_GIT_ENV`, origin comment | low |
| `src/main/container.ts` | `engineOverride?: ReviewEngine` on `CliDepsOptions` (+ `@internal` TSDoc) and on `WiringGraphOptions`; `??` at the engine construction site | medium — only production file touched; guarded by AC-7 |
| `tsconfig.json#include` | `["src", "e2e"]` (d-004) | low |
| `biome.json#files.includes` | add `"e2e/**"` (d-004) | low |
| `.dependency-cruiser.cjs`, `package.json#scripts.check` | UNCHANGED — `depcruise src` stays (N-2) | low |
| `.github/workflows/*.yml` | UNCHANGED — `npm test` already runs all projects (AC-10) | low |

## Interfaces, Data, And State

- `CliDepsOptions`: `+ readonly engineOverride?: ReviewEngine;` — public, `@internal`, test-only.
- `WiringGraphOptions` (private): `+ readonly engineOverride?: ReviewEngine;`.
- Consumption: `runReview: (request) => runReview(request, { git, engine: options.engineOverride ?? createEngine(request.engineName, env), harnesses, worktreesDir: paths.worktreesDir, processRunner })`.
- `createEngine`, `EngineNameSchema`, `CliDeps`, `TuiDeps`, `TuiDepsOptions`, `RunRecord`, `metadata.json` shape: unchanged.
- Engine script: `createFakeEngine({ ok: true, result: { output: "<markdown ending in `VERDICT: approve`>" } })` (single outcome repeats per call); the negative test scripts `VERDICT: request-changes`.
- Asserted state after the happy path: `<HOME>/repos.yaml` contains `acme/widget`; `<HOME>/runs/acme/widget/<id>/metadata.json` parses with `repo: "acme/widget"`, `targetRef: <feature branch>`, `state: "ok"`, `verdict: "approve"`; `result.md` equals the scripted `output` exactly; `prompt.md` exists and is non-empty; `<id>` equals the id `runs list` printed.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Q8: declare `engineOverride` on both interfaces | **chosen** | Two-line diff; `createCliDeps` already forwards `options` wholesale; keeps `WiringGraphOptions` private |
| Q8: `CliDepsOptions extends WiringGraphOptions` | rejected | Rewrites exported declarations and their docs, exports a wiring-private concept, no runtime gain |
| Q8: extra parameter on `createEngine(name, env, override)` | rejected | Turns a pure lookup into a seam-aware function; the override is a wiring concern, not an engine-selection one |
| Q8: resolve the engine once at graph build when overridden | rejected | Two construction timings for one field; erodes module doc-comment property 2 |
| Fixture imported from `src/**/__test__/` | rejected (Q3, spec) | e2e owns its world; duplication bounded (~25 lines) and pinned by the origin comment |
| Three-plus scenarios / failure matrix | rejected | AC-12, N-3 |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Q8 seam threading | Whole change hinges on it | design | **resolved (A) — D-1/D-2/D-3** |
| A-1: `validations/` is NOT created for the `quick` harness | Spec S3 lists `validations/` among the asserted artifacts, but `run-store-fs.ts:237-240` creates it only when `validationOutput` is non-empty, and `repo add` exposes no `--validations` flag, so with `quick` it never exists | plan | **resolved (A)** — assert `validations/` **absent**; consistent with N-4 (validations deliberately do not run). Seeding validations would require hand-writing `repos.yaml`, breaking AC-4's "every leg is argv". QA must accept this as the S3 reading, not a gap |
| A-2: `config.yaml` is never written by any CLI path | The envelope's artifact list includes `<HOME>/config.yaml`; only `ConfigStore.writeConfig` creates it and no command calls it, so it will not exist after `repo add` | plan | **resolved (A)** — do not assert `config.yaml`; assert `repos.yaml` only. Optionally assert `config.yaml` absent to pin the fact |
| A-3: `metadata.json` carries no `id` field | AC-5 asks for "the run id" in `metadata.json`; `serializeRunMetadata` emits `version/repo/startedAt/durationMs/...` — the id IS the directory name | plan | **resolved (A)** — satisfy AC-5 by asserting the directory name equals the id `runs list` printed, plus `repo`/`targetRef`/`state` from `metadata.json` |
| A-4: `src/main` has no `container` test today (only `paths.test.ts`) | AC-7's "existing wiring tests still pass unmodified" is vacuously true; the seam's no-behavior-change claim rests on the `??` shape and review, not on a regression test | qa | **open (informational)** — do not add a container unit test in this story (scope); QA verifies by reading the diff and confirming `git diff src/main/container.ts` is limited to the three documented edits |

## Approval Notes

- Blast radius: 2 new files, 3 edited lines-of-substance in `src/main/container.ts`, 2 config edits.
  No core change, no adapter change, no user-facing surface change, no CI change.
- The design settles Q8 at A level as instructed and does not reopen d-003 or d-004.
- A-1/A-2/A-3 are precision corrections to three artifact assertions the spec listed; they narrow how
  AC-5/S3 are demonstrated without changing what the smoke covers. `sddl-plan` should carry them into
  the validation strategy so the executor does not write assertions that cannot pass.
- Recommended next stage: `sddl-plan`.
