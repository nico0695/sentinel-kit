/**
 * Driving adapter: cli — the program shell (`[E6.F1.H1]`, #36, design §1).
 *
 * `createCli(deps)` assembles the `commander` program once and returns a
 * `run(argv) => Promise<number>` façade (design A-1). Three properties are
 * load-bearing:
 *
 * 1. **`run` owns the exit code and returns it.** It never calls
 *    `process.exit`; `src/main/cli.ts` assigns the returned value to
 *    `process.exitCode`. Nothing in this adapter touches `process` at all —
 *    help, version, usage errors and results all flow through the injected
 *    `CliIo`, which is exactly what makes AC-2/AC-4/AC-12/AC-13 assertable
 *    in-process with a capturing writer and no global stubbing.
 * 2. **`exitOverride()` and `configureOutput` are set before any subcommand
 *    is registered**, because `commander` copies both settings into a
 *    subcommand at `.command()` time. A subcommand registered before them
 *    would still write to the real streams and call `process.exit`.
 * 3. **Exit codes come from `commander` or from the catch-all**, never from a
 *    command inspecting a review's terminal state — AC-12's boundary with
 *    `[E6.F1.H2]`, which is the story that introduces the exit-code table.
 */

import { Command, CommanderError } from "commander";
import type { CliDeps, CliIo } from "./cli-deps.js";
import { registerRepoCommands } from "./commands/repo-commands.js";
import { registerRunsCommands } from "./commands/runs-commands.js";
import { formatErrorLine } from "./render/format-error.js";

/** The adapter's public entry point: parse an argv, resolve an exit code. */
export interface SentinelCli {
  run(argv: readonly string[]): Promise<number>;
}

/**
 * Registers one command group on the root program. The extension point the
 * command modules plug into: `[E6.F1.H1]`'s S6 adds `repo`/`runs` and S7 adds
 * `review`, each as a registrar in {@link commandRegistrars}, without the
 * shell knowing anything about them.
 */
export type CommandRegistrar = (program: Command, deps: CliDeps) => void;

/**
 * The command groups the real CLI exposes. `review` joins them in S7; the
 * parameter on `createCli` lets a test drive the shell with its own registrar
 * instead.
 */
export const commandRegistrars: readonly CommandRegistrar[] = [
  registerRepoCommands,
  registerRunsCommands,
];

const ROOT_DESCRIPTION = "AI-powered code review orchestrator";

/**
 * Root help footer. `SENTINEL_HOME` (D2) and `SENTINEL_OPENCODE_MODEL` (D8)
 * are public surface introduced by this story and have nowhere else to be
 * discovered until `[E7.F2.H1]` writes user documentation (AC-2).
 */
const ROOT_HELP_FOOTER = [
  "",
  "Environment variables:",
  "  SENTINEL_HOME            Root directory for sentinel state — config, repo",
  "                           clones, worktrees and run history.",
  "                           Defaults to ~/.sentinel when unset or empty.",
  "  SENTINEL_OPENCODE_MODEL  Model id (provider/model) passed to the opencode",
  "                           engine. Required only when a review resolves to",
  "                           the opencode engine.",
].join("\n");

/**
 * Routes a `commander` output chunk into the injected line writer. `commander`
 * writes chunks with a trailing newline and multi-line help in one call, while
 * `CliIo` is line-oriented (AC-10), so the chunk is split and the trailing
 * newline dropped.
 */
function writeChunk(sink: (line: string) => void, chunk: string): void {
  const body = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;

  for (const line of body.split("\n")) {
    sink(line);
  }
}

function buildProgram(
  deps: CliDeps,
  registrars: readonly CommandRegistrar[],
): Command {
  const program = new Command();

  program
    .name("sentinel")
    .description(ROOT_DESCRIPTION)
    .version(deps.version, "-V, --version", "print the sentinel version")
    .configureOutput({
      writeOut: (str) => {
        writeChunk((line) => deps.io.stdout(line), str);
      },
      writeErr: (str) => {
        writeChunk((line) => deps.io.stderr(line), str);
      },
    })
    .exitOverride()
    .addHelpText("after", ROOT_HELP_FOOTER);

  for (const registrar of registrars) {
    registrar(program, deps);
  }

  return program;
}

async function runProgram(
  program: Command,
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  try {
    await program.parseAsync([...argv]);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      // `--help` and `--version` land here with exitCode 0; usage errors
      // (unknown command, unknown option, missing argument) carry a non-zero
      // code and have already written their message through `writeErr`.
      return error.exitCode;
    }

    io.stderr(formatErrorLine(error));
    return 1;
  }
}

/**
 * Builds the sentinel CLI. Pure: it constructs no adapter, reads no file and
 * touches no environment — every fact arrives through `deps`.
 */
export function createCli(
  deps: CliDeps,
  registrars: readonly CommandRegistrar[] = commandRegistrars,
): SentinelCli {
  const program = buildProgram(deps, registrars);

  return {
    run: (argv: readonly string[]): Promise<number> =>
      runProgram(program, argv, deps.io),
  };
}
