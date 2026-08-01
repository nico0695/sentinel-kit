# Design

## Routing Digest

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- digest_summary: Create 13 placeholder `.ts` files (doc comment + `export {}`), 3 `.gitkeep` dirs, 4 root configs (package.json, tsconfig.json, biome.json, .gitignore), install 3 pinned devDeps, replace 8 docs placeholders with `@nico0695/sentinel`. Gate: `npm run check` = `biome check . && tsc --noEmit` exits 0.
- affected_areas_digest: new files only under `src/`, `harnesses/`, `skills/`, `fixtures/`, repo root; edits only to 3 files in `docs/` (placeholder lines).
- interfaces_digest: no runtime interfaces; placeholders export nothing (`export {}`); npm scripts are the only public surface.

## Summary

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- design_status: ready-for-plan

## Design Overview

Everything is additive except the docs edit. Exact file tree to create:

```
.gitignore  package.json  package-lock.json(generated)  tsconfig.json  biome.json
harnesses/.gitkeep   skills/.gitkeep   fixtures/.gitkeep
src/main/cli.ts
src/core/{repos,workspace,review,run,history,shared}/index.ts        (6 files)
src/adapters/driving/{cli,tui}/index.ts                              (2 files)
src/adapters/driven/{engines,git,exec,storage}/index.ts              (4 files)
```

**Placeholder pattern (D2, AC-06)** — every `.ts` file is a doc comment plus `export {};`, e.g.:

```ts
/**
 * Core module: run — review orchestration, states, verdict (PRD §4.2).
 * Its driven ports (ReviewEngine, ProcessRunner) land under ./ports in E0.F2.x.
 * No public API yet.
 */
export {};
```

Each comment states the module's real PRD §4.2 role and which story fills it; no invented logic. `src/main/cli.ts` says it is the future CLI entrypoint (wiring lands E0.F4.x) and that executing it is a deliberate no-op — an empty ESM module exits 0, satisfying AC-08 without faking behavior. Guards hold by construction: zero imports anywhere.

**package.json (AC-02/03/07)** — exactly:

```json
{
  "name": "@nico0695/sentinel", "version": "0.0.0", "type": "module",
  "engines": { "node": ">=22" },
  "bin": { "sentinel": "./dist/cli.js", "snt": "./dist/cli.js" },
  "files": ["dist", "harnesses", "skills"],
  "scripts": {
    "dev": "node --experimental-strip-types src/main/cli.ts",
    "build": "tsup",
    "check": "biome check . && tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": { "@biomejs/biome": "2.5.6", "typescript": "7.0.2", "@types/node": "22.20.1" }
}
```

Exact pins (no carets) + committed lockfile: reproducible per D3. `version: 0.0.0` because npm requires one; no other invented fields.

**tsconfig.json (AC-04)** — all §5.2 flags, scoped so tsc never sees `sdd-lite/`, `docs/`, `.claude/`:

```json
{ "compilerOptions": {
    "target": "ES2023", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "isolatedModules": true, "verbatimModuleSyntax": true,
    "noEmit": true, "skipLibCheck": true },
  "include": ["src"] }
```

`noEmit` guards against accidental emit (build is tsup's job); `skipLibCheck` is conventional hygiene — both are extras AC-04 permits.

**biome.json** — allowlist scoping so vendored/docs trees are never scanned:

```json
{ "$schema": "https://biomejs.dev/schemas/2.5.6/schema.json",
  "files": { "includes": ["src/**", "package.json", "tsconfig.json", "biome.json"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "linter": { "rules": { "recommended": true } } }
```

`indentStyle: space` matters: Biome defaults to tabs and would fail `check` on the space-indented `package.json` npm writes. `package-lock.json` is simply not in the allowlist.

**.gitignore** — `node_modules/`, `dist/`, `*.tsbuildinfo`, `*.log`.

**Docs replacement (D4, AC-05)** — verified by live grep: all 8 occurrences are the full package form (`@<scope>/sentinel` ×7, `@<your-scope>/sentinel` ×1), none mean the scope alone, so every replacement is `@nico0695/sentinel`. Lines: backlog 43, 379; prd 279; setup 34, 35, 38, 76, 153.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/**` (13 new `.ts`) | Placeholder modules per pattern above | Low |
| `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, `.gitignore` | New root configs, contents above | Low |
| `harnesses/`, `skills/`, `fixtures/` | Empty dirs tracked via `.gitkeep` | Low |
| `docs/{backlog,prd,setup}*.md` | 8 placeholder-line replacements only | Low |

## Interfaces, Data, And State

- No runtime interfaces, data, or state — placeholders export nothing.
- The only externally observable surface is npm scripts: `check`/`dev` must exit 0; `build`/`test` fail by design (tsup/vitest absent, spec non-goal).

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Empty-dir tracking: `.gitkeep` vs README stub | `.gitkeep` | Spec non-goal forbids prose docs; `.gitkeep` still ships in the npm package via `files` |
| Biome scoping: allowlist `files.includes` vs denylist ignores | Allowlist | Vendored/doc trees (`sdd-lite/`, `.claude/`, `history/`, `docs/`) can never leak into `check`, including future additions |
| `typescript` 7.0.2 (latest) vs 5.9.3 | Pin 7.0.2, fallback documented | Handoff mandates current stable; 7.x is the native compiler — if any §5.2 flag or `--noEmit` misbehaves at install, executor pins 5.9.3 and records the deviation (A-level, pre-authorized here) |
| `@types/node` 26.x (latest) vs 22.x | 22.20.1 | Types must match the engines floor (>=22), not the newest Node; avoids typing APIs the runtime lacks |
| Version pinning: exact vs caret | Exact | Reproducible scaffold; renovation is a later concern |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| TS 7.0.2 (native) honors all §5.2 flags with `--noEmit` | It is the `check` gate (AC-03/04) | executor validation | mitigated — fallback to 5.9.3 pre-authorized above; verified the moment `npm run check` runs |

## Approval Notes

- Checkpoint skipped as implicitly approved (ckp-001/dec-001, auto mode). All choices here are A-level and within spec D1–D4; the TS-7 fallback is the only conditional and is pre-bounded.

## Budget Notes

- ~600 words plus tables; config contents inlined verbatim so `sddl-plan` and the executor need no doc rereads.
