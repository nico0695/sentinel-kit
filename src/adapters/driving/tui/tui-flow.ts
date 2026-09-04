/**
 * Driving adapter: tui — the guided review flow (`[E6.F2.H1]`, #38).
 *
 * One sequential async function, not an event machine: the spec forbids
 * back-navigation (Non-Goals) and mid-run abort (D3), so there are no
 * transitions a state machine would earn its complexity with. Six steps —
 * repo → branch (fetch) → harness → confirmation → progress → result — each
 * returning early on cancel (exit 0), empty state (exit 0) or error (throw →
 * one friendly line, exit 1).
 *
 * Five properties are load-bearing:
 *
 * 1. **No cascade lives here.** `resolveReviewRequest` (core `run`, the CLI's
 *    D5) owns the registry lookup, the flag → repo → global precedence and
 *    the internal `resolveEngine` call — the TUI resolves a review exactly
 *    the way `review-command.ts` does. It runs *before* the confirmation
 *    gate, pure and read-only, so the summary can show the effective engine
 *    (AC-5) and cancelling after seeing it still has zero side effects.
 * 2. **Every prompt sits before `runReview`** and cancel is a value, so each
 *    cancel branch is a visible `return 0` with no worktree, no engine call
 *    and no persisted run behind it (AC-4, D3).
 * 3. **`persistRun` is called exactly once per completed run, whatever the
 *    terminal state** (AC-8). When it throws, the outcome is still rendered,
 *    a no-history diagnostic and the underlying failure go to `stderr`, and
 *    the exit code is 1 — mirroring `review-command.ts`'s D13 semantics.
 * 4. **A completed, persisted run exits 0 regardless of terminal state**
 *    (design §Interfaces, A-level, recorded): gate semantics
 *    (`resolveReviewExitCode`, `--changes-exit-code`) are the CLI's scripting
 *    contract, and the non-TTY guard guarantees no script consumes the TUI's
 *    exit code. Non-zero TUI exits mean *failures*: thrown errors (1) and
 *    the non-TTY guard (1).
 * 5. **The post-run prompt cannot change the exit code** (`[E6.F2.H2]`
 *    AC-10/AC-11). {@link offerFullViewSafely} returns `void` and **cannot
 *    reject**; it is called only after the `persistRun` `try`/`catch` has
 *    settled, on both branches, so the two `return` statements below it are
 *    unchanged and accepting, declining or cancelling the full view leaves
 *    both the rendered outcome and the exit code exactly as (completed,
 *    persisted) decided them.
 *
 *    **Amendment 2** (`e6f2h2-D19`, owner review of PR #76) is what makes
 *    that sentence true unconditionally instead of true by accident. The
 *    call used to be a bare `await offerFullView(...)`, so a throw from the
 *    optional prompt or from the print loop reached {@link createTui}'s
 *    catch-all and turned an already-completed, already-persisted review
 *    into exit 1 — contradicting this property and AC-10. The path is
 *    reachable without swapping the prompter: the print loop calls
 *    `io.stdout`, which is `process.stdout.write` in the real container and
 *    throws on EPIPE. The guard is a diagnostic, never a new outcome.
 */

import { resolveReviewRequest } from "../../../core/run/index.js";
import { TUI_PALETTE } from "./colors.js";
import {
  formatFullView,
  formatResultDigest,
  formatTuiErrorLine,
  type TuiResultDigest,
} from "./render.js";
import type { TuiDeps, TuiIo, TuiPrompter } from "./tui-deps.js";

/** The TUI surface `src/main/cli.ts` drives on a bare `sentinel`. */
export interface SentinelTui {
  /** Runs the flow and resolves the process exit code — never throws. */
  run(): Promise<number>;
}

/**
 * The non-interactive guidance (AC-2 / e6f2h1-A1): one line, `stderr`, exit
 * 1 — a misconfigured script fails loudly instead of silently doing nothing.
 */
