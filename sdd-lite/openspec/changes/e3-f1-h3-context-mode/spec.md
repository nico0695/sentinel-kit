# Spec: e3-f1-h3-context-mode

## Routing Digest

| Field | Value |
|---|---|
| change_name | e3-f1-h3-context-mode |
| story | [E3.F1.H3] contextMode option in harness |
| issue | #21 |
| complexity | low |
| depends_on | e3-f1-h2-prompt-assembler (completed) |

## Scope Boundary

### In scope

- `ContextMode` type (`'inline' | 'agent'`) in `harness-schemas.ts`
- `contextMode` field on `Harness` interface (required, always present after loading)
- `HarnessSkillsSchema` extended to accept optional `contextMode` with Zod default `'inline'`
- New `ContextModeNotSupportedError` domain error in `harness-errors.ts`
- Guard in `assemblePrompt` that throws `ContextModeNotSupportedError` when `contextMode === 'agent'`
- Fs adapter passes `contextMode` from parsed `skills.yaml` into the `Harness` object (Zod default fills `'inline'` when omitted)
- Public export of `ContextMode` type and `ContextModeNotSupportedError` from `core/review/index.ts`
- Unit tests for: schema validation (both values + invalid rejected), default behavior, error on `agent` mode

### Out of scope

- Implementing agent context delivery
- Changes to `ReviewEngine`, run domain, or engine adapters
- CLI/TUI surface changes (no new flags or UI)
- Changes to `HarnessLoader` port interface (adapter constructs the full `Harness` internally)
- Changes to `ResolvedHarness` or `Skill` types

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | `HarnessSkillsSchema` accepts `contextMode: 'inline'` and `contextMode: 'agent'` | Unit test: parse succeeds for both values |
| AC2 | `HarnessSkillsSchema` defaults `contextMode` to `'inline'` when omitted | Unit test: parse `{ skills: [] }` yields `contextMode === 'inline'` |
| AC3 | `HarnessSkillsSchema` rejects invalid `contextMode` values | Unit test: parse `{ skills: [], contextMode: 'foo' }` fails |
| AC4 | `Harness.contextMode` is `ContextMode` (required, not optional) | TypeScript compilation — no `undefined` possible |
| AC5 | `assemblePrompt` throws `ContextModeNotSupportedError` when `contextMode === 'agent'` | Unit test: call with agent mode, assert error type and message |
| AC6 | `assemblePrompt` works unchanged when `contextMode === 'inline'` | Existing tests remain green |
| AC7 | Fs adapter produces `Harness` with `contextMode` populated | Adapter contract test: load harness without/with `contextMode` in `skills.yaml` |
| AC8 | `ContextModeNotSupportedError` extends `HarnessError` | Unit test: `instanceof HarnessError` is true |

## Functional Requirements

### FR1: Schema and Type

Add `ContextMode = 'inline' | 'agent'` as a named type. Extend `HarnessSkillsSchema`:

```
HarnessSkillsSchema = z.object({
  skills: z.array(z.string()),
  contextMode: z.enum(['inline', 'agent']).default('inline'),
})
```

The Zod `.default('inline')` ensures the parsed output always contains the field. `HarnessSkillsConfig` (inferred from the schema) gains the field automatically.

### FR2: Harness Interface

Add `contextMode: ContextMode` (required) to the `Harness` interface. Not optional — the adapter is responsible for filling the default via the Zod schema.

### FR3: Domain Error

`ContextModeNotSupportedError` extends `HarnessError`:
- Constructor: `(mode: string, options?: HarnessErrorOptions)`
- `name`: `'ContextModeNotSupportedError'`
- `mode` property: the unsupported mode string
- Message: `Context mode "${mode}" is not yet supported`

### FR4: Prompt Assembly Guard

At the top of `assemblePrompt`, before any rendering:

```
const { contextMode } = input.resolvedHarness.harness;
if (contextMode !== 'inline') {
  throw new ContextModeNotSupportedError(contextMode);
}
```

This is a hard error, not a warning. The caller (run use case) surfaces it as a terminal state.

### FR5: Fs Adapter Update

After parsing `skills.yaml` with the updated `HarnessSkillsSchema`, read `result.data.contextMode` and include it in the constructed `Harness` object. When `skills.yaml` is missing entirely (ENOENT path), default `contextMode` to `'inline'` (same as when the field is omitted from an existing file).

### FR6: Public Exports

Add to `core/review/index.ts`:
- `ContextMode` type from `./ports/harness-schemas.js`
- `ContextModeNotSupportedError` from `./ports/harness-errors.js`

## Migration / Compatibility

- **Backward compatible**: existing `skills.yaml` files without `contextMode` produce `'inline'` via Zod default. No migration needed.
- **Existing tests**: all current tests use implicit inline mode and remain green.
- **Snapshot impact**: `Harness` objects in snapshots gain `contextMode: 'inline'`. Snapshots must be updated.
