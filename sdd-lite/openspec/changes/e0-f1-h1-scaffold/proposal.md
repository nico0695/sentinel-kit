# Proposal

## Routing Digest

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite (bounded, high confidence)
- digest_summary: Scaffold the hexagonal source tree (PRD §4.2), base configs (ESM package.json as `@nico0695/sentinel`, strict tsconfig, Biome), make `npm run check` (biome + tsc) pass, and replace the `@<scope>` docs placeholder.
- feasibility_signal: high — greenfield repo, scope pinned by issue #2 + PRD §4.2 + setup §5; toolchain unverified but standard.
- scope_sketch_digest: in = structure + package.json/tsconfig/biome + docs placeholder; out = depcruise (H2), CI (H3), vitest/tsup configs, npm reservation (user-side).

## Summary

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec
- exploration_performed: true (targeted: setup §5 read, `@<scope>` grep across `docs/` — 7 occurrences in 3 files)

## Problem And Desired Outcome

The repository is docs-only: no `package.json`, no `src/`, no toolchain. Nothing downstream (guards, tests, CI, all E0+ stories) can land until the scaffold exists. Story `[E0.F1.H1]` (issue #2, milestone "E0 — Foundations") creates it.

Desired outcome: the repo contains the complete PRD §4.2 structure, base configs per setup §5.1/§5.2, and a green `npm run check` covering biome + tsc — the first runnable quality gate — delivered as one PR titled `[E0.F1.H1] ...` referencing issue #2.

## Initial Scope Sketch

### Likely In Scope

- `src/core/{repos,workspace,review,run,history,shared}`, `src/adapters/driving/{cli,tui}`, `src/adapters/driven/{engines,git,exec,storage}`, `src/main/` (composition root).
- Package-root dirs `harnesses/`, `skills/`, `fixtures/` (setup §5.5).
- `package.json`: name `@nico0695/sentinel` (decision S01-D1), `type: module`, `engines.node >=22`, bin `sentinel` + alias `snt`, scripts `dev`/`build`/`check`/`test` per setup §5.1.
- Strict tsconfig per setup §5.2 (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, NodeNext, ES2023, isolatedModules, verbatimModuleSyntax).
- Biome config; `npm run check` = biome + tsc passing locally before the PR.
- Replace `@<scope>` with `@nico0695` in `docs/` (7 occurrences: backlog L43/L379, PRD L279, setup L34/L35/L76/L153).

### Likely Out Of Scope

- npm package reservation — external dependency, done by the user (issue #2 AC3).
- dependency-cruiser config and `depcruise` in `check` (story E0.F1.H2); CI (E0.F1.H3); vitest/tsup config files (later stories) — scripts may declare them per §5.1 without configuring.
- Any domain logic, ports, or `module/ports` content — later stories.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Scope clarity | Fully pinned by issue #2 + PRD §4.2 + setup §5 + user kickoff | high |
| Greenfield risk | No existing code to break; purely additive | high |
| Toolchain | Node 22.22.2 / npm 10.9.7 available; biome/tsc never installed together here (risk-001, low) | medium |
| Gate viability | `tsc --noEmit` needs at least one input file — empty dirs alone won't gate; placeholder strategy needed | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Exact `check` script text | §5.1 shows `biome check . && tsc --noEmit && depcruise src`, but depcruise is H2; issue #2 AC says biome+tsc. Spec must pin the H1 string (leaning: biome + tsc only; H2 appends depcruise). | open |
| Placeholder strategy for empty modules | Git doesn't track empty dirs and tsc needs inputs: `.gitkeep` vs minimal `index.ts` per module affects whether `check` genuinely gates. | open |
| Scripts that reference uninstalled tools | `dev`/`build`/`test` per §5.1 invoke tsup/vitest not configured in H1 — declare-but-not-runnable vs omit until their story. | open |
| Docs replacement form | `@<scope>/sentinel` → `@nico0695/sentinel` everywhere, incl. prose "npm scope" mention at setup L153. Confirm no other placeholder variants. | open |

## Approval Notes

- Whole-change scope and auto (chained) execution pre-approved by the user kickoff (ckp-001 / dec-001 in `state.yaml`); no per-stage pause required.
- Deviations from the pinned scope still stop per the A/B/C protocol (B/C escalation).

## Budget Notes

- Kept lightweight per lite mode; open questions above are spec-level pins, not blockers — none require a user decision at this stage.