const NON_TTY_GUIDANCE =
  "Interactive mode needs a terminal on stdin and stdout: run `sentinel review <repo> <branch> --type <harness>` instead, or see `sentinel --help`.";

/** Every pre-run cancel renders the same friendly line and exits 0 (AC-4). */
function cancelled(io: TuiIo): number {
  io.stdout("Review cancelled — nothing was run.");
  return 0;
}

export function createTui(deps: TuiDeps): SentinelTui {
  return {
    run: async (): Promise<number> => {
      // AC-2: decided in-process from the injected fact, before any prompt.
      if (!deps.tty.stdin || !deps.tty.stdout) {
        deps.io.stderr(NON_TTY_GUIDANCE);
        return 1;
      }

      try {
        return await runTuiFlow(deps);
      } catch (error) {
        // AC-9: typed core errors and unexpected exceptions alike — one
        // friendly line, no stack trace, exit 1.
        deps.io.stderr(formatTuiErrorLine(error));
        return 1;
      }
    },
  };
}

async function runTuiFlow(deps: TuiDeps): Promise<number> {
  const { io, prompter, useCases } = deps;

  io.stdout("sentinel — interactive review");

  // Step 1: repository.
  const { repos } = await useCases.listRepos();
  const aliases = Object.keys(repos);

  if (aliases.length === 0) {
    io.stdout(
      "No repositories registered yet. Add one with `sentinel repo add <alias> <url>` and run `sentinel` again.",
    );
    return 0;
  }

  const repoOutcome = await prompter.select({
    message: "Which repository do you want to review?",
    options: aliases.map((alias) => ({ value: alias, label: alias })),
  });
  if (repoOutcome.kind === "cancel") {
    return cancelled(io);
  }
  const repoAlias = repoOutcome.value;

  // Step 2: branch. The spinner is the fetch's visible activity (e6f2h1-A2);
  // stopped before rethrowing so a failure never leaves it spinning.
  const fetchSpinner = prompter.spinner();
  fetchSpinner.start(`Fetching branches for "${repoAlias}"`);

  let branchList: Awaited<ReturnType<typeof useCases.listBranches>>;
  try {
    branchList = await useCases.listBranches({ alias: repoAlias });
  } catch (error) {
    fetchSpinner.stop("Branch listing failed");
    throw error;
  }
  fetchSpinner.stop("Branches fetched");

  if (branchList.branches.length === 0) {
    io.stdout(`No branches found for "${repoAlias}" after fetching.`);
    return 0;
  }

  const branchOutcome = await prompter.select({
    message: "Which branch should be reviewed?",
    options: branchList.branches.map((branch) => ({
      value: branch.name,
      label: branch.name,
      ...(branch.kind === "remote" ? { hint: "remote" } : {}),
    })),
  });
  if (branchOutcome.kind === "cancel") {
    return cancelled(io);
  }
  const targetRef = branchOutcome.value;

  // Step 3: harness (names only, e6f2h1-A3).
  const harnessTypes = await useCases.listHarnessTypes();

  if (harnessTypes.length === 0) {
    io.stdout(
      "No harnesses found (factory and user sets are both empty): the installation looks broken or incomplete.",
    );
    return 0;
  }

  const harnessOutcome = await prompter.select({
    message: "Which harness should review it?",
    options: harnessTypes.map((type) => ({ value: type, label: type })),
  });
  if (harnessOutcome.kind === "cancel") {
    return cancelled(io);
  }
  const harnessType = harnessOutcome.value;

  // Step 4: confirmation. Resolving first — pure composition over read-only
  // config — surfaces `UnknownEngineError`/config errors before anything
  // runs and gives the summary the effective engine (AC-5).
  const { config, repos: registry } = await deps.loadContext();
  const request = resolveReviewRequest({
    repoAlias,
    targetRef,
    repos: registry,
    config,
    clonesDir: deps.clonesDir,
    flags: { harnessType },
  });

  io.stdout("About to run:");
  io.stdout(`  Repository: ${repoAlias}`);
  io.stdout(`  Branch: ${targetRef}`);
  io.stdout(`  Harness: ${harnessType}`);
  io.stdout(`  Engine: ${request.engineName ?? "-"}`);

  const confirmOutcome = await prompter.confirm({
    message: "Run this review?",
  });
  if (confirmOutcome.kind === "cancel" || !confirmOutcome.value) {
    return cancelled(io);
  }

  // Step 5: progress — one spinner with static text around the single
  // awaited call; no staged progress the core cannot report, no cancel (D3).
  const startedAtEpochMs = deps.now();
  const runSpinner = prompter.spinner();
  runSpinner.start("Running review… this may take a few minutes");

  let result: Awaited<ReturnType<typeof useCases.runReview>>;
  try {
    result = await useCases.runReview(request);
  } catch (error) {
    runSpinner.stop("Review failed");
    throw error;
  }
  runSpinner.stop("Review finished");

  // Step 6: persist exactly once (AC-8), then render.
  let persisted: Awaited<ReturnType<typeof useCases.persistRun>>;
  try {
    persisted = await useCases.persistRun({
      repoName: repoAlias,
      startedAtEpochMs,
      request,
      result,
    });
  } catch (error) {
    // D13 mirror: the review itself is finished — minutes of engine work —
    // and its outcome must not be swallowed because the record could not be
    // written. No `runDir` key at all: nothing was written, so the digest
    // renders `-` rather than fabricating a directory (`[E6.F2.H2]` AC-7).
    //
    // `exactOptionalPropertyTypes` is on, so every optional part is a
    // conditional spread — `verdict: undefined` would not typecheck.
    const unpersisted: TuiResultDigest = {
      state: result.state,
      ...(result.verdict !== undefined ? { verdict: result.verdict } : {}),
      ...(result.failure !== undefined
        ? {
            failure: {
              stage: result.failure.stage,
              // `[E6.F2.H2]` AC-6: the raw throwable reduced to the one
              // line the persisted path already carries in
              // `record.failure.message`.
              message: formatTuiErrorLine(result.failure.error),
            },
          }
        : {}),
      ...(result.engineOutput !== undefined
        ? { engineOutput: result.engineOutput }
        : {}),
    };

    for (const line of formatResultDigest(unpersisted, TUI_PALETTE)) {
      io.stdout(line);
    }
    io.stderr(
      "The review completed but its run could not be persisted: no history was written and `sentinel runs show` will not find it.",
    );
    io.stderr(formatTuiErrorLine(error));

    // Spec A6: offered here too — this is the one branch where the engine
    // output exists nowhere on disk. The exit code stays 1 whatever the
    // answer, and whatever the prompt does (`[E6.F2.H2]` AC-10).
    await offerFullViewSafely(io, prompter, result.engineOutput);

    return 1;
  }

  // The record is what was actually written, so it — not the in-memory
  // result — is what the digest reports (`[E6.F2.H2]` AC-5: the findings
  // section and the `Full review` pointer are keyed on `engineOutput`, never
  // on the state).
  const { record } = persisted;
  const digest: TuiResultDigest = {
    state: record.state,
    ...(record.verdict !== undefined ? { verdict: record.verdict } : {}),
    ...(record.failure !== undefined ? { failure: record.failure } : {}),
    ...(record.engineOutput !== undefined
      ? { engineOutput: record.engineOutput }
      : {}),
    runDir: persisted.runDir,
  };

  for (const line of formatResultDigest(digest, TUI_PALETTE)) {
    io.stdout(line);
  }

  // `[E6.F2.H2]` AC-8/A6: offered after the record was written, on the data the record
  // carries. Property 5: it cannot change what follows.
  await offerFullViewSafely(io, prompter, record.engineOutput);

  // Property 4 of the module doc-comment: completed + persisted → 0.
  return 0;
}

