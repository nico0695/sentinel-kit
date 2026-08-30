/**
 * Test doubles for the TUI driving adapter (`[E6.F2.H1]`, #38).
 *
 * The CLI's pattern (`cli-test-doubles.ts`), extended by the one seam the TUI
 * adds: a **scripted prompter** — a queue of pre-decided `PromptOutcome`s
 * that records every prompt it was asked and fails loudly when the script
 * runs out. Together with the capturing io and the fake use cases, it is the
 * whole environment the flow needs (AC-12): no real TTY, no keypress
 * emulation, no `@clack/prompts` anywhere in the tests.
 */

import type { TuiPalette } from "../colors.js";
import type {
  PromptOutcome,
  TuiDeps,
  TuiIo,
  TuiPrompter,
  TuiReviewContext,
  TuiSelectOption,
  TuiTty,
  TuiUseCases,
} from "../tui-deps.js";

export interface CapturingTuiIo extends TuiIo {
  readonly out: string[];
  readonly err: string[];
}

/** A `TuiIo` that keeps every line instead of writing it anywhere. */
export function createCapturingTuiIo(): CapturingTuiIo {
  const out: string[] = [];
  const err: string[] = [];

  return {
    out,
    err,
    stdout: (line: string) => {
      out.push(line);
    },
    stderr: (line: string) => {
      err.push(line);
    },
  };
}

