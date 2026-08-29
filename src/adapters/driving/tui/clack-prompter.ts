/**
 * Driving adapter: tui — the clack-backed prompter (`[E6.F2.H1]`, #38).
 *
 * The ONLY file in the codebase allowed to import `@clack/prompts`, exactly
 * as `commander` is confined to the CLI adapter: a thin, declared-untested
 * translation layer (like `processIo` in the container) between the
 * library's idioms and the adapter's `TuiPrompter` contract.
 *
 * The one translation that matters (design §Resolution 1): clack resolves a
 * cancelled prompt to a *symbol* checked with `isCancel`, and this file is
 * where that symbol dies — every prompt returns a typed `PromptOutcome`, so
 * cancel is a value the flow pattern-matches (`{ kind: "cancel" }`), never a
 * sentinel or an exception (AC-4).
 *
 * Version note (e6f2h1-D5): written against the exact-pinned `1.7.0`. The
 * 1.x line kept the 0.x shapes this design assumed — `select`/`confirm`
 * resolve to `Value | symbol`, `spinner()` returns `start(msg?)`/`stop(msg?)`
 * — the only drift is additive (spinner gained `cancel`/`error`/`message`,
 * `stop` lost 0.x's unused `code` parameter), and none of it is reached
 * through the `TuiPrompter` seam.
 */

import { confirm, isCancel, select, spinner } from "@clack/prompts";
import type {
  PromptOutcome,
  TuiPrompter,
  TuiSelectOption,
  TuiSpinner,
} from "./tui-deps.js";

/** Collapses clack's `Value | symbol` union into the typed outcome. */
function toOutcome<T>(resolved: T | symbol): PromptOutcome<T> {
  return isCancel(resolved)
    ? { kind: "cancel" }
    : { kind: "answer", value: resolved as T };
}

/** The real prompter. Instantiated in `src/main/` only (`createTuiDeps`). */
export function createClackPrompter(): TuiPrompter {
  return {
    select: async (input: {
      readonly message: string;
      readonly options: readonly TuiSelectOption[];
    }): Promise<PromptOutcome<string>> =>
      toOutcome(
        await select<string>({
          message: input.message,
          options: input.options.map((option) => ({
            value: option.value,
            label: option.label,
            ...(option.hint !== undefined ? { hint: option.hint } : {}),
          })),
        }),
      ),

    confirm: async (input: {
      readonly message: string;
    }): Promise<PromptOutcome<boolean>> =>
      toOutcome(await confirm({ message: input.message })),

    spinner: (): TuiSpinner => {
      const clackSpinner = spinner();
      return {
        start: (text: string): void => {
          clackSpinner.start(text);
        },
        stop: (text?: string): void => {
          clackSpinner.stop(text);
        },
      };
    },
  };
}
