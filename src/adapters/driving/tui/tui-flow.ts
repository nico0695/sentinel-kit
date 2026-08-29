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
 * Four properties are load-bearing:
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
 */

import { resolveReviewRequest } from "../../../core/run/index.js";
import { formatTuiErrorLine, formatTuiResult } from "./render.js";
import type { TuiDeps, TuiIo } from "./tui-deps.js";

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
    // written. `runDir` renders as `-` because no directory exists.
    for (const line of formatTuiResult(result.state, result.verdict)) {
      io.stdout(line);
    }
    io.stderr(
      "The review completed but its run could not be persisted: no history was written and `sentinel runs show` will not find it.",
    );
    io.stderr(formatTuiErrorLine(error));
    return 1;
  }

  for (const line of formatTuiResult(
    persisted.record.state,
    persisted.record.verdict,
    persisted.runDir,
  )) {
    io.stdout(line);
  }

  // Property 4 of the module doc-comment: completed + persisted → 0.
  return 0;
}