/**
 * The one-line diagnostic the guard below emits, with the underlying reason
 * appended. `stderr`, because it is a diagnostic and not part of the review
 * the user asked for — the same split every other line in this module obeys.
 */
const FULL_VIEW_FAILED = "The full review output could not be shown:";

/**
 * {@link offerFullView}, made unable to change what has already been decided
 * (`[E6.F2.H2]` AC-10, Amendment 2; ledger row `R4-001`).
 *
 * Everything this wrapper protects is already finished when it runs: the run
 * completed, `persistRun` has settled, and the digest is on screen. The exit
 * code is a function of (completed, persisted) and the optional prompt is not
 * one of its inputs — so a failure *inside* the prompt must be reported, not
 * promoted into the review's outcome. Without the guard the throw reaches
 * {@link createTui}'s catch-all and returns 1, which is the wrong answer for
 * a review that succeeded and was persisted.
 *
 * The failure is reachable through the shipped seam, not only a test double:
 * the print loop calls `io.stdout`, wired to `process.stdout.write`
 * (`src/main/container.ts`), which throws on EPIPE when the reader has gone
 * away — `sentinel | head`, a closed pager, a terminal that disappeared
 * mid-print.
 *
 * One line, no stack frame (`formatTuiErrorLine` collapses the message and
 * never touches `error.stack`), and no neutralisation pass: the throwable
 * comes from the io / prompter seam, and the only engine-derived text
 * reachable at that point — {@link formatFullView}'s output — has already
 * been neutralised on its way in.
 */
