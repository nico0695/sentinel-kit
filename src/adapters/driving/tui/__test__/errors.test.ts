/**
 * Failure behaviour of the TUI shell (AC-2, AC-9).
 *
 * Every core error family relevant to a step is thrown through the real
 * `createTui(...).run()` path, so the assertions cover the catch-all the
 * flow installs — one friendly line on `stderr`, never a stack trace, exit
 * code 1 — not just the formatter in isolation. The non-TTY guard (AC-2) is
 * asserted in-process from the injected `tty` fact.
 */

import { describe, expect, it } from "vitest";
import type { PersistRunRequest } from "../../../../core/history/index.js";
import type {
  BranchRef,
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import {
  BranchListError,
  ConfigReadError,
  RepoNotFoundError,
} from "../../../../core/repos/index.js";
import { HarnessNotFoundError } from "../../../../core/review/index.js";
import type { RunReviewRequest } from "../../../../core/run/index.js";
import type { TuiTty } from "../tui-deps.js";
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

const branches: readonly BranchRef[] = [{ name: "feature", kind: "local" }];

/** Asserts the AC-9 contract on a captured `stderr`. */
function expectOneFriendlyLine(err: readonly string[], expected: string): void {
  expect(err).toEqual([expected]);
  expect(err[0]).not.toContain("\n");
  expect(err[0]).not.toContain(" at ");
}

describe("non-interactive streams (AC-2)", () => {
  const cases: ReadonlyArray<readonly [string, TuiTty]> = [
    ["stdin is not a TTY", { stdin: false, stdout: true }],
    ["stdout is not a TTY", { stdin: true, stdout: false }],
    ["neither stream is a TTY", { stdin: false, stdout: false }],
  ];

  it.each(cases)(
    "prints one guidance line and exits 1 when %s",
    async (_name, tty) => {
      const deps = createTuiTestDeps({ tty });

      // Resolving at all proves the flow never blocked waiting for input.
      const code = await createTui(deps).run();

      expect(code).toBe(1);
      expect(deps.io.err).toHaveLength(1);
      expect(deps.io.err[0]).toContain("sentinel review");
      expect(deps.io.err[0]).toContain("--help");
      expect(deps.io.out).toEqual([]);
      // No prompt seam was invoked (the empty default script would throw).
      expect(deps.prompter.prompts).toEqual([]);
      expect(deps.prompter.spinnerEvents).toEqual([]);
    },
  );
});

describe("typed core errors per step (AC-9)", () => {
  it("renders a listRepos failure as one stack-free line", async () => {
    const error = new ConfigReadError("cannot read repos.yaml", {
      cause: new Error("EACCES"),
    });
    const deps = createTuiTestDeps({
      useCases: { listRepos: () => Promise.reject(error) },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, error.message);
  });

  it("renders a listBranches failure and stops the fetch spinner", async () => {
    const error = new BranchListError(
      'Failed to fetch remotes for "owner/repo"',
    );
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([answer("owner/repo")]),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: () => Promise.reject(error),
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, error.message);
    // The indicator was started and stopped — a failure never leaves it live.
    expect(deps.prompter.spinnerEvents).toHaveLength(2);
    expect(deps.prompter.spinnerEvents[1]).toMatch(/^stop:/);
  });

  it("renders a harness enumeration failure as one stack-free line", async () => {
    const error = new HarnessNotFoundError("pr-review");
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([
        answer("owner/repo"),
        answer("feature"),
      ]),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: (request) =>
          Promise.resolve({ alias: request.alias, branches }),
        listHarnessTypes: () => Promise.reject(error),
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, error.message);
  });

  it("surfaces resolution errors before the confirmation gate", async () => {
    // `loadContext` returns a registry that no longer carries the selected
    // alias: `resolveReviewRequest` throws `RepoNotFoundError` before any
    // confirmation is asked and before anything runs.
    const runReviewRequests: RunReviewRequest[] = [];
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([
        answer("owner/repo"),
        answer("feature"),
        answer("pr-review"),
      ]),
      loadContext: () => Promise.resolve({ config, repos: {} }),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: (request) =>
          Promise.resolve({ alias: request.alias, branches }),
        listHarnessTypes: () => Promise.resolve(["pr-review"]),
        runReview: (request) => {
          runReviewRequests.push(request);
          return Promise.reject(new Error("runReview must not be reached"));
        },
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(
      deps.io.err,
      new RepoNotFoundError("owner/repo").message,
    );
    // Three selects were answered; no confirmation was ever asked.
    expect(
      deps.prompter.prompts.filter((prompt) => prompt.kind === "confirm"),
    ).toEqual([]);
    expect(runReviewRequests).toHaveLength(0);
  });

  it("renders a runReview failure and persists nothing", async () => {
    const persistRunRequests: PersistRunRequest[] = [];
    const deps = createTuiTestDeps({
      prompter: createScriptedPrompter([
        answer("owner/repo"),
        answer("feature"),
        answer("pr-review"),
        answer(true),
      ]),
      loadContext: () => Promise.resolve({ config, repos }),
      useCases: {
        listRepos: () => Promise.resolve({ repos }),
        listBranches: (request) =>
          Promise.resolve({ alias: request.alias, branches }),
        listHarnessTypes: () => Promise.resolve(["pr-review"]),
        runReview: () => Promise.reject(new Error("worktree exploded")),
        persistRun: (request) => {
          persistRunRequests.push(request);
          return Promise.reject(new Error("persistRun must not be reached"));
        },
      },
    });

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, "worktree exploded");
    expect(persistRunRequests).toHaveLength(0);
    // The run spinner was stopped on the way out.
    const events = deps.prompter.spinnerEvents;
    expect(events[events.length - 1]).toMatch(/^stop:/);
  });
});

describe("unexpected throwables (AC-9)", () => {
  const boom = (error: unknown) =>
    createTuiTestDeps({
      useCases: { listRepos: () => Promise.reject(error) },
    });

  it("renders a non-Error throwable without leaking its shape", async () => {
    const deps = boom("plain string failure");

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, "plain string failure");
  });

  it("collapses a multi-line message into a single line", async () => {
    const deps = boom(new Error("first line\n  second line\nthird line"));

    const code = await createTui(deps).run();

    expect(code).toBe(1);
    expectOneFriendlyLine(deps.io.err, "first line second line third line");
  });

  it("never includes stack frames in any output", async () => {
    const error = new Error("engine binary not found");
    const deps = boom(error);

    await createTui(deps).run();

    expect(error.stack ?? "").toContain("at ");
    const everything = [...deps.io.out, ...deps.io.err].join("\n");
    expect(everything).not.toContain("at ");
  });
});
