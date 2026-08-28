# sentinel

AI-powered code review orchestrator CLI. It prepares an isolated worktree,
assembles a review prompt from editable harnesses and skills, delegates the
reasoning to an agentic engine (Claude Code, OpenCode), parses the verdict, and
persists a self-contained run — all behind a hexagonal core that stays engine-,
git-, and storage-agnostic.

The tool **orchestrates**; it does not build its own agent. Engines, git,
storage, and future integrations are interchangeable adapters behind ports the
core owns.

> **Status: pre-MVP.** Epic **E0 — Foundations** is complete: hexagonal scaffold,
> executable architecture guards in CI, the `ReviewEngine` port + run
> terminal-state model, and a `FakeEngine` with a shared reusable contract suite.
> The rest of the MVP develops against `FakeEngine` while the real engines are
> spiked. Scope and progress: [docs/backlog-mvp-sentinel.md](./docs/backlog-mvp-sentinel.md).

## Quick start (development)

Requires **Node ≥ 22**.

```bash
npm ci
npm run check   # biome + tsc --noEmit + architecture guards
npm test        # vitest run
npm run dev     # rebuild with tsup, then run the CLI
```

The published binary is `sentinel` (alias `snt`); packaging lands later in the
backlog.

## Documentation

- [Architecture](./docs/architecture.md) — structure and the rules that keep it
  in order (what you may and may not do).
- [Coding standards](./docs/coding-standards.md) — naming, errors, TypeScript,
  commits, language policy.
- [Testing](./docs/testing.md) — the vitest projects and the contract-suite
  pattern.
- [Contributing](./CONTRIBUTING.md) — setup, commands, and the PR workflow.

Authoritative sources: [product & architecture (PRD)](./docs/prd-sentinel.md) ·
[stack](./docs/setup-tecnico-sentinel.md) ·
[backlog](./docs/backlog-mvp-sentinel.md). Development history is in `history/`;
the change workflow is [`CLAUDE.md`](./CLAUDE.md) + `sdd-lite/`.

## Conventions

Everything persisted in this repository is **English**. Changes follow
Conventional Commits and the one-PR-per-story workflow; a human reviews and
merges everything. License is not yet decided (tracked for the wrap-up epic).
