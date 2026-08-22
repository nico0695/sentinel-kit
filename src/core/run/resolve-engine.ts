/**
 * Core module: run — engine resolution (PRD §3.1-D, §6.2).
 *
 * Pure function implementing the cascade: per-run override wins over
 * per-repo override wins over the global default. `globalDefault` is typed
 * `EngineName` (already validated by `GlobalConfigSchema` upstream, not
 * re-validated here); `repoOverride`/`runOverride` are raw, unparsed strings
 * — a `repos.yaml` entry or a future `--engine` flag — validated only if
 * they win precedence. A shadowed, invalid lower-precedence value is never
 * inspected (see spec.md's Expected Behavior table).
 */
import { type EngineName, EngineNameSchema } from "../repos/index.js";
import { UnknownEngineError } from "./run-errors.js";

export interface ResolveEngineInput {
  readonly globalDefault: EngineName;
  readonly repoOverride?: string;
  readonly runOverride?: string;
}

export function resolveEngine(input: ResolveEngineInput): EngineName {
  const [value, level] =
    input.runOverride !== undefined
      ? ([input.runOverride, "run"] as const)
      : input.repoOverride !== undefined
        ? ([input.repoOverride, "repo"] as const)
        : ([input.globalDefault, "global"] as const);

  const parsed = EngineNameSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnknownEngineError(value, level);
  }
  return parsed.data;
}
