# Coding standards

The code-level conventions the review flow — and the sdd-lite AI validators —
check against. They distill [architecture.md](./architecture.md), PRD §4.4, and
`CLAUDE.md`. Nothing here overrides the [architecture guards](./architecture.md#the-five-guards-allowed--forbidden);
those are enforced by `npm run check`.

## Language

Everything **persisted in this repository is English** — code, comments,
identifiers, docs, commit messages, PR/issue titles and bodies, sdd-lite
artifacts, history entries. Chat with a collaborator may be another language;
nothing but English lands in the repo. (Vendored third-party content such as
`sdd-lite/`'s own files is exempt — it is not ours to edit.)

## Naming (PRD §4.4)

- **Modules & folders**: kebab-case, named by **domain** (`workspace`, `run`) —
  never by technology or pattern. `services/` and `utils/` folders are
  **prohibited in the core**.
- **Ports**: named by their **domain role** (`ReviewEngine`, `RunStore`). Add a
  `Port` suffix only if the role alone is ambiguous (`GitPort`). Naming a port
  after its implementation is prohibited (`ClaudeService` ❌).
- **Adapters**: a folder per technology they implement
  (`engines/claude-code`, `git`, `storage`). The folder says *how*; the port
  says *what*.
- **Use cases**: verb + noun in camelCase (`runReview`, `registerRepo`,
  `listRuns`). They are the only public API of the core.
- **Domain errors**: `Error` suffix, specific to their module and living in it
  (`WorktreeCreationError`, `AmbiguousVerdictError`).

## Errors and terminal states

- **Adapters translate raw exceptions into port errors.** A raw library
  exception (from `execa`, `fs`, an engine CLI…) must never leak into the core;
  the adapter catches it and throws the port's declared error type.
- **Every run ends in exactly one terminal state**:
  `ok | ambiguous | engine-error | timeout | validation-failed`. This is a
  run-domain type assigned by the run flow — engines return raw output only,
  they do not decide the state.

## TypeScript

`tsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax`,
`module`/`moduleResolution: NodeNext`). Practical consequences:

- Use **`import type` / `export type`** for type-only imports and re-exports
  (`verbatimModuleSyntax` makes a plain `export { SomeType }` a compile error).
- Relative imports carry the **`.js` specifier** (NodeNext): `from "./foo.js"`,
  even for a `.ts` source.
- Under `exactOptionalPropertyTypes`, build optional properties **conditionally**
  — never assign `undefined` to an optional field. Prefer `{ output }` vs
  `{ output, usage }` over `{ output, usage: undefined }`.
- Under `noUncheckedIndexedAccess`, indexing yields `T | undefined`; handle the
  `undefined` branch explicitly.

## Commits

- **Conventional Commits** (`feat:`, `fix:`, `test:`, `chore:`, `docs:`…).
- Scope by domain where it helps (`feat(run): …`, `feat(engines): …`).
- Keep messages English and imperative.

## Testing

Core = unit with in-memory port fakes; driven adapters = the shared contract
suite per port; e2e = smoke with FakeEngine. Full detail and the contract-suite
pattern are in [testing.md](./testing.md).
