/**
 * `runs list` / `runs show` behaviour (AC-1, AC-2, AC-3, AC-10, AC-13).
 *
 * The `risk-e6h1-009` regression guard lives here: the store returns objects
 * whose `repoName` is the normalised storage key (`owner__repo`, D7), and the
 * user must read back the alias they typed (`owner/repo`).
 */

import { describe, expect, it } from "vitest";
import {
  type GetRunRequest,
  type ListRunsRequest,
  RunNotFoundError,
  type RunRecord,
  type RunSummary,
} from "../../../../core/history/index.js";
import { createCli } from "../create-cli.js";
import {
  RUN_RECORD_FIELDS,
  RUN_SUMMARY_FIELDS,
} from "../render/format-runs.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

/** What the store returns: `repoName` already normalised to a storage key. */
const okSummary: RunSummary = {
  id: "20260824-000000-abc",
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  status: "ok",
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  verdict: "approve",
  engine: "claude-code",
};

const corruptSummary: RunSummary = {
  id: "20260824-000100-def",
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_100_000,
  status: "corrupt",
};

const record: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  engine: "claude-code",
  verdict: "approve",
  prompt: "line one\nline two",
  engineOutput: "verdict: approve\nlooks good",
  diff: {
    fileCount: 2,
    totalLines: 40,
    estimatedTokens: 500,
    truncated: false,
    warnings: ["binary file skipped"],
  },
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  validationOutput: ["npm test: ok"],
};

function fieldsOf(lines: readonly string[]): Map<string, string> {
  const entries = lines.map((line) => {
    const [key, ...rest] = line.split("\t");
    return [key ?? "", rest.join("\t")] as const;
  });

  return new Map(entries);
}

describe("runs list", () => {
  it("passes the alias verbatim to listRuns and prints one record per run", async () => {
    const seen: ListRunsRequest[] = [];
    const deps = createTestDeps({
      useCases: {
        listRuns: (request) => {
          seen.push(request);
          return Promise.resolve({ runs: [okSummary] });
        },
      },
    });

    const exitCode = await createCli(deps).run(
      argv("runs", "list", "owner/repo"),
    );

    expect(exitCode).toBe(0);
    expect(seen).toEqual([{ repoName: "owner/repo" }]);
    expect(deps.io.err).toEqual([]);
    expect(deps.io.out).toEqual([
      [
        "owner/repo",
        "20260824-000000-abc",
        "1700000000000",
        "ok",
        "ok",
        "approve",
        "pr-review",
        "claude-code",
        "main",
        "feature",
        "4200",
      ].join("\t"),
    ]);
    expect(deps.io.out[0]?.split("\t")).toHaveLength(RUN_SUMMARY_FIELDS.length);
  });

  // risk-e6h1-009 regression guard.
  it("echoes the alias the user typed, never the stored storage key", async () => {
    const deps = createTestDeps({
      useCases: { listRuns: () => Promise.resolve({ runs: [okSummary] }) },
    });

    await createCli(deps).run(argv("runs", "list", "owner/repo"));

    expect(okSummary.repoName).toBe("owner__repo");
    expect(deps.io.out.join("\n")).not.toContain("owner__repo");
    expect(deps.io.out[0]?.split("\t")[0]).toBe("owner/repo");
  });

  it("renders a corrupt entry with its status and no fabricated fields", async () => {
    const deps = createTestDeps({
      useCases: {
        listRuns: () =>
          Promise.resolve({
            runs: [
              okSummary,
              corruptSummary,
              { ...corruptSummary, id: "p", status: "partial" },
            ],
          }),
      },
    });

    await createCli(deps).run(argv("runs", "list", "owner/repo"));

    const corrupt = deps.io.out[1]?.split("\t") ?? [];
    const partial = deps.io.out[2]?.split("\t") ?? [];

    expect(corrupt).toHaveLength(RUN_SUMMARY_FIELDS.length);
    expect(corrupt[3]).toBe("corrupt");
    expect(partial[3]).toBe("partial");
    // Every field below `status` is absent, marked as such, not invented.
    expect(corrupt.slice(4)).toEqual(["-", "-", "-", "-", "-", "-", "-"]);
  });

  it("preserves the store's ordering rather than re-sorting it", async () => {
    const deps = createTestDeps({
      useCases: {
        listRuns: () => Promise.resolve({ runs: [corruptSummary, okSummary] }),
      },
    });

    await createCli(deps).run(argv("runs", "list", "owner/repo"));

    expect(deps.io.out.map((line) => line.split("\t")[1])).toEqual([
      corruptSummary.id,
      okSummary.id,
    ]);
  });

  it("prints nothing on stdout when the repository has no runs", async () => {
    const deps = createTestDeps({
      useCases: { listRuns: () => Promise.resolve({ runs: [] }) },
    });

    const exitCode = await createCli(deps).run(
      argv("runs", "list", "owner/repo"),
    );

    expect(exitCode).toBe(0);
    expect(deps.io.out).toEqual([]);
    expect(deps.io.err.length).toBe(1);
  });

  it("fails on a missing positional without calling the use case", async () => {
    const deps = createTestDeps();

    const exitCode = await createCli(deps).run(argv("runs", "list"));

    expect(exitCode).not.toBe(0);
    expect(deps.io.out).toEqual([]);
  });
});

