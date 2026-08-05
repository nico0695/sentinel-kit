# 00 — Prerequisites: shared spike setup

## Objective

Both spikes (01, 02) run "on a test worktree with known diff" (backlog E1.F1.H1). This doc sets
up that environment **once**, verifies both engines are installed and authenticated, and records
the version info the spike results must be pinned to.

Everything here happens on **your local machine** — the engines need your real auth and an
interactive terminal for the initial checks.

## 1. Record the installed versions

CLI flags change between releases (PRD risk #1: "breaking changes in delegated CLIs"). Every
finding in docs 01/02 is only valid relative to a version, so record them first:

```bash
claude --version
opencode --version   # or `opencode version`, check `opencode --help`
```

Write both down — they go in the "Environment" section of each result doc.

## 2. Verify availability and auth

This mirrors what the adapters' `isAvailable()` will do in E4, so note *how* you detect each
state — that detection method is itself a spike finding.

**Claude Code**
- Binary on PATH: `which claude`
- Auth: run a trivial one-shot prompt (see doc 01). If it fails, note the exact error message
  and exit code — the adapter will need to recognize it. Check which env var(s) carry auth
  (e.g. `ANTHROPIC_API_KEY`) vs. stored login (`claude setup-token` / OAuth session).

**OpenCode**
- Binary on PATH: `which opencode`
- Auth: OpenCode is multi-provider; check `opencode auth list` (verify the subcommand in
  `opencode --help`). Note which provider/model you use for the spike — output shape may vary
  per provider, and the fixtures should say which one produced them.

## 3. Create the test repo with a known diff

Use a **throwaway local repo** (not sentinel-kit itself) so the diff is fully controlled and
small. The goal is a diff with at least one *obvious, plantable finding* so you can tell whether
the engine actually reviewed it.

```bash
mkdir -p ~/spikes/e1-test-repo && cd ~/spikes/e1-test-repo
git init -b main

# Base state
cat > calc.js <<'EOF'
export function add(a, b) {
  return a + b;
}

export function divide(a, b) {
  if (b === 0) throw new Error("division by zero");
  return a / b;
}
EOF
git add . && git commit -m "feat: base calculator"

# Feature branch with a planted bug (removes the zero-guard) + a style nit
git checkout -b feature/remove-guard
cat > calc.js <<'EOF'
export function add(a, b) {
  return a + b;
}

export function divide(a, b) {
  return a / b;
}

export function Multiply(a, b) {
  return a * b;
}
EOF
git add . && git commit -m "feat: add multiply, simplify divide"
git checkout main
```

Planted findings the review should catch: removed division-by-zero guard (correctness) and
`Multiply` naming (style nit). If an engine's review mentions neither, something about the
invocation is wrong (e.g. it never saw the diff).

## 4. Create the worktree and diff — exactly like sentinel will

Sentinel reviews from an **ephemeral worktree** and diffs `merge-base(base, target)..target`
(PR semantics). Reproduce that:

```bash
cd ~/spikes/e1-test-repo
git worktree add ../e1-test-wt feature/remove-guard
BASE=$(git merge-base main feature/remove-guard)
git diff "$BASE"..feature/remove-guard > ../e1-test-diff.patch
```

- The **worktree path** (`~/spikes/e1-test-wt`) is what `ReviewRequest.worktree.path` will be:
  run every engine invocation with this as the working directory (`cd` into it).
- The **diff file** (`e1-test-diff.patch`) is what gets injected inline into the prompt
  (context mode `inline`, the MVP default).

## 5. The test prompt

Use a fixed prompt for every invocation so results are comparable across engines and runs. It
must mirror what the E3 prompt assembler produces: instructions + verdict contract + inline diff.
A minimal but faithful version:

```
You are performing a code review of the following diff.

The first non-empty line of your response MUST be exactly one of:
VERDICT: approve
VERDICT: request-changes
VERDICT: comment

After the verdict line, list findings as:
[SEV: blocker|major|minor|nit] <file>:<line> — <summary>

Diff to review:

<paste the content of e1-test-diff.patch here>
```

Save it as `~/spikes/e1-prompt.txt`. Docs 01/02 refer to it as `$PROMPT_FILE`.

> Tip: for the "no verdict" and "noisy output" fixture cases (doc 03), you will use *variants*
> of this prompt (e.g. removing the verdict instructions). Keep this canonical version intact.

## Checklist

- [ ] Both CLI versions recorded.
- [ ] Both engines authenticated; detection method for "not available / not authenticated" noted per engine.
- [ ] Test repo created with planted findings; worktree + diff produced via merge-base.
- [ ] Canonical test prompt saved.
