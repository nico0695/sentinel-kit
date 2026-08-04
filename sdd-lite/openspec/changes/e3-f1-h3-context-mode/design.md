# Design: e3-f1-h3-context-mode

## Affected Files

| File | Action |
|---|---|
| `src/core/review/ports/harness-schemas.ts` | modify |
| `src/core/review/ports/harness-errors.ts` | modify |
| `src/core/review/assemble-prompt.ts` | modify |
| `src/core/review/index.ts` | modify |
| `src/adapters/driven/storage/harness-loader-fs.ts` | modify |
| `src/core/review/__test__/assemble-prompt.test.ts` | modify |
| `src/core/review/__test__/fake-harness-loader.ts` | no change needed |
| `src/core/review/__test__/load-harnesses.test.ts` | modify (helper) |
| `src/adapters/driven/storage/__test__/HarnessLoader.contract.ts` | modify |
| `src/adapters/driven/storage/__test__/harness-loader-fs.test.ts` | no change needed |

## File-by-File Changes

### 1. `src/core/review/ports/harness-schemas.ts`

Add the `ContextMode` type and extend the schema and interface.

```ts
// After existing imports, add type:
export type ContextMode = "inline" | "agent";

// Replace HarnessSkillsSchema:
export const HarnessSkillsSchema = z.object({
  skills: z.array(z.string()),
  contextMode: z.enum(["inline", "agent"]).default("inline"),
});

// Add contextMode to Harness interface:
export interface Harness {
  readonly type: string;
  readonly instructions: string;
  readonly outputContract?: string;
  readonly skills: readonly string[];
  readonly contextMode: ContextMode;  // new required field
}
```

`HarnessSkillsConfig` is inferred from the schema, so it gains `contextMode` automatically.

### 2. `src/core/review/ports/harness-errors.ts`

Append new error class after `SkillNotFoundError`:

```ts
export class ContextModeNotSupportedError extends HarnessError {
  readonly mode: string;
  constructor(mode: string, options?: HarnessErrorOptions) {
    super(`Context mode "${mode}" is not yet supported`, options);
    this.name = "ContextModeNotSupportedError";
    this.mode = mode;
  }
}
```

### 3. `src/core/review/assemble-prompt.ts`

Add import and guard at the top of `assemblePrompt`:

```ts
import { ContextModeNotSupportedError } from "./ports/harness-errors.js";

export function assemblePrompt(input: AssemblePromptInput): string {
  const { contextMode } = input.resolvedHarness.harness;
  if (contextMode === "agent") {
    throw new ContextModeNotSupportedError("agent");
  }
  // ...existing rendering logic unchanged...
}
```

No new import for `ContextMode` type is needed -- only the error class.

### 4. `src/core/review/index.ts`

Add two exports:

```ts
export { type ContextMode } from "./ports/harness-schemas.js";
// (add to existing harness-schemas re-export line)

export { ContextModeNotSupportedError } from "./ports/harness-errors.js";
// (add to existing harness-errors re-export line)
```

### 5. `src/adapters/driven/storage/harness-loader-fs.ts`

Two changes in `loadHarness`:

**A. After successful parse** (line ~95), read `contextMode` from parsed data:

```ts
skills = result.data.skills;
// add:
contextMode = result.data.contextMode;
```

Declare `contextMode` alongside `skills` (line ~74):

```ts
let skills: readonly string[] = [];
let contextMode: ContextMode = "inline";  // import ContextMode type
```

Import `ContextMode` from the schemas import (already importing from that path).

**B. ENOENT fallback**: already defaults to `"inline"` via the variable initializer -- no extra code needed.

**C. Harness construction** (line ~105):

```ts
const harness: Harness = { type, instructions, skills, contextMode };
```

### 6. Test changes

#### `src/core/review/__test__/assemble-prompt.test.ts`

- **Update `buildInput` helper**: add `contextMode: "inline"` to the harness object literal (line ~42).
- **New test case**: `"throws ContextModeNotSupportedError when contextMode is agent"`:

```ts
it("throws ContextModeNotSupportedError when contextMode is agent", () => {
  const input = buildInput({ contextMode: "agent" });
  expect(() => assemblePrompt(input)).toThrow(ContextModeNotSupportedError);
});
```

Add `contextMode` to the `buildInput` overrides type and wire it into the harness object.

- **New test case**: `"ContextModeNotSupportedError extends HarnessError"`:

```ts
it("ContextModeNotSupportedError extends HarnessError", () => {
  const err = new ContextModeNotSupportedError("agent");
  expect(err).toBeInstanceOf(HarnessError);
  expect(err.mode).toBe("agent");
  expect(err.name).toBe("ContextModeNotSupportedError");
});
```

- **Existing inline snapshots**: remain unchanged -- `assemblePrompt` output does not include `contextMode` in the rendered prompt, and all existing tests use `contextMode: "inline"` implicitly.

#### `src/core/review/__test__/load-harnesses.test.ts`

Update the `harness()` helper to include `contextMode: "inline" as const`:

```ts
function harness(type: string, skills: string[] = []): Harness {
  return { type, instructions: `${type} instructions`, skills, contextMode: "inline" };
}
```

#### `src/adapters/driven/storage/__test__/HarnessLoader.contract.ts`

Add two contract tests:

- `"loads harness with contextMode from skills.yaml"`: write `skills.yaml` with `contextMode: agent`, assert `h.contextMode === "agent"`.
- `"defaults contextMode to inline when skills.yaml omits it"`: write `skills.yaml` with only `skills: []`, assert `h.contextMode === "inline"`.

Update the existing `"loads valid harness with all files"` assertion to also check `h.contextMode === "inline"`.

Update `"loads minimal harness (harness.md only)"` to assert `h.contextMode === "inline"`.

#### `src/core/review/__test__/fake-harness-loader.ts`

No changes needed -- `FakeHarnessLoader.loadHarness` returns whatever `Harness` was stored via `addHarness`. Callers now pass harnesses with `contextMode` in the object literal.

## Risk Notes

- **Snapshot stability**: the `assemblePrompt` snapshots test rendered output, not the `Harness` object. `contextMode` does not appear in rendered output, so snapshots do not break.
- **Schema backward compatibility**: Zod `.default('inline')` makes missing field parse to `'inline'`.
