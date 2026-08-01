# Proposal

## Routing Digest

- change_name: e0-f1-h2-guards
- objective: new-feature
- route: continue-lite (approved, ckp-001)
- digest_summary: Make the 5 PRD §4.5 architecture guards executable with dependency-cruiser (`.dependency-cruiser.cjs` per setup §5.3) and append `depcruise src` to `npm run check`, closing the S02-D2 deferral. Prove all 5 rules with temporary, reverted violations.
- feasibility_signal: high — small blast radius (1 config file, 1 devDependency, 1 script edit); scaffold is green and import-free.
- scope_sketch_digest: in = config + devDep + check script + rule verification; out = CI pipeline (E0.F1.H3), vitest, new src code, PR/history mechanics.

## Summary

- change_name: e0-f1-h2-guards
- objective: new-feature — backlog story [E0.F1.H2], GitHub issue #3, milestone E0
- route: continue-lite
- proposal_status: complete
- exploration_performed: true (targeted reads: setup §5.1/§5.3, PRD §4.5, backlog E0.F1.H2, biome.json, package.json, tsconfig.json)

## Problem And Desired Outcome

The 5 architecture guards of PRD §4.5 (core never imports adapters/main; core imports no I/O libs — whitelist zod; core modules only via public `index`; adapters isolated from each other; wiring only in `src/main`) exist only as prose. Nothing fails when they are broken, and [E0.F1.H1] left `check` as `biome check . && tsc --noEmit` (deferral S02-D2). Desired outcome: a versioned `.dependency-cruiser.cjs` encoding the 5 rules (whitelist documented in-config), `npm run check` = `biome check . && tsc --noEmit && depcruise src` (setup §5.1), green on the current skeleton, and demonstrably red under a forbidden import for each rule (violations temporary, fully reverted).

## Initial Scope Sketch

### Likely In Scope

- Add `dependency-cruiser` as a pinned devDependency (version to be chosen at design).
- Create `.dependency-cruiser.cjs` with the 5 named rules from setup §5.3 (adapted as needed — see open questions) plus minimal `options` (tsconfig reference, doNotFollow node_modules); whitelist comment for `zod` (issue #3 AC2).
- Update `check` script in package.json to the setup §5.1 final chain.
- Verification protocol: one temporary violation per rule → check fails → revert; final tree clean and green (issue #3 AC1, generalized to all 5 by kickoff).
- Decide whether biome's `files.includes` allowlist should cover `.dependency-cruiser.cjs` (format/lint it) or leave it outside the gate.

### Likely Out Of Scope

- CI workflow (`ci.yml`) — story E0.F1.H3.
- vitest/tsup installation, any `src/` production code, port definitions.
- Editing PRD/setup docs; `zod` is whitelisted but not installed yet (no core code needs it).
- PR, commits, history entry — orchestrator-owned.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Baseline green | `npm run check` (biome+tsc) passes; 13 placeholder files with zero imports | high |
| Rule source | Setup §5.3 gives a near-complete config sketch; rules map 1:1 to PRD §4.5 | high |
| Snippet fidelity | §5.3 is a docs sketch — cross-rule regex backreferences (`\1`, `\1/\2`) and the npm whitelist matcher likely need dependency-cruiser-specific adaptation (`$1` group substitution; `node_modules/`-prefixed paths). Must be validated with real violations | medium |
| Trivial-pass risk | Zero imports today means depcruise passes vacuously — the kickoff's per-rule violation proof is what makes the story meaningful | high |
| Test gap | `npm test` not runnable (vitest lands E0.F2.x); verification is via `npm run check` red/green only | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Pin which dependency-cruiser version (exact, per existing devDeps style) | Reproducible gate; must support Node >=22 and TS 7 syntax | open → design (A-level) |
| Does `depcruise src` auto-discover `.dependency-cruiser.cjs`, or is `--config` needed | The check chain in setup §5.1 has no `--config` flag; must confirm | open → executor validation |
| Does depcruise need `options.tsConfig` (and which resolver settings) to follow NodeNext TS imports | Rules are useless if imports are not resolved; skeleton has none, violations will | open → design |
| Are §5.3 regexes verbatim-usable (`(?!\1)` cross-field backrefs vs dependency-cruiser `$1` substitution; `pathNot: "^(zod)$"` vs resolved `node_modules/zod` path) | Wrong regexes = silently permissive guards; each rule must be proven red | open → design + executor proof |
| Add `.dependency-cruiser.cjs` to biome `files.includes` or leave excluded | biome uses an allowlist; unlisted file is neither formatted nor linted | open → spec/design (B-lite: recommend including) |
| `core-no-io-libs` interaction with Node builtins (`node:fs` etc.) — §5.3 only forbids `dependencyTypes: ["npm"]` | PRD rule 2 names fs/child_process; builtins may need `core` dependencyType coverage to honor PRD intent | open → spec (scope-relevant) |

## Approval Notes

- Whole-change stage_approval granted at kickoff (ckp-001, dec-001): auto mode, scope pinned to issue #3 + setup §5.3 rule set + §5.1 check chain + per-rule violation proof.
- No new material ambiguity found; open questions above are resolvable inside the approved scope. Advancement to `sddl-spec` implicitly approved by the kickoff — no checkpoint presented.
- Note for spec: the Node-builtins question (last row) is the only one that could touch scope interpretation; §5.3 as written stays authoritative unless spec finds it contradicts PRD rule 2, in which case protocol B applies.

## Budget Notes

- Kept compact; tables carry the detail. Ready for `sddl-spec` to formalize without re-discovery.
