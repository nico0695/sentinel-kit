# Spec

## Routing Digest

- change_name: e0-f1-h2-guards
- objective: new-feature — story [E0.F1.H2], issue #3, milestone E0
- route: continue-lite (approved, ckp-001)
- digest_summary: Formal contract for making the 5 PRD §4.5 guards executable via a root `.dependency-cruiser.cjs` and appending `depcruise src` to `npm run check`. Core I/O ban extended to Node builtins (dec-002). Each rule proven red with a temporary, reverted violation.
- scope_digest: in = pinned devDep + root config (5 rules, documented zod whitelist, builtins ban) + check script edit + biome allowlist entry + red/green verification; out = CI, vitest/tsup, production src code, PR/history mechanics.
- acceptance_digest: AC-01..AC-13 — exact check chain, green baseline, 5 per-rule red proofs, whitelist documented, clean tree at close, `npm test` gap recorded.

## Summary

- change_name: e0-f1-h2-guards
- objective: new-feature
- route: continue-lite
- spec_status: complete

## Scope Boundary

### In Scope

- `dependency-cruiser` as a devDependency, **exact version pin** (no `^`/`~`, matching existing devDeps style); exact version chosen at design (must support Node >=22 and TypeScript 7 / NodeNext).
- `.dependency-cruiser.cjs` at repo root, auto-discovered by `depcruise src` (the §5.1 chain has no `--config` flag — discovery without flags is a requirement, not an assumption). Encodes exactly the 5 PRD §4.5 rules, all `severity: "error"`, plus the minimal `options` needed for imports to actually resolve (TS/NodeNext resolution via tsconfig; do not follow node_modules). Mechanics (resolver settings, exact regexes) are design-owned.
- `check` script updated to the exact setup §5.1 text (AC-01).
- `.dependency-cruiser.cjs` added to biome `files.includes` (dec-005).
- Verification protocol: green baseline, one temporary violation per rule proving red, full revert (AC-04..AC-11).

### Out Of Scope

- CI workflow (`ci.yml`) — story E0.F1.H3.
- vitest/tsup installation; any production `src/` code or port definitions.
- Installing `zod` (whitelisted, not needed yet); editing PRD/setup docs.
- PR, commits, history entry — orchestrator-owned.

### Non-Goals

- No eslint-boundaries alternative (dependency-cruiser is the pinned tool, per kickoff).
- No changes to `src/**` placeholders except temporary violations that are fully reverted.
- No CI enforcement in this story — local `npm run check` only.

## Expected Behavior

The five rules enforce these behaviors (names fixed; regex syntax is design-owned):

