# Proposal

## Routing Digest

- change_name: e7-f2-h2-license
- objective: new-feature (repo metadata and docs; no `src/` change)
- route: continue-lite
- digest_summary: Apply the MIT license decided by the user and make LICENSE, `package.json`, the PRD and the README agree. Closes PRD §8 open decision 6 before the E7.F2.H3 publish.
- feasibility_signal: high confidence; four small text edits, no behavior change.
- scope_sketch_digest: new `LICENSE` (MIT, `Copyright (c) 2026 nico0695`), `license: "MIT"` in `package.json`, PRD §8 decision recorded, README license wording updated. `repository`/`author` fields deferred to #45.

## Summary

- change_name: e7-f2-h2-license
- objective: new-feature
- route: continue-lite
- proposal_status: ready
- exploration_performed: false (request already names the files and facts; only manifests and the target lines were checked)

## Readiness Check

| Gate | Verdict | Severity | Evidence |
|---|---|---|---|
| contradiction | resolved | low | CLAUDE.md calls `sdd-lite/` "vendored third-party"; user says it is their own public work (D3, d-003); wording left as is |
| insufficient_context | clear |  | decisions D1-D5 given in chat; repo facts verified |
| ambiguous_framing | clear |  | story text and backlog agree: MIT vs. private, apply consistently |

## Problem And Desired Outcome

- PRD §8 item 6 is still open ("MIT vs. private"). No `LICENSE` file exists, `package.json` has no `license` field, and README line 61 says the license is undecided. E7.F2.H3 publishes `@nico0695/sentinel` publicly, so this must be settled first.
- Desired outcome: the decision is recorded in the PRD (MIT, authored by the user) and LICENSE, `package.json` and README state the same license.

## Initial Scope Sketch

### Likely In Scope

- Create `LICENSE` with the standard MIT text, `Copyright (c) 2026 nico0695`, no mention of `sdd-lite/`.
- Add `"license": "MIT"` to `package.json`.
- `docs/prd-sentinel.md` §8: move item 6 from **Open** to **Taken in this version** with the rationale (public repo, public npm release, permissive deps).
- `README.md`: replace "License is not yet decided" (line 61) with the MIT statement and a link to `LICENSE`; drop "licence" from the pending list (line 19).
- Repo visibility: already public, nothing to change (D4).

### Likely Out Of Scope

- `package.json` `repository` / `author` fields (D5, deferred to E7.F2.H3 / #45).
- Editing the CLAUDE.md "vendored third-party" wording (D3).
- Any `src/` change, per-file license headers, a THIRD-PARTY notices file.
- Backlog status counters: none exist in `docs/backlog-mvp-sentinel.md`, so no edit is expected.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Size | 1 new file, 3 small edits | high |
| Gate | `biome.json` includes `package.json` only; LICENSE, README and PRD are outside biome's scope | high |
| Dependencies | Runtime deps are MIT or ISC, compatible with MIT | high |
| Release link | `files` omits LICENSE, but npm always packs it | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Exact PRD wording and placement of the new item 6 | keeps §8 numbering coherent with the other "Taken" items | open, A-level for spec |
| Whether other docs mention the license (e.g. USER docs, `docs/` files) | consistency acceptance criterion | open, spec greps |
| CLAUDE.md "vendored third-party" vs. the LICENSE covering `sdd-lite/` | inconsistent wording persists; flag as follow-up | recorded, user chose no change |

## Approval Notes

- D1-D5 were decided by the user in chat and are recorded in `state.yaml` (d-001..d-005). No question is waiting on the user.
- Phase validation skipped: the user already indicated advancement (auto mode), and no risk above low remains.