async function offerFullViewSafely(
  io: TuiIo,
  prompter: TuiPrompter,
  engineOutput: string | undefined,
): Promise<void> {
  try {
    await offerFullView(io, prompter, engineOutput);
  } catch (error) {
    io.stderr(`${FULL_VIEW_FAILED} ${formatTuiErrorLine(error)}`);
  }
}

/**
 * The opt-in full view (`[E6.F2.H2]`, #39; AC-8..AC-13, spec A6/A9).
 *
 * One `confirm`, asked only when there is something to show, printing the
 * engine's own markdown verbatim only when the answer is yes. Three
 * properties make it safe to bolt onto a finished run:
 *
 * - **It returns `void`, and reaches its call sites through
 *   {@link offerFullViewSafely}, which cannot reject.** Both call sites are
 *   the last statement before an unchanged `return`, so accept / decline /
 *   cancel — and, since Amendment 2, a prompt or print-loop *failure* — all
 *   leave the exit code as (completed, persisted) decided it (AC-10). Cancel
 *   is a *value* here too, never an exception and never a process exit:
 *   nothing in this function installs a listener, touches raw mode or reads
 *   `process`.
 * - **Blank or absent markdown asks nothing at all** (AC-9). The guard is
 *   what keeps a completed run without engine output at exactly the four
 *   pre-run prompts — deleting it makes every four-answer test script
 *   overrun, which is how the absence is proved rather than assumed.
 * - **No pager, no truncation, no second prompt** (AC-13): every line goes
 *   to `stdout` as it stands, and terminal scrollback is the pager.
 *
 * Offered on the persist-failure branch too (spec A6): that is precisely the
 * branch where the markdown exists nowhere on disk, so withholding it there
 * would invert the story's motivation.
 */
async function offerFullView(
  io: TuiIo,
  prompter: TuiPrompter,
  engineOutput: string | undefined,
): Promise<void> {
  // AC-9 / A9: the prompt promises content, so it needs non-blank markdown —
  // deliberately stricter than the digest's `Full review` path line, which
  // only promises the file `run-store-fs` writes for any defined value.
  if (engineOutput === undefined || engineOutput.trim() === "") {
    return;
  }

  const outcome = await prompter.confirm({
    message: "Show the full review output?",
  });

  // AC-8: "no" and cancel are the same silence — the digest already on
  // screen stands unchanged.
  if (outcome.kind === "cancel" || !outcome.value) {
    return;
  }

  for (const line of formatFullView(engineOutput, TUI_PALETTE)) {
    io.stdout(line);
  }
}
