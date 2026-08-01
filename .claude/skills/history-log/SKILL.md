---
name: history-log
description: |
  Generate or update the mandatory audit history entry for the current work session in history/entries/,
  following history/TEMPLATE.md, and keep history/INDEX.md in sync. Collects real evidence (git log, PRs,
  sdd-lite change state) and reconstructs the session's decisions with explicit authorship (user / claude /
  claude→user), deviations, and pending items. Required before closing a session, closing a story, or at
  any STOP (see CLAUDE.md "Audit history"). Entry content is written in Spanish.
  Triggers on: "history", "history-log", "cerrar sesion", "cerrar la sesion", "generar history",
  "auditar sesion", "log de sesion", "registrar la sesion", "actualizar history".
---

# history-log

Generates or updates the single audit entry for the current session under `history/`, per the rules in
`history/README.md` and the "Audit history" section of `CLAUDE.md`.

Entry text is **Spanish** (deliberate exception to the English-artifacts rule — see history/README.md).
Skill instructions are English.

## Workflow

### Step 1 — Locate session state

1. Read `history/INDEX.md` and determine the last session number `Snn`.
2. Check whether an entry for the **current** session already exists (same session = same conversation,
   even across multiple user turns). If yes → this run **updates** it; if no → create `S(nn+1)`.
3. Read `history/TEMPLATE.md` for the current structure. Never invent a different structure.

### Step 2 — Collect hard evidence (never from memory alone)

```bash
git log --oneline -20            # commits; compare against commits already recorded in the last entry
git status --short               # uncommitted work worth mentioning
git branch --show-current
```

- Open PRs: via GitHub MCP tools if available (`list_pull_requests` on the repo).
- sdd-lite changes touched this session: `ls sdd-lite/openspec/changes/` and each change's `state.yaml`
  (stage reached, checkpoints, decisions recorded there). Link, do not copy.

### Step 3 — Reconstruct the session narrative

From the conversation and the evidence, extract:

- **Objective**: what the session set out to do (1-2 lines).
- **Decisions**: every non-trivial decision, one row each, ID `Snn-Dk`. Classify authorship honestly:
  - `user` — the user decided on their own initiative.
  - `claude` — autonomous (level A) decision; the "why" column is mandatory.
  - `claude→user` — Claude presented alternatives with a recommendation; the user chose (level B).
- **Deviations**: anything that departed from plan, PRD, backlog, or documented assumptions — including
  resolved ones and level-C STOPs. Environment limitations that changed the approach count as deviations.
- **Work done**: commits (hash + message), PRs, artifacts created, validations run.
- **Pending / next steps**: with an explicit owner (user or Claude).
- **Open questions**: only genuinely unresolved ones; `—` otherwise.

Rules of honesty: do not embellish; failed attempts and dead ends are recorded as deviations or work done,
not omitted. If tests/checks did not run, say so.

### Step 4 — Write

1. Create or update `history/entries/YYYY-MM-DD-Snn-<slug>.md` (slug: short kebab-case Spanish).
2. On update: merge new decisions/work into the existing sections, never renumber existing decision IDs.
3. Add or update the entry's row in `history/INDEX.md` (newest first).
4. Keep it ~1 screen; move fine detail into links (sdd-lite artifacts, PRs, docs).

### Step 5 — Show and commit

1. Show the user a compact summary of what was recorded (decision count, deviations, pendings).
2. Commit the history files (`docs: history Snn — <slug>` or fold into the session's closing commit) and
   push to the session branch. Uncommitted history does not survive remote environments.

## Validation before finishing

- Entry follows TEMPLATE.md sections exactly.
- Every decision row has authorship and a non-empty "why".
- INDEX.md row matches the entry filename.
- No sdd-lite artifact content duplicated — links only.
- Committed and pushed (or explicitly folded into an imminent session commit).
