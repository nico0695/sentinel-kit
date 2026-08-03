# Proposal: E2.F3.H2 — Diff with size policy

## Change ID
`e2-f3-h2-diff-size-policy`

## What

Implement a `computeReviewDiff` use case in the `workspace` module that calculates a merge-base diff for a review and applies the PRD's large-diff size policy: configurable line/token limits, per-file truncation that preserves the full file index, and a warning when truncation occurs. The use case never fails due to diff size.

Concretely:

1. **`computeReviewDiff`** — Given a repo path, base ref, and target ref, compute the merge-base, produce the diff via `GitPort`, measure it against configurable limits (`maxLines` / `maxTokens`), and return a prompt-ready result. If limits are exceeded, truncate per-file diff hunks while keeping every affected file in the output as an index entry (path + stats). Emit a `DiffWarning` in the result when truncation occurs.

2. **Domain types** — `ReviewDiff` (the prompt-ready result with file entries, optional raw diff, truncation flag, warnings), `DiffFileEntry` (per-file: path, stats, diff content or truncation marker), `DiffWarning` (structured warning with reason and metrics), `DiffSizePolicyError` (for invalid config, not for size itself — size never errors).

## Why

The review flow requires a diff to populate the prompt sent to the engine (PRD section 5.1, inline context mode). Large diffs are a top-3 risk (PRD section 7, risk #2). The PRD mandates a specific policy: warn, truncate per file, but never fail. This decouples diff preparation from both the git layer (which produces raw diffs) and the run orchestrator (which consumes prompt-ready content). The engine reads full files on demand in the worktree, so truncation is safe — it loses detail but not capability.

Without this use case, `runReview` (E4.F1.H1) has no way to get a prompt-ready diff that respects size constraints.

## Scope boundary

### In scope

- One use case in `src/core/workspace/`: `computeReviewDiff`.
- Domain types: `ReviewDiff`, `DiffFileEntry`, `DiffWarning`, `DiffSizePolicyError`.
- Token estimation: a simple heuristic (character count / 4, or split on whitespace — no external tokenizer, core cannot import I/O libs). The `maxTokens` limit is approximate by design.
- Per-file truncation strategy: when the total diff exceeds limits, remove diff content from the largest files first (by line count), replacing each with a truncation marker, until the total is within limits. Every file remains in the output with its path and stats.
- Sensible defaults when `diffLimits` is not configured (e.g., 3000 lines / 50000 tokens) so the use case works without explicit config.
- Unit tests with in-memory `GitPort` fakes: under-limit passes through, at-limit edge case, over-limit triggers truncation and warning, empty diff, single-file diff, multi-file with selective truncation, invalid config.
- Export from workspace module's public `index.ts`.

### Out of scope

- Autonomous diff mode (`contextMode: agent`) — that is a separate harness-level concern; this use case handles inline mode only.
- Prompt assembly — this use case produces a structured `ReviewDiff`; the prompt assembler (E3/E4) formats it for the engine.
- Actual tokenizer integration — token count is a heuristic, not model-specific.
- Changes to `GitPort` — the existing `mergeBase` and `diff` methods are sufficient.
- Changes to `DiffLimitsSchema` in `repos/ports/config-schemas.ts` — the schema already has `maxLines` and `maxTokens`. Default values are applied at the use-case level, not the schema level.
- Worktree creation/cleanup — handled by E2.F3.H1.

## Affected areas

| Area | Impact |
|---|---|
| `src/core/workspace/compute-review-diff.ts` | **New** — the use case implementation. |
| `src/core/workspace/diff-types.ts` | **New** — domain types (`ReviewDiff`, `DiffFileEntry`, `DiffWarning`). |
| `src/core/workspace/diff-errors.ts` | **New** — `DiffSizePolicyError` for invalid config (not for size). |
| `src/core/workspace/index.ts` | **Modified** — re-export new use case, types, and errors. |
| `src/core/workspace/__test__/compute-review-diff.test.ts` | **New** — unit tests with GitPort fakes. |
| `src/core/workspace/__test__/workspace-git-fake.ts` | **Modified** — extend the fake to support `mergeBase` and `diff` (currently throws "not implemented"). |
| `src/core/repos/index.ts` | **Read-only dependency** — import `GitPort`, `DiffResult`, `FileStats`, `DiffLimitsSchema`, `GitMergeBaseError`, `GitDiffError`. |
| `src/core/repos/ports/config-schemas.ts` | **No changes** — `DiffLimitsSchema` already defines `maxLines` and `maxTokens`. |

## Design considerations

### Truncation strategy

When the diff exceeds limits, the use case must decide which files to truncate. The proposed strategy is greedy by size: sort files by their diff line count descending, truncate the largest first (replace their diff content with a marker like `[truncated — N lines]`), and repeat until the total is within limits. This maximizes the number of files with full diff content. Decision level: A (technical, reversible — the strategy can be refined later without API changes).

### Token estimation without external libraries

The core cannot import tokenizers (I/O whitelist: zod only). A simple heuristic — `Math.ceil(text.length / 4)` — is a well-known rough approximation for English-heavy code. The PRD says the limit is "configurable", implying the user tunes it to their engine's reality. The heuristic is documented as approximate. Decision level: A (the interface accepts tokens as a number; the estimation method is internal).

### Diff parsing

`GitPort.diff()` returns `{ raw: string, stats: FileStats[] }`. To truncate per file, the use case needs to split `raw` into per-file segments. Unified diff format uses `diff --git a/... b/...` headers as delimiters. A simple regex split on this pattern is sufficient for well-formed git output. This is pure string manipulation, no I/O. Decision level: A.

### Relationship to DiffLimitsSchema

`DiffLimitsSchema` (in `repos/ports/config-schemas.ts`) defines the config shape. The use case accepts a `DiffLimits` value (or undefined for defaults) as part of its deps/request. It does not read config directly — the caller (run orchestrator) resolves config and passes the limits in. This keeps the use case pure and testable.

### Warning as data, not side effect

The `DiffWarning` is returned in the result, not logged or thrown. The caller decides how to surface it (e.g., the TUI shows it, the run metadata records it). This follows the pattern of `ReviewWorktreeResult` — results carry all information, side effects are the caller's responsibility.

### Never-fail invariant

The use case must not throw on large diffs. Only genuinely unexpected failures (git errors, invalid config like negative limits) produce exceptions. A diff that exceeds limits by any amount is handled by truncation + warning. This is a hard invariant from the PRD.

## Initial risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Diff parsing regex fails on unusual file paths (spaces, binary markers) | Low | Medium — a file's diff content might be misattributed | Test with edge-case fixtures (binary files, renamed files, paths with spaces). |
| Token heuristic significantly under/overestimates for non-Latin code | Medium | Low — user tunes `maxTokens` to compensate | Document the heuristic; the limit is a soft guideline, not a hard guarantee. |
| Very large diffs cause performance issues during parsing/truncation | Low | Low — this is a CLI, not a server; diffs are bounded by PR size | Process line-by-line if needed; no eagerness to optimize prematurely. |
| Truncating too aggressively leaves no useful diff content | Low | Medium — review quality degrades | Ensure at least the smallest files retain their diffs; warn prominently. |
| Cross-module import pattern violates guards | Low | High — CI red | Import only from `repos/index.ts`; verify with `npm run check`. |

## Dependencies

- **E2.F1.H2** (merged) — `GitPort` with `mergeBase` and `diff` methods.
- **E2.F3.H1** (merged) — workspace module structure and test patterns.
- **E0.F1.H2** (merged) — architecture guards for import validation.

## Acceptance criteria (from backlog)

1. Configurable limit (lines and tokens).
2. Warning visible in the run (returned as structured data in the result).
3. Truncation preserves the full list of affected files (every file appears in the output with path and stats, even if its diff content is truncated).
