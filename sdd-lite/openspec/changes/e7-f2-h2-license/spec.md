# Spec

## Routing Digest

- change_name: e7-f2-h2-license
- objective: new-feature (repo metadata and docs; no `src/` change)
- route: continue-lite
- digest_summary: Apply MIT (d-001) consistently in four files: new `LICENSE`, `package.json` `license` field, PRD §8 decision 6 moved from Open to Taken, README wording. Closes PRD open decision 6 before the E7.F2.H3 publish.
- scope_digest: in = `LICENSE`, `package.json` (one field), `docs/prd-sentinel.md` §8, `README.md` lines 19 and 61. Out = `repository`/`author` fields (#45), CLAUDE.md, `src/`, per-file headers, `sdd-lite/` files, history, backlog, `create-issues.sh`, visibility.
- acceptance_digest: AC-1..AC-4 file content; AC-5 PRD decision identifiers stay 5/6/7/8 when rendered; AC-6 grep consistency check; AC-7 `npm run check` + `npm test` green; AC-8 `npm pack --dry-run` lists `LICENSE` and packed `package.json` has `license: MIT`; AC-9 touch set limited to the four files.

## Summary

- change_name: e7-f2-h2-license
- objective: new-feature
- route: continue-lite
- shape: full artifact, kept compact (proportional-spec conditions not met: the contradiction gate is `resolved`, not `clear`, and the change touches four surfaces).

## Scope Boundary

### In Scope

- `LICENSE` (new, repo root): the standard MIT License text (SPDX `MIT` template, unmodified body), holder line exactly `Copyright (c) 2026 nico0695` (d-002). No mention of `sdd-lite/`, no carve-out, no extra notice (d-003).
- `package.json`: add `"license": "MIT"` as a top-level field. No other field changes; `files` stays as is (npm always packs `LICENSE`).
- `docs/prd-sentinel.md` §8: decision 6 (License) moves from **Open** to **Taken in this version**, rewritten as a taken decision: MIT; rationale = repo already public (d-004), public npm release of `@nico0695/sentinel` planned in E7.F2.H3, runtime deps permissive (MIT/ISC); closed in `[E7.F2.H2]`. It keeps identifier 6 (see AC-5). Decisions 5, 7, 8 keep their text and identifiers. PRD title/version line (`v0.3`) unchanged.
- `README.md`: line 61 "License is not yet decided (tracked for the wrap-up epic)." replaced by a sentence stating the project is MIT-licensed with a relative link to `./LICENSE`; line 19 drops "licence" from the remaining-E7 list (rest of the sentence unchanged).

### Out Of Scope

- `package.json` `repository` / `author` fields (d-005, deferred to E7.F2.H3 / #45).
- `CLAUDE.md` (both the "vendored third-party" wording, d-003, and the line 13 "Remaining MVP work" status list, which only changes on epic-level facts).
- `sdd-lite/project-context.md` line 121 ("decision 6 ... unresolved"): a bootstrap file refreshed by `sddl-init`, not edited by an executor; becomes stale (risk-e7f2h2-003).
- `docs/backlog-mvp-sentinel.md` and `create-issues.sh`: their "close open decision 6 / MIT vs private" text is the story definition and stays as historical wording.
- `history/`, `sdd-lite/openspec/` artifacts, `src/`, `e2e/`, tests, per-file headers, THIRD-PARTY notices, repo visibility (already public, d-004).

### Non-Goals

- No license audit of dependencies beyond the recorded MIT/ISC observation.
- No PRD version bump or history-line edit.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Reader opens repo root | `LICENSE` present, MIT text, holder `nico0695`, year 2026 | GitHub license detection shows MIT |
| Reader reads PRD §8 | License listed under Taken as decision 6 with MIT + rationale; Open shows 5, 7, 8 | backlog "close open decision 6" still resolves to the right item |
| Reader reads README | Conventions section says MIT with link to `LICENSE`; E7 remaining list no longer lists licence | lines 19, 61 |
| `npm pack` for E7.F2.H3 | Tarball contains `LICENSE`; packed manifest declares `MIT` | |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `LICENSE` exists at repo root with the standard MIT body and first lines `MIT License` / blank / `Copyright (c) 2026 nico0695` | `head -3 LICENSE`; diff body against SPDX MIT template; `grep -ci sdd-lite LICENSE` = 0 | must |
| AC-2 | `package.json` has top-level `"license": "MIT"`; no other key added, removed, or changed | `node -p "require('./package.json').license"` = `MIT`; `git diff package.json` shows one added line | must |
| AC-3 | PRD §8 Taken contains a License decision 6 stating MIT, with the rationale (public repo, planned public npm release, permissive deps) and closure in `[E7.F2.H2]`; Open no longer contains a License item | `sed -n '/^## 8/,/^---/p' docs/prd-sentinel.md` | must |
| AC-4 | README line 61 states MIT with a link `(./LICENSE)`; line 19 no longer lists "licence"; no other README line changed | `git diff README.md` touches exactly two lines | must |
| AC-5 | PRD decision identifiers stay stable when rendered as GitHub markdown: License displays as 6, `sentinel open` as 5, engine spike as 7, context spike as 8; decisions 1-4 unchanged | inspect source and rendered view; CommonMark renumbers a list from its first item, so the mechanism must not rely on literal item numbers inside one list (design decides) | must |
| AC-6 | Consistency check: (a) `grep -l MIT LICENSE package.json docs/prd-sentinel.md README.md` lists all four; (b) `grep -rniE "not yet decided\|MIT\) vs\. private" --exclude-dir={node_modules,.git,history,sdd-lite,dist} --exclude=backlog-mvp-sentinel.md --exclude=create-issues.sh .` returns no hits; (c) no file in the touch set names a license other than MIT | run the greps; (b) exclusions are the out-of-scope historical texts | must |
| AC-7 | `npm run check` and `npm test` pass after the change | run both | must |
| AC-8 | `npm pack --dry-run` lists `LICENSE`, and the packed `package.json` has `license: MIT` | `npm pack --dry-run 2>&1 \| grep LICENSE`; `npm pack --pack-destination <scratch>` then `tar -xOzf <tgz> package/package.json` and check `license` | must |
| AC-9 | Touch set is exactly `LICENSE`, `package.json`, `docs/prd-sentinel.md`, `README.md` (plus sdd-lite change artifacts and the session history entry) | `git status --porcelain` | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| risk-e7f2h2-001 CLAUDE.md "vendored third-party" vs. repo-wide MIT | low | user choice d-003; follow-up candidate |
| risk-e7f2h2-002 biome covers only `package.json` of the touched files | low | mitigated by AC-6 grep check |
| risk-e7f2h2-003 `sdd-lite/project-context.md` still calls decision 6 unresolved | low | refresh on next `sddl-init`; not an executor write |
| Moving vs. in-place edit of decision 6 | low | moving matches the proposal and the "Taken/Open" headings; AC-5 protects existing references |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Exact PRD wording and placement of decision 6 (from proposal) | §8 numbering coherence | design (rendering mechanism only) | resolved: placement under Taken after 4, identifier 6 kept, content per In Scope; A-level (claude). Markdown mechanism that satisfies AC-5 is a design choice |
| Other docs mentioning the license (from proposal) | consistency AC | — | resolved: repo-wide grep found README 19/61, PRD 284, CLAUDE.md 13, backlog 371-375, `create-issues.sh` 369-372, `sdd-lite/project-context.md` 107/121, one history entry; dispositions in Scope Boundary; A-level (claude) |
| CLAUDE.md "vendored third-party" vs. LICENSE covering `sdd-lite/` (from proposal) | wording inconsistency | — | resolved: no change, user decision d-003; tracked as risk-e7f2h2-001 |
| PRD version bump | doc history | — | resolved: no bump (single-decision closure, not a PRD revision); A-level (claude) |

## Approval Notes

- Phase validation skipped: session mode `auto`, user already indicated advancement, no open question or risk above `low`.
- Decisions d-001..d-005 (user) carried unchanged.
