# sddl-project-standards-contract

This contract defines how `sdd-lite` represents project conventions, quality expectations, and language discipline.

## Persisted language rule

The following stay in English:

- shared contracts
- `SKILL.md` files
- schemas
- template files
- generated Markdown artifacts
- persistent keys and structured values

Chat interaction may use `es` or `en`.
Changing the chat language must not change persisted artifact language.

## Project profile representation

Project standards should be recoverable from `./sdd-lite/openspec/config.yaml` and `./sdd-lite/project-context.md` using these categories:

| Category | Examples |
|---|---|
| stack | languages, frameworks, runtime, package manager |
| structure | source roots, test roots, config roots, important directories |
| commands | install, test, build, lint, typecheck, format |
| conventions | naming, file placement, testing style, code style |
| sources of truth | manifests, lockfiles, maintained docs, executable config |
| risk notes | legacy zones, generated code, fragile modules, unclear ownership |

## Runtime standards registry

`./sdd-lite/skill-catalog.md` is the runtime standards registry for delegated stage work.

It should provide:

- compact rules by concern
- trigger mappings
- support-agent references
- delegation heuristics
- a short `Project Standards (auto-resolved)` section suitable for direct prompt injection

## Source-of-truth order

When project standards conflict, prefer this order:

1. executable project config and lockfiles
2. source tree reality
3. maintained docs
4. bootstrap artifacts under `./sdd-lite/`
5. user clarification

Older summaries must not override current executable evidence without explicit confirmation.

## Quality command shape

`config.yaml` should store quality commands as arrays of command strings.

Canonical keys:

- `install`
- `test`
- `build`
- `lint`
- `typecheck`

Optional keys:

- `format`
- `dev`

## Naming stability

These lite artifact names are fixed for the MVP:

- `project-context.md`
- `skill-catalog.md`
- `config.yaml`
- `state.yaml`
- `proposal.md`
- `spec.md`
- `design.md`
- `plan.md`
- `execution-log.md`
- `qa-report.md`
- `macro-plan.md`

## Conflict handling

If project standards are ambiguous or contradictory:

- prefer the safer execution path
- record the conflict in the relevant artifact or state
- ask the user only if the ambiguity changes scope, risk, or the chosen route

## Compact standards injection protocol

The preferred path is:

1. the orchestrator reads `./sdd-lite/skill-catalog.md` once
2. it selects only the relevant compact rules
3. it injects them into the delegated prompt as `## Project Standards (auto-resolved)`
4. the worker uses those rules without rediscovering them from multiple docs

Fallback order when the injected block is missing:

1. `./sdd-lite/skill-catalog.md`
2. `./sdd-lite/project-context.md`
3. targeted repo evidence

Workers should not start by scanning broad documentation if the injected standards block is already present.

## Reusable support references

Support agents may be referenced from `skill-catalog.md` as reusable patterns.
Those references guide routing and analysis, but they are not persisted runtime artifacts by themselves.
