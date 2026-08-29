/**
 * Empty states are informational dead-ends, not errors (AC-10, e6f2h1-A4):
 * one friendly explanatory line — with actionable guidance where one exists
 * — exit code 0, zero side effects, and no prompt beyond the last answered
 * one (the empty-script default makes that structural).
 */

import { describe, expect, it } from "vitest";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
} from "./tui-test-doubles.js";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

describe("empty states (AC-10)", () => {
  it("guides to `sentinel repo add` when no repository is registered", async () => {
    const deps = createTuiTestDeps({
      useCases: { listRepos: () => Promise.resolve({ repos: {} }) },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(0);
    expect(deps.io.out.join("\n")).toContain("sentinel repo add");
    // No prompt was ever started: the default script is empty and would throw.
    expect(deps.prompter.prompts).toEqual([]);
    expect(deps.io.err).toEqual([]);
  });

  it("names the repo and ends cleanly when it has zero branches after fetch", async () => {
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([answer("owner/repo")]),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: (request) =>
          Promise.resolve({ alias: request.alias, branches: [] }),
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(0);
    expect(deps.io.out.join("\n")).toContain('"owner/repo"');
    expect(deps.prompter.prompts).toHaveLength(1);
    expect(deps.io.err).toEqual([]);
  });

  it("hints at a broken installation when no harness is found", async () => {
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([
        answer("owner/repo"),
        answer("feature"),
      ]),
      loadContext: () => Promise.resolve({ config, repos }),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: (request) =>
          Promise.resolve({
            alias: request.alias,
            branches: [{ name: "feature", kind: "local" }],
          }),
        listHarnessTypes: () => Promise.resolve([]),
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(0);
    expect(deps.io.out.join("\n")).toContain("No harnesses found");
    expect(deps.prompter.prompts).toHaveLength(2);
    expect(deps.io.err).toEqual([]);
  });
});
