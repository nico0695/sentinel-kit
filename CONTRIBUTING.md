# Contributing

Thanks for working on `sentinel`. This is the minimum you need; the rules to
follow live in [docs/architecture.md](./docs/architecture.md) and
[docs/coding-standards.md](./docs/coding-standards.md).

## Prerequisites

- **Node ≥ 22** (target 24 LTS).
- **npm** (the repo ships a `package-lock.json`).
- Standard-library Node only — no `Bun.*` / `Deno.*` in committed code.

## Setup

```bash
npm ci
```

## Commands

```bash
npm run dev     # rebuild with tsup, then run the CLI
npm run build   # bundle the binary (tsup)
npm run check   # biome + tsc --noEmit + depcruise src  — the quality gate
npm test        # vitest run
```

`npm run dev` bundles with tsup and runs `dist/cli.js`, because the source
uses NodeNext `.js` import specifiers and Node's `--experimental-strip-types`
does not resolve those to their sibling `.ts` files. Arguments pass through:
`npm run dev -- --help`.

`npm run check` is the quality gate: lint/format, typecheck, **and the
architecture guards, in one command**. Both `check` and `test` must pass locally
before you open a PR. See [docs/testing.md](./docs/testing.md) for the test
layout and how to run a single project or test.

## Workflow

- **One PR per backlog story**, titled `[E<epic>.F<feature>.H<story>] Title`;
  reference its issue (`Closes #N`). Trivial related stories may share a PR if
  they are the same feature — say so in the description.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`…).
- **Never merge your own PR and never push to `main`.** A human reviews and
  merges everything.
- **Max 5 open PRs** at a time.
- Everything persisted in the repo is **English** (code, comments, docs, commit
  messages, PR/issue text). See [coding-standards.md](./docs/coding-standards.md#language).

## sdd-lite

Non-trivial changes run through **sdd-lite**, a structured change workflow
(proposal → spec → design → plan → execute → review → QA) whose artifacts live
under `sdd-lite/openspec/changes/<change>/`. Backlog stories and any multi-file
feature/refactor always use it; typo fixes, one-line fixes, and session
operations do not. The activation policy and decision protocol are in
[`CLAUDE.md`](./CLAUDE.md). Development decisions are recorded in `history/`.

## Where things live

- Product & architecture rules (authoritative): [docs/prd-sentinel.md](./docs/prd-sentinel.md).
- Stack decisions: [docs/setup-tecnico-sentinel.md](./docs/setup-tecnico-sentinel.md).
- Scope / backlog: [docs/backlog-mvp-sentinel.md](./docs/backlog-mvp-sentinel.md).
- How the code is structured and what you may/may not do:
  [docs/architecture.md](./docs/architecture.md).
