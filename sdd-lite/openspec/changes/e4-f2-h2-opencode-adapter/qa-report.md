# QA Report

## Closeout Digest

- change_name: e4-f2-h2-opencode-adapter
- mode: stage
- target: ST-3 (`opencode-adapter.ts` orchestration + `engines/index.ts` barrel export)
- verdict: **pass**
- lifecycle effect: does not close the change; ST-4 (test suite) and ST-5 (manual verification + final gate) remain

## Scope Reviewed

`src/adapters/driven/engines/opencode/opencode-adapter.ts` (new) and `src/adapters/driven/engines/index.ts` (modified), against `spec.md`'s AC-1 through AC-7 and AC-19, `design.md`'s `review()` pseudocode and `OPENCODE_CONFIG` lifecycle rationale, and the merged `src/adapters/driven/engines/claude-code/claude-code-adapter.ts` as the structural sibling. AC-8 through AC-18 (envelope logic) were reviewed only at the call-site level here — their own correctness was already verified in ST-1's fixture-based scratch test and is out of this stage's scope.

## Evidence

- **Independent re-run**, not trusted from the executor's report alone: `npm run check` → `Checked 90 files in 85ms`, `tsc --noEmit` clean, `✔ no dependency violations found (66 modules, 126 dependencies cruised)`. `npm test` → `17 passed`, `250 passed` — unchanged from baseline.
- `git diff --stat HEAD~1 HEAD -- src/`: exactly `index.ts` (+8/-3) and the new `opencode-adapter.ts` (+137) — matches the approved ST-3 scope, no leak.
- `git log` on `errors.ts`/`envelope.ts`/`permission-config.ts`/`process-runner.ts`: last touched by ST-1/ST-2 commits only — ST-3 did not modify any sibling file, confirming true composition rather than incidental rework.
- Source read directly (not paraphrased): the full 137-line `opencode-adapter.ts` was read in this review, not sampled.

## Findings

Full-file inspection targeted specifically at what the deleted throwaway smoke test could NOT have exercised:

| # | Check | Result |
|---|---|---|
| 1 | `config.cleanup()` awaited on every exit path, including both pre-flight failure branches (reject and non-zero exit) | **Confirmed.** Single outer `try { ... } finally { await config.cleanup(); }` wraps the entire body from the `env` construction through `return extractOutcome(events)`. Both pre-flight failure throws are inside the inner `try`, which is itself inside the outer `try` — `finally` fires regardless of which of the four possible throw points (pre-flight reject, pre-flight non-zero, real-invocation reject, `extractOutcome` throw) fires, or on a clean resolve. |
| 2 | `env` object shared (not rebuilt) between the pre-flight and real-invocation calls | **Confirmed.** `const env = { OPENCODE_CONFIG: config.path };` is declared once and the identical binding is passed at both call sites (lines 106 and 126) — not two independently-constructed literals that could drift if the file were edited carelessly later. |
| 3 | `PREFLIGHT_TIMEOUT_MS` vs `request.timeoutMs` used in the correct calls | **Confirmed.** Pre-flight call uses `PREFLIGHT_TIMEOUT_MS` exclusively; the real invocation uses `request.timeoutMs` exclusively. No cross-wiring. |
| 4 | `createDenyConfigFile()` itself failing (e.g. `mkdtemp` ENOENT/EMFILE) — not wrapped by the `try/finally`, since `config` doesn't exist yet | **Low-severity observation, not a defect.** A creation failure propagates as a raw Node `fs` error rather than one of the three typed classes. This is outside spec.md's stated AC set (spec never defines behavior for temp-file creation failure) and still satisfies AC-23's actual requirement (`rejects.toBeInstanceOf(Error)` — a Node `fs` error is an `Error`). No cleanup is skipped incorrectly, since nothing was created to clean up. Recommend ST-4 add (or explicitly decline, with a one-line rationale in `execution-log.md`) a test for this path so it's a documented decision rather than silently untested — not a blocker. |
| 5 | Diff surface matches AC-26-equivalent scope boundary | **Confirmed** — see Evidence above. |
| 6 | Doc-comment / structural parity with the merged claude-code adapter (naming, factory shape, "every throw stays inside the async body" discipline) | **Confirmed.** No bare `throw` outside the `async review` function body; structure mirrors `claude-code-adapter.ts` one-for-one plus the one extra step (deny-config lifecycle) design.md called for. |

No `medium` or `high` severity findings. One `low` item (#4), which is an informational note for ST-4 to consciously accept or cover, not a correction to make now.

## Verdict

**pass.** ST-3's orchestration correctly implements spec.md's AC-1–7/AC-19 and design.md's pseudocode with no deviation found on independent, full-file inspection. The one low-severity observation (creation-failure path outside the typed-error family) does not block continuation — it's a note for ST-4's test-writing to either cover or explicitly decline.

## Next Action

Proceed to ST-4 (the test suite covering all 24 ACs) on user approval. Recommend ST-4 include a one-line acknowledgment (test or documented decline) of finding #4 so it isn't silently dropped. No replanning or correction stage needed.
