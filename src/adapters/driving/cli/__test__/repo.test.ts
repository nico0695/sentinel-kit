/**
 * `repo add` / `repo list` behaviour (AC-1, AC-2, AC-3, AC-10, AC-13).
 *
 * Everything runs through the real `createCli` path against fake use cases
 * and a capturing `CliIo`: no driven adapter, no filesystem, no `process`.
 * A command that could not be driven this way would be holding domain logic
 * it should not have (AC-1).
 */

import { describe, expect, it } from "vitest";
import {
  type RegisterRepoRequest,
  type RegisterRepoResult,
  RepoNotFoundError,
} from "../../../../core/repos/index.js";
import { createCli } from "../create-cli.js";
import {
  REGISTER_OUTCOME_FIELDS,
  REPO_LINE_FIELDS,
} from "../render/format-repos.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

function registered(alias: string): RegisterRepoResult {
  return {
    alias,
    entry: { url: `https://github.com/${alias}.git` },
    alreadyRegistered: false,
  };
}

describe("repo add", () => {
  it("maps the positional and every flag onto RegisterRepoRequest", async () => {
    const seen: RegisterRepoRequest[] = [];
    const deps = createTestDeps({
      useCases: {
        registerRepo: (request) => {
          seen.push(request);
          return Promise.resolve(registered("owner/repo"));
        },
      },
    });

    const exitCode = await createCli(deps).run(
      argv(
        "repo",
        "add",
        "https://github.com/owner/repo.git",
        "--local-path",
        "/srv/repo",
        "--base-branch",
        "develop",
        "--harness",
        "quick",
      ),
    );

    expect(exitCode).toBe(0);
    expect(seen).toEqual([
      {
        url: "https://github.com/owner/repo.git",
        localPath: "/srv/repo",
        baseBranch: "develop",
        defaultHarness: "quick",
      },
    ]);
  });

  it("omits absent flags instead of passing undefined values", async () => {
    const seen: RegisterRepoRequest[] = [];
    const deps = createTestDeps({
      useCases: {
        registerRepo: (request) => {
          seen.push(request);
          return Promise.resolve(registered("owner/repo"));
        },
      },
    });

    await createCli(deps).run(
      argv("repo", "add", "https://github.com/owner/repo.git"),
    );

    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] as RegisterRepoRequest)).toEqual(["url"]);
  });

  it("prints one tab-separated record on stdout and nothing on stderr", async () => {
    const deps = createTestDeps({
      useCases: {
        registerRepo: () =>
          Promise.resolve({
            alias: "owner/repo",
            entry: {
              url: "https://github.com/owner/repo.git",
              localPath: "/srv/repo",
            },
            alreadyRegistered: false,
          }),
      },
    });

    const exitCode = await createCli(deps).run(
      argv("repo", "add", "https://github.com/owner/repo.git"),
    );

    expect(exitCode).toBe(0);
    expect(deps.io.err).toEqual([]);
    expect(deps.io.out).toEqual(["owner/repo\tregistered\t/srv/repo"]);
    expect(deps.io.out[0]?.split("\t")).toHaveLength(
      REGISTER_OUTCOME_FIELDS.length,
    );
  });

  it("reports an already-registered repository honestly, without failing", async () => {
    const deps = createTestDeps({
      useCases: {
        registerRepo: () =>
          Promise.resolve({
            alias: "owner/repo",
            entry: { url: "https://github.com/owner/repo.git" },
            alreadyRegistered: true,
          }),
      },
    });

    const exitCode = await createCli(deps).run(
      argv("repo", "add", "https://github.com/owner/repo.git"),
    );

    expect(exitCode).toBe(0);
    expect(deps.io.out).toEqual(["owner/repo\talready-registered\t-"]);
  });

  it("renders a core error as one stderr line with no stack and exits non-zero", async () => {
    const deps = createTestDeps({
      useCases: {
        registerRepo: () => Promise.reject(new RepoNotFoundError("x/y")),
      },
    });

    const exitCode = await createCli(deps).run(
      argv("repo", "add", "https://github.com/x/y.git"),
    );

    expect(exitCode).not.toBe(0);
    expect(deps.io.out).toEqual([]);
    expect(deps.io.err).toEqual(["Repository not found: x/y"]);
    expect(deps.io.err.join("\n")).not.toContain("at ");
  });

  it("fails on a missing positional without calling the use case", async () => {
    const deps = createTestDeps();

    const exitCode = await createCli(deps).run(argv("repo", "add"));

    expect(exitCode).not.toBe(0);
    expect(deps.io.out).toEqual([]);
    expect(deps.io.err.length).toBeGreaterThan(0);
  });
});

describe("repo list", () => {
  it("prints one stable record per alias on stdout", async () => {
    const deps = createTestDeps({
      useCases: {
        listRepos: () =>
          Promise.resolve({
            repos: {
              "owner/repo": {
                url: "https://github.com/owner/repo.git",
                baseBranch: "main",
                defaultHarness: "pr-review",
              },
              "other/thing": { url: "git@github.com:other/thing.git" },
            },
          }),
      },
    });

    const exitCode = await createCli(deps).run(argv("repo", "list"));

    expect(exitCode).toBe(0);
    expect(deps.io.err).toEqual([]);
    expect(deps.io.out).toEqual([
      "owner/repo\thttps://github.com/owner/repo.git\tmain\tpr-review",
      "other/thing\tgit@github.com:other/thing.git\t-\t-",
    ]);
    for (const line of deps.io.out) {
      expect(line.split("\t")).toHaveLength(REPO_LINE_FIELDS.length);
    }
  });

  it("prints nothing on stdout for an empty registry, and a note on stderr", async () => {
    const deps = createTestDeps({
      useCases: { listRepos: () => Promise.resolve({ repos: {} }) },
    });

    const exitCode = await createCli(deps).run(argv("repo", "list"));

    expect(exitCode).toBe(0);
    expect(deps.io.out).toEqual([]);
    expect(deps.io.err.length).toBe(1);
  });

  it("preserves the registry's own order rather than sorting it", async () => {
    const deps = createTestDeps({
      useCases: {
        listRepos: () =>
          Promise.resolve({
            repos: {
              "z/last": { url: "https://example.test/z.git" },
              "a/first": { url: "https://example.test/a.git" },
            },
          }),
      },
    });

    await createCli(deps).run(argv("repo", "list"));

    expect(deps.io.out.map((line) => line.split("\t")[0])).toEqual([
      "z/last",
      "a/first",
    ]);
  });
});

describe("repo help (AC-2)", () => {
  it.each([
    ["repo", ["repo", "--help"], "Usage: sentinel repo"],
    ["repo add", ["repo", "add", "--help"], "Usage: sentinel repo add"],
    ["repo list", ["repo", "list", "--help"], "Usage: sentinel repo list"],
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

  it("describes every option and positional of repo add", async () => {
    const deps = createTestDeps();

    await createCli(deps).run(argv("repo", "add", "--help"));
    const help = deps.io.out.join("\n");

    expect(help).toContain("git URL of the repository");
    expect(help).toContain("--local-path <path>");
    expect(help).toContain("--base-branch <branch>");
    expect(help).toContain("--harness <name>");
  });

  it("lists both repo subcommands in the group help", async () => {
    const deps = createTestDeps();

    await createCli(deps).run(argv("repo", "--help"));
    const help = deps.io.out.join("\n");

    expect(help).toContain("add");
    expect(help).toContain("list");
  });
});
