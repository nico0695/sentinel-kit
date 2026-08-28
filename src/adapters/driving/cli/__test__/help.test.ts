/**
 * Root `--help` behaviour of the CLI shell (AC-2, D2, D8).
 *
 * The whole assertion set runs in-process against a capturing `CliIo` and
 * never stubs `process`: if the adapter reached for the real streams or
 * `process.exit`, these tests would print nothing and never return an exit
 * code.
 */

import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createCli } from "../create-cli.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

describe("root help", () => {
  it("exits 0 and prints a non-empty usage block on stdout", async () => {
    const deps = createTestDeps();
    const exitCode = await createCli(deps).run(argv("--help"));

    expect(exitCode).toBe(0);
    expect(deps.io.out.length).toBeGreaterThan(0);
    expect(deps.io.out.join("\n")).toContain("Usage: sentinel");
    expect(deps.io.err).toEqual([]);
  });

  it("documents SENTINEL_HOME and its ~/.sentinel default", async () => {
    const deps = createTestDeps();
    const exitCode = await createCli(deps).run(argv("--help"));
    const help = deps.io.out.join("\n");

    expect(exitCode).toBe(0);
    expect(help).toContain("SENTINEL_HOME");
    expect(help).toContain("~/.sentinel");
  });

  it("documents SENTINEL_OPENCODE_MODEL", async () => {
    const deps = createTestDeps();
    await createCli(deps).run(argv("--help"));

    expect(deps.io.out.join("\n")).toContain("SENTINEL_OPENCODE_MODEL");
  });

  it("describes every option it declares", async () => {
    const deps = createTestDeps();
    await createCli(deps).run(argv("--help"));
    const help = deps.io.out.join("\n");

    expect(help).toContain("-V, --version");
    expect(help).toContain("print the sentinel version");
    expect(help).toContain("-h, --help");
  });

  it("accepts the short -h flag with the same outcome", async () => {
    const short = createTestDeps();
    const long = createTestDeps();

    const shortExit = await createCli(short).run(argv("-h"));
    const longExit = await createCli(long).run(argv("--help"));

    expect(shortExit).toBe(0);
    expect(longExit).toBe(0);
    expect(short.io.out).toEqual(long.io.out);
  });

  it("documents the review exit-code contract (AC-10)", async () => {
    const deps = createTestDeps();
    const exitCode = await createCli(deps).run(argv("review", "--help"));
    const help = deps.io.out.join("\n");

    expect(exitCode).toBe(0);
    expect(help).toContain("Exit codes:");
    // 0 = passed, the configurable default 1 = changes requested, 2 = could
    // not complete — the three branches a script tests.
    expect(help).toMatch(/0\s+the review passed/);
    expect(help).toContain("--changes-exit-code");
    expect(help).toMatch(/1\s+changes requested/);
    expect(help).toMatch(/2\s+the review could not complete/);
    expect(deps.io.err).toEqual([]);
  });

  it("propagates the shell's output routing to registered subcommands", async () => {
    // `commander` copies `exitOverride` and the output configuration into a
    // subcommand at `.command()` time, so a group registered by S6/S7 only
    // stays inside the injected io if the shell configured itself first.
    const deps = createTestDeps();
    const cli = createCli(deps, [
      (program: Command) => {
        program
          .command("demo")
          .description("a registered group")
          .action(() => undefined);
      },
    ]);

    const exitCode = await cli.run(argv("demo", "--help"));

    expect(exitCode).toBe(0);
    expect(deps.io.out.join("\n")).toContain("Usage: sentinel demo");
    expect(deps.io.err).toEqual([]);
  });
});