| Rule | Forbidden behavior (module-path semantics, `node:`-prefixed forms included) |
|---|---|
| `core-no-adapters` | Any `src/core/**` file importing anything under `src/adapters/**` or `src/main/**` (PRD rule 1) |
| `core-no-io-libs` | Any `src/core/**` file importing any npm package except `zod`, **or any Node builtin** (`fs`, `node:fs`, `child_process`, `http`, `path`, ...) (PRD rule 2 + dec-002) |
| `core-modules-via-index` | A file in core module X importing a file of core module Y other than Y's public `index` (PRD rule 3) |
| `adapters-isolated` | Any adapter importing another adapter; sharing happens only via core port types (PRD rule 4) |
| `wiring-only-in-main` | Any file outside `src/main/**` importing from `src/main/**` (PRD rule 5) |

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Clean tree, `npm run check` | Exit 0 (biome + tsc + depcruise all pass) | Current skeleton has zero imports — passes vacuously; that is why red proofs are mandatory |
| Temporary violation for rule N | Check chain exits non-zero **and** depcruise output names rule N | Violation must be attributable to depcruise: craft it to pass biome+tsc, or additionally run the depcruise step alone to capture the rule name. Rule-2 proof MUST use a Node builtin (e.g. `node:fs`) — always resolvable, and it simultaneously proves the dec-002 builtin coverage |
| Violation reverted | Check back to exit 0; `git status` shows only intended changes | Per-rule cycle: red → revert → green |
| Reading the config | The zod whitelist and the builtins ban are evident from an explicit comment plus the machine-readable exception | Issue #3 AC2 (dec-003) |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-01 | `package.json` `check` script is exactly `biome check . && tsc --noEmit && depcruise src` | Read package.json | must |
| AC-02 | `dependency-cruiser` present in devDependencies with an exact pinned version and in package-lock | Read package.json + lockfile | must |
| AC-03 | `.dependency-cruiser.cjs` exists at repo root, is auto-discovered by `depcruise src` with no flags, and defines exactly the 5 named rules at severity error | Run `npx depcruise src`; inspect config | must |
| AC-04 | On the clean tree, `npm run check` exits 0 | Run it | must |
| AC-05 | Red proof `core-no-adapters`: temp import from a core file to `src/adapters/**` (or `src/main/**`) trips the rule; reverted | Red run output cites rule name; then green | must |
| AC-06 | Red proof `core-no-io-libs`: temp import of `node:fs` (builtin) from a core file trips the rule; reverted | Proves builtin coverage (dec-002) | must |
| AC-07 | Red proof `core-modules-via-index`: temp import from one core module to an internal (non-index) file of another trips the rule; an index import does not; reverted | May require a temp internal file, also reverted | must |
| AC-08 | Red proof `adapters-isolated`: temp import from one adapter to another trips the rule; reverted | Red run output cites rule name; then green | must |
| AC-09 | Red proof `wiring-only-in-main`: temp import from a non-main file to `src/main/**` trips the rule; reverted | Red run output cites rule name; then green | must |
| AC-10 | The config documents the core whitelist: explicit comment naming `zod` as the only allowed npm import in core (and stating the builtins ban) plus the machine-readable exception | Read config (issue #3 AC2) | must |
| AC-11 | After verification, working tree contains only the intended changes (config, package.json, package-lock.json, biome.json); no temporary violation survives; final `npm run check` green | `git status --porcelain` + check run | must |
| AC-12 | `npm test` gap explicitly recorded: vitest not runnable until E0.F2.x; this story is verified exclusively via check red/green | Stated in execution-log and history | must |
| AC-13 | `.dependency-cruiser.cjs` listed in biome `files.includes` and `biome check .` passes on it | Read biome.json; run check | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| §5.3 regexes not verbatim-usable (risk-001, medium) | Silently permissive guards if adapted wrongly | Mitigated structurally: AC-05..AC-09 make every rule prove itself red. Exact syntax is design-owned |
| Builtins ban stricter than §5.3 sketch (dec-002) | Even pure builtins (`node:path`, `node:util`) are banned from core | Accepted: zero current cost, strongest extraction guarantee; relaxation is a visible, reviewed config edit (B-level) |
| Whitelist positive proof not runnable (low) | `zod` is not installed, so "zod is allowed" cannot be runtime-verified now | AC-10 requires documentation, not a runtime proof; first real zod import in core (E1+) verifies it |
| Red-proof attribution (low) | biome/tsc could fail before depcruise reaches the violation | Handled in Expected Behavior: craft violations to pass biome+tsc or capture the depcruise step alone |

## Open Questions And Decisions

All proposal open questions are pinned; none remain open for design to guess at.

| Item | Decision | Rationale | Status |
|---|---|---|---|
| dec-002 — Node builtins (risk-002) | `core-no-io-libs` forbids **all** Node builtins in core (both bare and `node:` forms), not only npm deps and not only an I/O subset | PRD §4.5 rule 2 is MANDATORY and names builtins (fs, child_process, http); the §5.3 `dependencyTypes: ["npm"]` sketch is a recommendation and under-covers it. All-builtins (vs I/O-only subset) is chosen because the extraction guarantee targets a pure, runtime-agnostic core; a blanket ban is simpler, has zero cost today (core has no imports), and future exceptions are explicit whitelist edits. Deviation from §5.3 justified per CLAUDE.md | A-level, decided (claude) |
| dec-003 — Whitelist documentation | Explicit comment in the config naming zod + stating the builtins ban, **and** the machine-readable exception | Issue #3 AC2 says "documented in the config"; comment serves humans, exception serves the tool — both required (AC-10) | A-level, decided (claude) |
| dec-004 — Behavior vs regex (risk-001) | Spec pins rule behavior (table above) and per-rule red proofs as ACs; exact regex syntax delegated to design | Spec must survive regex adaptation; proofs make correctness observable regardless of syntax | A-level, decided (claude) |
| dec-005 — biome allowlist | Add `.dependency-cruiser.cjs` to `files.includes` | Consistent with H1's allowlist decision (maintained configs — package.json, tsconfig.json, biome.json — are listed); an unformatted, unlinted gate config would be the odd one out (AC-13) | A-level, decided (claude) |
| dec-006 — Version pin, discovery, tsconfig resolution | Behavioral contract pinned in spec: exact version pin (AC-02), flagless auto-discovery (AC-03), imports must actually resolve under NodeNext for rules to fire (implied by AC-05..AC-09). Which version, which resolver options, config comments layout → design | Spec owns the observable contract; design owns mechanics | A-level, decided (claude) |

## Approval Notes

- Whole-change pre-approval ckp-001 (auto mode) covers this stage; checkpoint skipped, advancement to `sddl-design` implicitly approved.
- dec-002 was flagged in the proposal as potential protocol-B (§5.3/PRD conflict). Resolved as A-level: this is not a scope conflict — PRD §4.5 is mandatory, setup §5 is explicitly a recommendation to re-evaluate with justification, and the kickoff scope pins the *rule set*, not the sketch's exact matchers. No scope expansion: still one config, one devDep, one script edit.
- All five red proofs are formal ACs (one per rule), per the kickoff extra.

## Budget Notes

- Slightly above the lite word target: the AC table carries the load (13 verifiable criteria) so design/executor/QA need no re-discovery. Prose kept minimal.
