# Architecture

How `sentinel` is structured and the rules that keep it in order as it grows.

This is the human-readable explanation. The **enforcement** lives in
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) (run in `npm run check`
and in CI); the **origin** is [`docs/prd-sentinel.md`](./prd-sentinel.md) §4,
which is authoritative. Where they differ, the guard file and the PRD win — open
an issue rather than editing around them.

## Style

Modular **hexagonal** (ports & adapters), with **modules per domain** inside the
core. AI engines, git, storage, and future integrations are interchangeable
adapters behind ports the core owns.

### Guiding principles (PRD §4.1)

1. **Dependencies point inward.** Everything depends on the core; the core
   depends on no one.
2. **Core has no I/O.** No filesystem, process, network, or side-effecting
   library inside `src/core/`.
3. **One port per domain need**, not per technology — the core needs "run a
   review", not "call Claude".
4. **Adapters are dirty inside, clean outside.** CLI/version workarounds are
   encapsulated; only the port contract crosses toward the core.
5. **Single composition root.** Wiring happens in exactly one place, `src/main/`.
6. **Modules expose an explicit public API.** Core modules consume each other
   only through the other's `index`, never its internals.

## Structure

```
src/
├── core/          # pure domain, no I/O
│   ├── repos/         # repo registration and configuration
│   ├── workspace/     # worktrees: creation, cleanup policies
│   ├── review/        # harnesses, skills, prompt assembly
│   ├── run/           # review orchestration, states, verdict
│   ├── history/       # querying previous runs
│   └── shared/        # domain errors, common types
│   # each module declares its driven ports in <module>/ports
├── adapters/
│   ├── driving/   # who invokes the core
│   │   ├── cli/       # direct commands (scripting)
│   │   └── tui/       # interactive menus
│   └── driven/    # who the core invokes
│       ├── engines/   # claude-code/ · opencode/ · fake/
│       ├── git/       # git CLI wrapper
│       ├── exec/      # process execution (validations)
│       └── storage/   # config, harnesses, skills, runs (fs + yaml)
└── main/          # composition root: wires everything
```

Ports are **owned by the domain module that needs them** (declared in
`<module>/ports`), not by a central technical folder. This keeps each domain
cohesive and makes it obvious which module depends on which external capability.

### Port catalog (MVP, PRD §4.3)

| Port (driven) | Owned by | Responsibility | Adapter |
|---|---|---|---|
| `ReviewEngine` | `run` | Run the review (worktree + prompt) → raw output + usage | `engines/*` |
| `GitPort` | `repos` / `workspace` | clone, fetch, branches, worktree, merge-base, diff | `git` |
| `ConfigStore` | `repos` / `review` | read/write config, repos, harnesses, skills | `storage` |
| `RunStore` | `history` | persist and list full runs | `storage` |
| `ProcessRunner` | `run` | run validations with timeout + output capture | `exec` |

The **core's driving API is its use cases** — thin functions per module
(`registerRepo`, `runReview`, `listRuns`, …). The use-case signature is the
contract; TUI and CLI (and a future daemon) consume it equally. No logic lives
in a CLI/TUI command.

## The five guards (allowed / forbidden)

Verified automatically by `depcruise src` in `npm run check` and CI. **A guard
violation fails the build** — it is a blocker, never a suggestion. The rules and
their origin are PRD §4.5; the whitelist for guard 2 is `zod` only.

**1. The core never imports adapters or the composition root.**
- ✅ `src/adapters/driven/git/*` imports `src/core/repos` (adapter → core).
- ❌ `src/core/run/*` importing `src/adapters/...` or `src/main/...`.

**2. The core imports no I/O / runtime library.** Whitelist: `zod` only; all Node
builtins are banned, bare (`fs`) and prefixed (`node:fs`).
- ✅ `src/core/run/*` importing `zod`, or another core module's types.
- ❌ `src/core/*` importing `fs`, `node:child_process`, `yaml`, `execa`, …
- Relaxing this whitelist is a deliberate, reviewed edit of the guard file.

**3. Core modules import each other only via the public `index`.**
- ✅ `src/core/run` importing from `src/core/shared/index.ts`.
- ❌ `src/core/run` importing `src/core/shared/some-internal-file.ts`.

**4. Adapters never import other adapters.** They share only the core's port
types.
- ✅ `engines/opencode` importing a `ReviewEngine` type from `src/core/run`.
- ❌ `engines/opencode` importing from `engines/claude-code` or `git/`.

**5. Adapters are instantiated only in `src/main/`.**
- ✅ `src/main/*` constructing a git adapter and passing it to a use case.
- ❌ A use case, CLI command, or another adapter constructing a concrete adapter.

### Test code and the guards

Test files live in co-located `__test__/` folders and are **excluded from the
cruise** (`options.exclude` matches `(^|/)__test__/` in the guard file), so test
imports (e.g. `vitest`) never affect guard enforcement. Production code is always
cruised. See [testing.md](./testing.md).

### Why the guards matter — the extraction guarantee

While the five guards hold, `src/core/` is a **publishable package with no
refactoring** — the day the daemon (stage 3) or a plugin needs the domain as a
standalone library, it is already decoupled. The guards are not bureaucracy;
they are that guarantee, checked on every commit.

## The review flow

Every review converges on the same shape (PRD §5.1):

```
worktree → diff → prompt → engine → parse → terminal state → cleanup
```

- An **ephemeral git worktree per review** (never a checkout in the managed
  clone — that would serialize reviews and risk a dirty tree).
- Diffed as **`merge-base(base, target)..target`**, matching how GitHub computes
  a PR's changes.
- Every run ends in exactly one **terminal state**:
  `ok | ambiguous | engine-error | timeout | validation-failed`.

## In practice — do / don't

- **Do** put domain logic in `src/core` use cases; keep CLI/TUI commands thin.
- **Do** declare a new port in the module that needs it (`<module>/ports`).
- **Do** add a new engine as a folder under `engines/` that passes the shared
  contract suite — the core stays untouched (PRD §4.7).
- **Don't** import an adapter from the core, or one adapter from another.
- **Don't** add `services/` or `utils/` folders to the core.
- **Don't** instantiate an adapter outside `src/main/`.
- **Don't** work around a guard — if a rule blocks you, that is the design
  talking; raise it.

For naming, error handling, terminal states, and TypeScript rules, see
[coding-standards.md](./coding-standards.md).
