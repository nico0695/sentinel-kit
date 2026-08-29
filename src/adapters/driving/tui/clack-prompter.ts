/**
 * Driving adapter: tui — the clack-backed prompter (`[E6.F2.H1]`, #38).
 *
 * The ONLY file in the codebase allowed to import `@clack/prompts`, exactly
 * as `commander` is confined to the CLI adapter. The clack `select`/`confirm`
 * mapping remains a thin, declared-untested translation layer (like
 * `processIo` in the container); the spinner is owned and tested here
 * (`__test__/spinner.test.ts`) — see the constraint below.
 *
 * The one translation that matters (design §Resolution 1): clack resolves a
 * cancelled prompt to a *symbol* checked with `isCancel`, and this file is
 * where that symbol dies — every prompt returns a typed `PromptOutcome`, so
 * cancel is a value the flow pattern-matches (`{ kind: "cancel" }`), never a
 * sentinel or an exception (AC-4).
 *
 * Spinner constraint (fix round 1, R1-001/R1-002): clack's `spinner()` is
 * deliberately NOT used. Its `start()` called `block()` from `@clack/core`,
 * which put stdin in raw mode with a keypress handler whose cancel branch
 * (Ctrl+C — no SIGINT is generated in raw mode — or Escape) was a bare
 * `process.exit(0)`, and registered five process listeners whose
 * SIGINT/SIGTERM path swallowed the first external termination signal. Under
 * an active spinner that orphaned the execa engine child, skipped
 * `runReview`'s in-process worktree cleanup and `persistRun`, and reported
 * success. The owned spinner below is interval-driven rendering only: it
 * never touches stdin, registers zero process listeners, and writes frames
 * to an injectable sink — so Ctrl+C is a real terminal SIGINT again and the
 * default disposition terminates the foreground process group (parent and
 * engine child, exit 130), exactly like the CLI path.
 *
 * Version note (e6f2h1-D5): written against the exact-pinned `1.7.0`. The
 * 1.x line kept the 0.x shapes this design assumed — `select`/`confirm`
 * resolve to `Value | symbol` — and the clack spinner API is no longer
 * reached at all.
 */

import { confirm, isCancel, select } from "@clack/prompts";
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

/**
 * Where the owned spinner renders. The same shape (and default) clack used:
 * `process.stdout`. Tests inject a capturing sink instead.
 */
export interface SpinnerOutput {
  write(chunk: string): void;
  readonly isTTY?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
/** `\r` + erase-line: repaint in place without touching other lines. */
const CLEAR_LINE = "\r\x1b[2K";

/**
 * The owned minimal spinner (fix round 1 mechanism): a `setInterval` frame
 * loop writing to the sink, cleared on `stop`. No stdin, no raw mode, no
 * process listeners — rendering is its entire footprint.
 */
function createOwnedSpinner(output: SpinnerOutput): TuiSpinner {
  let timer: ReturnType<typeof setInterval> | undefined;

  const clear = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  return {
    start: (text: string): void => {
      clear();
      let frame = 0;
      output.write(`${CLEAR_LINE}${SPINNER_FRAMES[frame]} ${text}`);
      timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        output.write(`${CLEAR_LINE}${SPINNER_FRAMES[frame]} ${text}`);
      }, SPINNER_INTERVAL_MS);
    },
    stop: (text?: string): void => {
      clear();
      output.write(text !== undefined ? `${CLEAR_LINE}${text}\n` : CLEAR_LINE);
    },
  };
}

export interface ClackPrompterOptions {
  /** Sink for owned-spinner frames; defaults to `process.stdout`. */
  readonly spinnerOutput?: SpinnerOutput;
}

/** The real prompter. Instantiated in `src/main/` only (`createTuiDeps`). */
export function createClackPrompter(
  options: ClackPrompterOptions = {},
): TuiPrompter {
  const spinnerOutput = options.spinnerOutput ?? process.stdout;

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

    spinner: (): TuiSpinner => createOwnedSpinner(spinnerOutput),
  };
}
