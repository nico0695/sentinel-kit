/**
 * Error and usage-failure behaviour of the CLI shell (AC-13, AC-10, AC-12).
 *
 * Every core error family is thrown from a command action through the real
 * `run` path, so the assertions cover the catch-all `createCli` installs, not
 * just the formatter in isolation.
 */

import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  RunCorruptedError,
  RunNotFoundError,
} from "../../../../core/history/index.js";
import {
  BranchListError,
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
  RepoNotFoundError,
} from "../../../../core/repos/index.js";
import { HarnessNotFoundError } from "../../../../core/review/index.js";
import {
  InvalidRunRequestError,
  UnknownEngineError,
} from "../../../../core/run/index.js";
import { createCli } from "../create-cli.js";
import { formatErrorLine } from "../render/format-error.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

/** Registers a single command whose action throws `error`. */
function throwing(error: unknown) {
  return (program: Command): void => {
    program
      .command("boom")
      .description("throws for the test")
      .action(() => {
        throw error;
      });
  };
}

const coreErrors: ReadonlyArray<readonly [string, Error]> = [
  ["RepoNotFoundError", new RepoNotFoundError("owner/repo")],
  [
    "ConfigValidationError",
    new ConfigValidationError("config.yaml is invalid", [
      { path: "defaultEngine", message: "unknown engine" },
    ]),
  ],
  [
    "ConfigReadError",
    new ConfigReadError("cannot read config.yaml", {
      cause: new Error("EACCES"),
    }),
  ],
  ["ConfigWriteError", new ConfigWriteError("cannot write repos.yaml")],
  ["BranchListError", new BranchListError("git branch listing failed")],
  ["RunNotFoundError", new RunNotFoundError("owner__repo", "20260824-01")],
  ["RunCorruptedError", new RunCorruptedError("owner__repo", "20260824-01")],
  ["UnknownEngineError", new UnknownEngineError("gpt", "run")],
  [
    "InvalidRunRequestError",
    new InvalidRunRequestError("harnessType is required"),
  ],
  ["HarnessNotFoundError", new HarnessNotFoundError("pr-review")],
];

describe("core errors reaching the shell", () => {
  it.each(coreErrors)(
    "renders %s as one stack-free line on stderr",
    async (_name, error) => {
      const deps = createTestDeps();
      const cli = createCli(deps, [throwing(error)]);

      const exitCode = await cli.run(argv("boom"));

      expect(exitCode).toBe(1);
      expect(deps.io.out).toEqual([]);
      expect(deps.io.err).toEqual([error.message]);
      expect(deps.io.err[0]).not.toContain("\n");
      expect(deps.io.err[0]).not.toContain(" at ");
      expect(deps.io.err[0]).not.toContain(error.name);
    },
  );

  it("renders an asynchronously rejected action the same way", async () => {
    const deps = createTestDeps();
    const cli = createCli(deps, [
      (program: Command) => {
        program
          .command("boom")
          .description("rejects for the test")
          .action(async () => {
            await Promise.resolve();
            throw new RepoNotFoundError("owner/repo");
          });
      },
    ]);

    const exitCode = await cli.run(argv("boom"));

    expect(exitCode).toBe(1);
    expect(deps.io.err).toEqual(["Repository not found: owner/repo"]);
  });

  it("collapses a multi-line message into a single line", async () => {
    const deps = createTestDeps();
    const cli = createCli(deps, [
      throwing(new Error("first line\n  second line\nthird line")),
    ]);

    const exitCode = await cli.run(argv("boom"));

    expect(exitCode).toBe(1);
    expect(deps.io.err).toEqual(["first line second line third line"]);
  });

  it("renders a non-Error throwable without leaking its shape", async () => {
    const deps = createTestDeps();
    const cli = createCli(deps, [throwing("plain string failure")]);

    const exitCode = await cli.run(argv("boom"));

    expect(exitCode).toBe(1);
    expect(deps.io.err).toEqual(["plain string failure"]);
  });
});

describe("usage failures", () => {
  it("exits non-zero with output on stderr for an unknown flag", async () => {
    const deps = createTestDeps();

    const exitCode = await createCli(deps).run(argv("--nope"));

    expect(exitCode).not.toBe(0);
    expect(deps.io.err.join("\n")).toContain("--nope");
    expect(deps.io.out).toEqual([]);
  });

  it("exits non-zero with output on stderr for an unknown command", async () => {
    const deps = createTestDeps();
    const cli = createCli(deps, [
      (program: Command) => {
        program
          .command("known")
          .description("registered")
          .action(() => undefined);
      },
    ]);

    const exitCode = await cli.run(argv("unknown-command"));

    expect(exitCode).not.toBe(0);
    expect(deps.io.err.length).toBeGreaterThan(0);
    expect(deps.io.out).toEqual([]);
  });

  it("returns the exit code instead of terminating the process", async () => {
    const deps = createTestDeps();
    const cli = createCli(deps, [throwing(new Error("still returns"))]);

    // Reaching the assertion at all proves `run` never called `process.exit`.
    await expect(cli.run(argv("boom"))).resolves.toBe(1);
  });
});

describe("formatErrorLine", () => {
  it("returns the message of an Error verbatim", () => {
    expect(formatErrorLine(new Error("boom"))).toBe("boom");
  });

  it("stringifies a non-Error value", () => {
    expect(formatErrorLine({ code: 42 })).toBe("[object Object]");
    expect(formatErrorLine(undefined)).toBe("undefined");
  });

  it("falls back to the error name when the message is empty", () => {
    expect(formatErrorLine(new RangeError(""))).toBe("RangeError");
  });

  it("never includes a stack trace", () => {
    const error = new Error("no stack here");

    expect(error.stack ?? "").toContain("no stack here");
    expect(formatErrorLine(error)).toBe("no stack here");
  });
});