describe("runs show", () => {
  it("passes the alias and id verbatim to getRun", async () => {
    const seen: GetRunRequest[] = [];
    const deps = createTestDeps({
      useCases: {
        getRun: (request) => {
          seen.push(request);
          return Promise.resolve(record);
        },
      },
    });

    const exitCode = await createCli(deps).run(
      argv("runs", "show", "owner/repo", "20260824-000000-abc"),
    );

    expect(exitCode).toBe(0);
    expect(seen).toEqual([
      { repoName: "owner/repo", id: "20260824-000000-abc" },
    ]);
  });

  it("prints the record as key/value lines on stdout in a fixed order", async () => {
    const deps = createTestDeps({
      useCases: { getRun: () => Promise.resolve(record) },
    });

    await createCli(deps).run(
      argv("runs", "show", "owner/repo", "20260824-000000-abc"),
    );

    const scalarLines = deps.io.out.slice(0, RUN_RECORD_FIELDS.length);
    expect(scalarLines.map((line) => line.split("\t")[0])).toEqual([
      ...RUN_RECORD_FIELDS,
    ]);

    const fields = fieldsOf(scalarLines);
    expect(fields.get("repo")).toBe("owner/repo");
    expect(fields.get("id")).toBe("20260824-000000-abc");
    expect(fields.get("state")).toBe("ok");
    expect(fields.get("verdict")).toBe("approve");
    expect(fields.get("diffFileCount")).toBe("2");
    expect(fields.get("usageTotalTokens")).toBe("120");
    expect(fields.get("promptLineCount")).toBe("2");
    expect(deps.io.err).toEqual([]);
  });

  // risk-e6h1-009 regression guard.
  it("echoes the alias the user typed, never the stored storage key", async () => {
    const deps = createTestDeps({
      useCases: { getRun: () => Promise.resolve(record) },
    });

    await createCli(deps).run(
      argv("runs", "show", "owner/repo", "20260824-000000-abc"),
    );

    expect(record.repoName).toBe("owner__repo");
    expect(deps.io.out.join("\n")).not.toContain("owner__repo");
  });

  it("emits count-prefixed sections for the multi-line values", async () => {
    const deps = createTestDeps({
      useCases: { getRun: () => Promise.resolve(record) },
    });

    await createCli(deps).run(
      argv("runs", "show", "owner/repo", "20260824-000000-abc"),
    );

    const sections = deps.io.out.slice(RUN_RECORD_FIELDS.length);
    expect(sections).toEqual([
      "diffWarnings\t1",
      "binary file skipped",
      "validationOutput\t1",
      "npm test: ok",
      "engineOutput\t2",
      "verdict: approve",
      "looks good",
    ]);
  });

  it("marks absent fields rather than fabricating them", async () => {
    const minimal: RunRecord = {
      repoName: "owner__repo",
      startedAtEpochMs: 1,
      durationMs: 0,
      harness: "pr-review",
      baseRef: "main",
      targetRef: "feature",
      state: "engine-error",
      failure: { stage: "engine", message: "engine binary\nnot found" },
    };
    const deps = createTestDeps({
      useCases: { getRun: () => Promise.resolve(minimal) },
    });

    await createCli(deps).run(argv("runs", "show", "owner/repo", "id-1"));

    const fields = fieldsOf(deps.io.out.slice(0, RUN_RECORD_FIELDS.length));
    expect(fields.get("verdict")).toBe("-");
    expect(fields.get("engine")).toBe("-");
    expect(fields.get("diffFileCount")).toBe("-");
    expect(fields.get("usageTotalTokens")).toBe("-");
    expect(fields.get("promptLineCount")).toBe("-");
    expect(fields.get("failureStage")).toBe("engine");
    // A multi-line failure message is collapsed: one record, one line.
    expect(fields.get("failureMessage")).toBe("engine binary not found");
    expect(deps.io.out.slice(RUN_RECORD_FIELDS.length)).toEqual([
      "diffWarnings\t0",
      "validationOutput\t0",
      "engineOutput\t0",
    ]);
  });

  it("renders a core error as one stderr line and exits non-zero", async () => {
    const deps = createTestDeps({
      useCases: {
        getRun: () =>
          Promise.reject(new RunNotFoundError("owner/repo", "missing")),
      },
    });

    const exitCode = await createCli(deps).run(
      argv("runs", "show", "owner/repo", "missing"),
    );

    expect(exitCode).not.toBe(0);
    expect(deps.io.out).toEqual([]);
    expect(deps.io.err).toEqual(["Run not found: owner/repo/missing"]);
  });
});

describe("runs help (AC-2)", () => {
  it.each([
    ["runs", ["runs", "--help"], "Usage: sentinel runs"],
    ["runs list", ["runs", "list", "--help"], "Usage: sentinel runs list"],
    ["runs show", ["runs", "show", "--help"], "Usage: sentinel runs show"],
  ])(
    "%s prints a non-empty usage block and exits 0",
    async (_name, args, usage) => {
      const deps = createTestDeps();

      const exitCode = await createCli(deps).run(argv(...args));

      expect(exitCode).toBe(0);
      expect(deps.io.out.join("\n")).toContain(usage);
      expect(deps.io.err).toEqual([]);
    },
  );

  it("describes both positionals of runs show", async () => {
    const deps = createTestDeps();

    await createCli(deps).run(argv("runs", "show", "--help"));
    const help = deps.io.out.join("\n");

    expect(help).toContain("repository alias");
    expect(help).toContain("run id");
  });
});
