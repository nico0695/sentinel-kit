/**
 * Test doubles for the CLI driving adapter (`[E6.F1.H1]`, #36).
 *
 * Two of them, and deliberately nothing else: a capturing `CliIo` and a bag
 * of fake use cases. Together they are the whole environment a command needs
 * (AC-1) — no driven adapter, no filesystem, no `process`. A command that
 * cannot be driven with these two has domain logic it should not have.
 */

import type { CliDeps, CliIo, CliUseCases } from "../cli-deps.js";

export interface CapturingIo extends CliIo {
  readonly out: string[];
  readonly err: string[];
}

/** A `CliIo` that keeps every line instead of writing it anywhere. */
export function createCapturingIo(): CapturingIo {
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

function notWired(name: string): () => never {
  return () => {
    throw new Error(`use case ${name} was not expected to be called`);
  };
}

/**
 * Fake use cases. Every entry rejects unless the test overrides it, so an
 * unexpected call fails loudly instead of silently returning `undefined`.
 */
export function createFakeUseCases(
  overrides: Partial<CliUseCases> = {},
): CliUseCases {
  return {
    registerRepo: notWired("registerRepo"),
    listRepos: notWired("listRepos"),
    runReview: notWired("runReview"),
    persistRun: notWired("persistRun"),
    listRuns: notWired("listRuns"),
    getRun: notWired("getRun"),
    ...overrides,
  };
}

export interface TestDepsOverrides {
  readonly useCases?: Partial<CliUseCases>;
  readonly io?: CapturingIo;
  readonly version?: string;
}

/** Builds a complete `CliDeps` around the capturing io and the fakes. */
export function createTestDeps(
  overrides: TestDepsOverrides = {},
): CliDeps & { readonly io: CapturingIo } {
  const io = overrides.io ?? createCapturingIo();

  return {
    useCases: createFakeUseCases(overrides.useCases ?? {}),
    io,
    loadContext: () => {
      throw new Error("loadContext was not expected to be called");
    },
    now: () => 0,
    version: overrides.version ?? "0.0.0-test",
    clonesDir: "/tmp/sentinel-test/clones",
  };
}

/** The argv shape `src/main/cli.ts` passes: `process.argv`. */
export function argv(...args: string[]): readonly string[] {
  return ["/usr/bin/node", "/tmp/sentinel/cli.js", ...args];
}