/**
 * Removes ANSI SGR escape sequences (`\x1b[<params>m`) from a captured line
 * (`[E6.F2.H2]`, #39; AC-14).
 *
 * The flow uses the real `TUI_PALETTE`, whose output depends on an ambient
 * decision `picocolors` makes once at load time — off by default here, ON
 * under `FORCE_COLOR=1` **and in any run that sets `CI`**. Flow assertions
 * therefore compare stripped lines: a no-op when colour is off, a real
 * removal when it is on, and the same expected strings either way. That
 * identity is what the AC-14 dual run (`NO_COLOR=1` / `FORCE_COLOR=1`)
 * verifies.
 *
 * Deliberately narrow — only SGR, no cursor or erase sequences, no terminal
 * emulation. Mirrors `core/run`'s private `stripAnsiSgr`; the guards forbid
 * importing it (and it is not exported), so the two-line body is duplicated
 * rather than shared.
 */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the ESC (0x1b) control byte is the deliberate target — SGR sequences begin with it by definition.
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * A deterministic palette that marks its roles instead of colouring them
 * (`[E6.F2.H2]`, #39; AC-14, AC-20).
 *
 * Two things become assertable that neither `PLAIN_PALETTE` nor the ambient
 * `TUI_PALETTE` can prove: that a renderer really uses the palette it is
 * given, and that stripping the decoration reproduces the plain render
 * exactly — "colour is decoration only", as an equality rather than a hope.
 *
 * **Why not the real palette.** `picocolors` decides once at load time from
 * `NO_COLOR` / `FORCE_COLOR` / TTY / `CI`, and when it decides OFF it binds
 * all four roles to the global `String` (`picocolors.js`,
 * `let f = enabled ? formatter : () => String`). Under the mandated local
 * gate — `npm test` with `CI` and `FORCE_COLOR` unset — `TUI_PALETTE.good`
 * therefore *is* the identity, so any assertion of the form "the real
 * palette decorates, and stripping undoes it" is a tautology there. That was
 * ledger finding R3-002. This palette decorates unconditionally, so the same
 * assertion means the same thing in every environment.
 *
 * **Why not `pc.createColors(true)`.** It would put a second `picocolors`
 * import inside `src/`, and the confinement rule AC-14 states is checked as
 * `grep -rEn '^import .*"picocolors"' src/` returning exactly one hit. The
 * test tree lives at `src/adapters/driving/tui/__test__/`, inside `src/`, so
 * that grep would return 2 and the gate would fail (decision F1a). The
 * `TuiPalette` import above is deliberately **type-only**: it is erased under
 * `verbatimModuleSyntax`, so this module adds no runtime load of `colors.js`
 * and therefore none of `picocolors` either.
 *
 * Shared here rather than copied into each suite: `result.test.ts` and
 * `full-view.test.ts` are the exact two files R2-005 flagged for duplicating
 * a helper, so a per-file copy would reproduce that defect inside the round
 * convened to remove it (decision F1a-bis).
 */
export const MARKED: TuiPalette = {
  good: (text) => `<good>${text}</good>`,
  warn: (text) => `<warn>${text}</warn>`,
  bad: (text) => `<bad>${text}</bad>`,
  muted: (text) => `<muted>${text}</muted>`,
};

/** Undoes {@link MARKED}. The inverse of the decoration, and nothing else. */
export function stripMarks(line: string): string {
  return line.replace(/<\/?(?:good|warn|bad|muted)>/g, "");
}

/** Shorthand for scripting an answered prompt. */
export function answer<T>(value: T): PromptOutcome<T> {
  return { kind: "answer", value };
}

/** Shorthand for scripting a cancelled prompt. */
export function cancel(): PromptOutcome<never> {
  return { kind: "cancel" };
}

/** One prompt the scripted prompter was asked, in the order it was asked. */
export interface RecordedPrompt {
  readonly kind: "select" | "confirm";
  readonly message: string;
  readonly options?: readonly TuiSelectOption[];
}

export interface ScriptedPrompter extends TuiPrompter {
  /** Every prompt asked, in order — the flow's interaction trace. */
  readonly prompts: RecordedPrompt[];
  /** `start:<text>` / `stop:<text>` events, in order (AC-6). */
  readonly spinnerEvents: string[];
}

/**
 * A prompter that answers from a fixed script. Each prompt consumes the next
 * outcome; a prompt beyond the script throws, so a flow that asks more than
 * the test decided fails loudly instead of hanging or improvising.
 */
export function createScriptedPrompter(
  script: ReadonlyArray<PromptOutcome<string | boolean>>,
): ScriptedPrompter {
  const queue = [...script];
  const prompts: RecordedPrompt[] = [];
  const spinnerEvents: string[] = [];

  const next = (prompt: RecordedPrompt): PromptOutcome<string | boolean> => {
    prompts.push(prompt);
    const outcome = queue.shift();
    if (outcome === undefined) {
      throw new Error(
        `prompt script exhausted: unexpected ${prompt.kind} "${prompt.message}"`,
      );
    }
    return outcome;
  };

  return {
    prompts,
    spinnerEvents,
    select: (input) =>
      Promise.resolve(
        next({
          kind: "select",
          message: input.message,
          options: input.options,
        }) as PromptOutcome<string>,
      ),
    confirm: (input) =>
      Promise.resolve(
        next({
          kind: "confirm",
          message: input.message,
        }) as PromptOutcome<boolean>,
      ),
    spinner: () => ({
      start: (text: string) => {
        spinnerEvents.push(`start:${text}`);
      },
      stop: (text?: string) => {
        spinnerEvents.push(`stop:${text ?? ""}`);
      },
    }),
  };
}

function notWired(name: string): () => never {
  return () => {
    throw new Error(`use case ${name} was not expected to be called`);
  };
}

/**
 * Fake use cases. Every entry rejects unless the test overrides it, so an
 * unexpected call fails loudly instead of silently returning `undefined`.
 */
export function createFakeTuiUseCases(
  overrides: Partial<TuiUseCases> = {},
): TuiUseCases {
  return {
    listRepos: notWired("listRepos"),
    listBranches: notWired("listBranches"),
    listHarnessTypes: notWired("listHarnessTypes"),
    runReview: notWired("runReview"),
    persistRun: notWired("persistRun"),
    ...overrides,
  };
}

export interface TuiTestDepsOverrides {
  readonly useCases?: Partial<TuiUseCases>;
  readonly io?: CapturingTuiIo;
  readonly prompter?: ScriptedPrompter;
  /** Defaults to fully interactive; AC-2 tests flip one or both flags. */
  readonly tty?: TuiTty;
  /** Left throwing by default so an unexpected config read fails loudly. */
  readonly loadContext?: () => Promise<TuiReviewContext>;
  /** Fixed clock; the flow reads it once, for the run's start instant. */
  readonly now?: () => number;
  readonly clonesDir?: string;
}

/**
 * Builds a complete `TuiDeps` around the capturing io, the scripted prompter
 * and the fakes. The prompter defaults to an EMPTY script, so a test that
 * expects no interaction (non-TTY guard, empty states) proves it structurally.
 */
export function createTuiTestDeps(
  overrides: TuiTestDepsOverrides = {},
): TuiDeps & {
  readonly io: CapturingTuiIo;
  readonly prompter: ScriptedPrompter;
} {
  const io = overrides.io ?? createCapturingTuiIo();
  const prompter = overrides.prompter ?? createScriptedPrompter([]);

  return {
    useCases: createFakeTuiUseCases(overrides.useCases ?? {}),
    io,
    prompter,
    tty: overrides.tty ?? { stdin: true, stdout: true },
    loadContext:
      overrides.loadContext ??
      (() => {
        throw new Error("loadContext was not expected to be called");
      }),
    now: overrides.now ?? (() => 0),
    clonesDir: overrides.clonesDir ?? "/tmp/sentinel-test/clones",
  };
}
