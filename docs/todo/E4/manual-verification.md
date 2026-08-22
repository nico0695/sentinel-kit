# E4 — Manual verification checklist

> **Audience**: the human operator. Every item below requires a real, authenticated engine CLI
> and cannot be run by an agent inside this session (same reasoning as `docs/todo/E1/` — invoking
> a real agentic CLI is a materially riskier action than anything Claude Code does autonomously
> in this repo, so it's deliberately left for you to run and record).
>
> **Status**: living checklist for E4 (Run & engines). New items get appended, numbered, as later
> E4 stories land ones of their own — this doc is not story-scoped, it's epic-scoped, so you have
> one place to come back to before the epic is considered fully closed out.

## Why this exists

Each E4.F2 engine-adapter story (`[E4.F2.H1]`, `[E4.F2.H2]`, ...) has one acceptance criterion —
"successful real review" — that CI cannot satisfy: it requires spawning a genuinely authenticated
CLI session (`claude`, `opencode`, ...) against a real diff, which is out of reach for an
automated test and was explicitly declined as something Claude Code should trigger on its own
(see `d-ac24-deferred-no-live-cli` in `e4-f2-h1-claude-code-adapter/state.yaml`). Every other
acceptance criterion for these stories is automated and independently re-verified — this is the
one deliberate, honest gap per adapter, tracked here instead of being silently marked satisfied.

## How to record a result

For each item: run the steps, then paste the evidence (exact command, exit code, and the observed
`VERDICT:` line or relevant `.result` excerpt) into the story's own `execution-log.md`, at the
path listed in that item's row — **not** into this file. This file only tracks which items are
outstanding and points at where their evidence belongs. Once an item's `execution-log.md` entry
exists, check its box here and note the date.

## Checklist

| # | Story | Engine | Status | Evidence goes in |
|---|-------|--------|--------|-------------------|
| 1 | `[E4.F2.H1]` (issue [#28](https://github.com/nico0695/sentinel-kit/issues/28)) — AC-24 | `claude-code` | ⬜ pending | `sdd-lite/openspec/changes/e4-f2-h1-claude-code-adapter/execution-log.md` (ST-5 section) |
| 2 | `[E4.F2.H2]` (issue [#29](https://github.com/nico0695/sentinel-kit/issues/29)) — AC-24 | `opencode` | ⬜ pending | `sdd-lite/openspec/changes/e4-f2-h2-opencode-adapter/execution-log.md` (ST-5 section) |

---

## 1. `[E4.F2.H1]` — claude-code adapter, real review

**What to prove**: `createClaudeCodeAdapter()`'s default (`execa`-backed) path, invoked exactly as
`review()` invokes it, against the real `claude` CLI, produces a genuine `VERDICT:`-bearing
result over a real diff — mirroring the `[E1.F1.H1]` spike's own acceptance run, not a new
capability.

### Steps

1. Confirm `claude` is installed and authenticated: `claude --version` (record the exact output —
   the spike's findings in `docs/engines/claude-code.md` are pinned to `2.1.226`; note if yours
   differs, since that's PRD risk #1 — flag drift on version bumps).
2. Reuse or recreate a throwaway test repo with a planted finding — the same setup
   `docs/todo/E1/00-prerequisites.md` §3–4 describes (a diff with an obvious bug, reviewed from
   an ephemeral worktree via `merge-base(base, target)..target`). If you still have
   `~/spikes/e1-test-repo` from E1, reuse it as-is.
3. From a scratch script (not committed — same convention the story's design used for its own
   verification, e.g. `node --experimental-strip-types`), call:
   ```ts
   import { createClaudeCodeAdapter } from "./src/adapters/driven/engines/claude-code/claude-code-adapter.ts";

   const adapter = createClaudeCodeAdapter(); // defaults: binaryPath "claude", model "sonnet"
   const result = await adapter.review({
     worktree: { path: "/absolute/path/to/e1-test-wt" },
     prompt: "<the same canonical test prompt from docs/todo/E1/00-prerequisites.md §5>",
     timeoutMs: 120_000,
   });
   console.log(result);
   ```
4. Record in `sdd-lite/openspec/changes/e4-f2-h1-claude-code-adapter/execution-log.md`'s ST-5
   section: the exact script/command run, the process exit behavior (did it resolve or reject),
   and the observed `VERDICT:` line (or the first few lines of `result.output`).
5. Check off row 1 above with the date.

---

## 2. `[E4.F2.H2]` — opencode adapter, real review

**What to prove**: `createOpenCodeAdapter({ model })`'s default (`execa`-backed) path, invoked
exactly as `review()` invokes it — including the `OPENCODE_CONFIG` deny-permission injection —
against the real `opencode` CLI, produces a genuine `VERDICT:`-bearing result over a real diff.

### Steps

1. Confirm `opencode` is installed and a model is configured:
   ```bash
   opencode --version
   opencode models   # confirms which provider/model credentials are actually usable
   ```
   Record both outputs — `docs/engines/opencode.md`'s findings are pinned to `1.17.9` against
   `openai/gpt-5.4-mini`; note if your version or model differs.
2. Reuse the same throwaway test repo/worktree/diff as item 1 (or recreate it per
   `docs/todo/E1/00-prerequisites.md` §3–4) — the planted finding and canonical prompt are
   engine-agnostic.
3. From a scratch script (not committed):
   ```ts
   import { createOpenCodeAdapter } from "./src/adapters/driven/engines/opencode/opencode-adapter.ts";

   const adapter = createOpenCodeAdapter({ model: "openai/gpt-5.4-mini" }); // use YOUR configured model
   const result = await adapter.review({
     worktree: { path: "/absolute/path/to/e1-test-wt" },
     prompt: "<the same canonical test prompt from docs/todo/E1/00-prerequisites.md §5>",
     timeoutMs: 120_000,
   });
   console.log(result);
   ```
4. Confirm the worktree stayed pristine afterward (`git status` inside it) — `opencode run`
   writes files by default, so this also verifies the `OPENCODE_CONFIG` deny-permission injection
   actually worked, not just that a review happened.
5. Record in `sdd-lite/openspec/changes/e4-f2-h2-opencode-adapter/execution-log.md`'s ST-5
   section: the exact script/command run, the process exit behavior, the observed `VERDICT:` line
   (or the first few lines of `result.output`), and the `opencode --version`/`opencode models`
   output from step 1 (closes the CLI-version-drift open item as a side effect).
6. Check off row 2 above with the date.

---

## Adding a future item

When a later E4.F2 story (e.g. a third engine adapter, if one is ever added) needs its own manual
"successful real review" evidence, append a new numbered row to the checklist table and a new
`## N.` section below, following the same shape as items 1–2. Do not renumber existing items.
