# Plan

## Execution Digest

- change_name: e7-f2-h2-license
- objective: new-feature
- route: continue-lite
- digest_summary: Apply MIT licensing across four files (new `LICENSE`, `package.json` license field, PRD section 8 list split, two README lines) with the exact text in design.md sections 1-4. No `src/` change.
- stage_plan_digest: One code-touching stage S1 (edits plus validation); prerequisite `npm ci` is an environment step, not a file change.
- validation_digest: AC-6 greps, `npm run check`, `npm test`, `npm pack` (LICENSE listed, packed license MIT), `git status --porcelain` limited to the touch set (AC-9).

## Summary

- change_name: e7-f2-h2-license
- objective: new-feature
- route: continue-lite

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required |
|---|---|---|---|---|---|---|
| S1 | Apply design sections 1-4 verbatim: create `LICENSE`; add `"license": "MIT",` after `"version"` in `package.json`; restructure PRD section 8 (Taken 1-4, 6; Open 5, 7, 8, HTML-comment separators); replace README lines 19 and 61. Then run the full validation set. | none (prereq: `npm ci` if `node_modules/` is absent) | `LICENSE`, `package.json`, `docs/prd-sentinel.md`, `README.md` | See Validation Strategy | yes (docs and metadata only) | yes (`stage_approval`; satisfied by mode auto only for pacing, gate still recorded) |

## Validation Strategy

Run after S1 edits, in this order:

1. Prerequisite: `npm ci` when `node_modules/` is absent (no file change; lockfile must stay untouched).
2. AC-1/AC-2: `head -3 LICENSE`; `grep -ci sdd-lite LICENSE` is 0; `node -p "require('./package.json').license"` prints `MIT`; `package.json` diff is one added line.
3. AC-5 (source inspection): every PRD list whose first number is not `1` is preceded by a blank line, an HTML comment and a blank line; unchanged item text is byte-identical.
4. AC-6: (a) `grep -l MIT LICENSE package.json docs/prd-sentinel.md README.md` lists all four; (b) the "not yet decided" / "MIT) vs. private" grep per spec with its documented exclusions has no hits; (c) no other license is named in the touch set.
5. AC-7: `npm run check` and `npm test` pass.
6. AC-8: `npm pack --dry-run` lists `LICENSE`; packed `package.json` has `license: MIT` (`npm pack --json --dry-run`, or pack into the scratchpad and `tar -xOzf <tgz> package/package.json`). Remove any tarball afterwards.
7. AC-9: `git status --porcelain` shows only the four files plus the sdd-lite change directory (and history entry if written).

## Dependencies And Sequencing

- Single stage; edits first, validation second, inside S1. Edit order is irrelevant across files.
- Any failed check is fixed inside S1 within the four-file scope; anything beyond it returns `partial` or `blocked`.

## Planner Stop Note

- Objective is `new-feature`, not `planner`: next step is executor approval for S1. Not a macro-plan route.

## Approval Notes

- No `Needed Before: execution` rows in design.md; nothing to surface.
- Session mode is auto and the user indicated advancement; phase_validation checkpoint skipped. S1 still needs `stage_approval` before the executor runs.
- Active low risks: risk-e7f2h2-001 (CLAUDE.md "vendored" wording vs. MIT covering `sdd-lite/`, deferred by user), risk-e7f2h2-002 (biome does not cover LICENSE/README/PRD; mitigated by AC-6 greps), risk-e7f2h2-003 (`sdd-lite/project-context.md` line 121 stale; refreshed by `sddl-init`, not an executor target).
