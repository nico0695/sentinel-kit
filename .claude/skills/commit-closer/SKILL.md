---
name: commit-closer
description: |
  Comprehensive commit closing workflow that generates commit messages, PR descriptions, and change analysis.
  Use when the user wants to wrap up a commit or set of commits, generate professional commit messages following
  Conventional Commits, produce a PR description with impact analysis and manual testing checklist, and
  optionally include analysis of previous commits in the same PR.
  Triggers on: "cerrar commit", "close commit", "generar commit message", "analizar cambios", "preparar PR",
  "cerrar el commit", "generar descripcion del PR", "commit y PR", "wrap up commit", "analizar mis cambios".
  All agent responses must be in Spanish. The skill instructions are written in English.
---

# Commit Closer

Workflow for generating commit messages, PR descriptions, and impact analysis from staged/unstaged git changes.

All output text must be in Spanish. All tool calls and git commands are in English as usual.

## Workflow

Follow these steps in order. Do not skip steps.

### Step 1 — Gather user context (mandatory)

Ask the user two specific questions before doing anything else. Do not proceed until both are answered:

1. **Descripción del cambio:** ¿Qué cambios realizaste y por qué?
2. **Impacto esperado:** ¿Qué áreas o funcionalidades del proyecto podrían verse afectadas por estos cambios?

These answers are the foundation of all output. If the user gives vague answers, ask for clarification once before proceeding.

### Step 2 — Analyze git state

Run these commands to understand what changed:

```bash
git status --short
git diff --stat HEAD
git diff HEAD
git log --oneline -1
```

If the repo has staged changes, also run:
```bash
git diff --cached --stat
git diff --cached
```

Read every modified file relevant to the change. If the project has a `docs/API_REFERENCE.md`, check if any modified module is documented there and read the relevant section to deepen the impact analysis.

For deep analysis: identify what each changed function/section does, how it's called, and what depends on it. Cross-reference with related files if needed.

### Step 3 — Generate commit messages

#### Commit format reference

Important: just one line, not include author or date in the message.

```
<type>(<scope>): <summary>

[optional body — what and why, not how]

[optional footer — BREAKING CHANGE: ..., Closes #X]
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructure without behavior change |
| `perf` | Performance improvement |
| `chore` | Build, tooling, dependency updates |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `style` | Formatting, whitespace (no logic change) |
| `ci` | CI/CD config changes |
| `revert` | Reverts a previous commit |

**Scopes** — use the module or layer affected:
- Modules: `conversations`, `alerts`, `tasks`, `notes`, `links`, `images`, `reminders`, `users`, `system`
- Layers: `controller`, `services`, `repositories`, `shared`
- Infrastructure: `config`, `build`, `deps`

**Summary line rules:**
- Imperative mood: "add" not "added" or "adds"
- No period at the end
- Max 72 characters
- Lowercase after the colon

**One-liner vs full message:**
- One-liner: change is small, single area, self-evident from the diff
- Full message: affects multiple areas, has side effects, or non-obvious reasoning worth preserving

---

Generate **6 commit message options** organized into two groups:

**Group A — Mensajes completos (full, with body)**
Produce 3 alternatives with different type/scope/emphasis combinations. Each must have:
- A subject line (≤72 chars, imperative, type + scope)
- A body explaining what changed and why (not how)
- Footers if applicable (BREAKING CHANGE, Closes #X)

**Group B — Mensajes simplificados (one-liner only)**
Produce 3 alternatives — concise subject lines only. Vary the phrasing and emphasis across the 3 options.

Present all 6 clearly labeled. Ask the user which one to use (or if they want to combine elements).

### Step 4 — Generate PR description

#### PR description structure

Produce a complete PR description in Spanish using this structure:

**### Descripción del cambio**
2–4 sentences. What was changed and why. Focus on behavior, not implementation details.

**### Archivos modificados**
Table with columns: `Archivo | Tipo de cambio | Detalle`. List every modified file — do not group or summarize.

**### Impacto en el proyecto**
Bullet list of affected modules or areas. Be specific: "afecta el endpoint REST de reminders" is better than "impacta el módulo". Use "podría afectar" when not confirmed.

**### Puntos a revisar y testear manualmente**
Actionable checklist with `- [ ]`. Each item must specify what to verify and in what scenario — never "verificar que funcione".

**### Contexto adicional** *(opcional)*
Include only if relevant: migration steps, related PRs, known limitations, pending work.

---

The analysis must be strict: identify real risks, not just hypothetical ones. If a change could break something, say it clearly.

### Step 5 — Offer previous commits analysis (optional)

Ask the user:

> "¿Querés incluir en el análisis commits anteriores del mismo PR? Esto es útil si el PR acumula varios commits que quieras agrupar en la descripción."

If yes:
1. Ask: "¿Cuántos commits para atrás, o hasta qué hash de commit?"
2. Run `git log --oneline -N` (where N is the number requested) or `git log --oneline <hash>..HEAD`
3. Display the full list: hash + message for each commit
4. Ask the user to confirm the list is correct, and whether any commit should be removed from the analysis
5. Wait for explicit confirmation before proceeding
6. Once confirmed, run `git show <hash>` for each commit and incorporate their changes into the PR description and impact analysis
7. Re-generate the PR description to include all commits

### Step 6 — Final output

Present the complete output grouped in this order:

1. **Mensajes de commit** — Group A (completos) then Group B (simplificados)
2. **Descripción del PR** — full PR description ready to paste
3. **Puntos a testear** — extracted from the PR description, as a standalone checklist
4. **Resumen ejecutivo** — 3–5 sentences maximum. What changed, why, and what needs attention. Easy to read at a glance.
5. *(Optional)* **Sección adicional** — only if genuinely relevant: migration notes, related work, architectural impact worth highlighting

## Rules

- All output text in Spanish. Git commands and file paths in English.
- Never skip Step 1 — user context is mandatory.
- Never mark a testing item as "check that it works" — each item must specify what to verify and in what scenario.
- If a modified file is under a module's `controller/` directory, identify which interface is affected: `<module>.controller.ts` handles Slack commands/events; `<module>Web.controller.ts` handles HTTP/REST endpoints. If both are modified, call it out explicitly in the impact section.
- If the diff touches event handlers, singletons, or global state, flag it in the impact section.
- Before suggesting to commit, warn the user once: this project has Husky pre-commit hooks that run `lint + tests` automatically — if they fail, the commit will be aborted.
- Keep sentences short. Avoid filler phrases like "cabe destacar que" or "es importante mencionar".
