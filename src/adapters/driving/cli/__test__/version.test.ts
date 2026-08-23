/**
 * `--version` behaviour (AC-4).
 *
 * Regression guard for `[E0.F1.H3]`'s contract — print the package version,
 * exit 0 — which this story rewrites the entrypoint around. The version is
 * injected, so the assertion cannot pass by accident against whatever
 * `package.json` happens to hold.
 */

import { describe, expect, it } from "vitest";
import { createCli } from "../create-cli.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

describe("--version", () => {
  it("prints the injected version on stdout and exits 0", async () => {
    const deps = createTestDeps({ version: "1.2.3-fixture" });

    const exitCode = await createCli(deps).run(argv("--version"));

    expect(exitCode).toBe(0);
    expect(deps.io.out).toEqual(["1.2.3-fixture"]);
    expect(deps.io.err).toEqual([]);
  });

  it("accepts the short -V flag", async () => {
    const deps = createTestDeps({ version: "9.9.9" });

    const exitCode = await createCli(deps).run(argv("-V"));

    expect(exitCode).toBe(0);
    expect(deps.io.out).toEqual(["9.9.9"]);
  });

  it("prints exactly one line, with no decoration around the version", async () => {
    const deps = createTestDeps({ version: "0.4.2" });

    await createCli(deps).run(argv("--version"));

    expect(deps.io.out).toHaveLength(1);
    expect(deps.io.out[0]).toBe("0.4.2");
  });
});
