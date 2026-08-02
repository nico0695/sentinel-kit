/**
 * git-cli-adapter test: drives the shared `GitPort` contract suite through
 * a harness over `createGitCliAdapter`. The fixture provisions two hermetic
 * bare repos in `os.tmpdir()` (one initialised with `-b main`, a second with
 * `-b trunk`) so AC-4 sentence 2 (`defaultBranch({ remote: 'upstream' })`)
 * cannot pass by coincidence.
 *
 * `createGitCliAdapter` is imported from the driven-git PUBLIC index
 * (`../index.js`), proving the adapter is reachable through its public API
 * (mirrors the FakeEngine test — dec-006 of E0.F2.H2 for engines).
 *
 * The fixture calls git with per-invocation identity flags
 * (`git -c user.email=... -c user.name=... commit ...`, dec-008) so tests
 * pass on any runner regardless of ambient git config.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execa } from "execa";
import { createGitCliAdapter } from "../index.js";
import {
  type GitFixture,
  type GitPortContractHarness,
  gitPortContract,
} from "./GitPort.contract.js";

const GIT_IDENTITY = [
  "-c",
  "user.email=sentinel@test.local",
  "-c",
  "user.name=sentinel-test",
] as const;

const harness: GitPortContractHarness = {
  build: () => createGitCliAdapter(),

  setupFixture: async (): Promise<GitFixture> => {
    const root = mkdtempSync(join(tmpdir(), "sentinel-git-"));

    const barePath = join(root, "origin.git");
    const upstreamBarePath = join(root, "upstream.git");
    const seedPath = join(root, "seed");
    const upstreamSeedPath = join(root, "upstream-seed");
    const clonePath = join(root, "clone");
    const emptyRepoPath = join(root, "empty");
    const nonRepoPath = join(root, "not-a-repo");

    // Primary bare + seed commit + two branches; push both to origin.
    await execa("git", ["init", "--bare", "-b", "main", barePath]);
    await execa("git", ["clone", "--quiet", barePath, seedPath]);
    await execa("git", [
      "-C",
      seedPath,
      ...GIT_IDENTITY,
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ]);
    await execa("git", ["-C", seedPath, "branch", "feat-shared"]);
    await execa("git", [
      "-C",
      seedPath,
      "push",
      "-u",
      "origin",
      "main",
      "feat-shared",
    ]);

    // Second bare with a DIFFERENT default branch (`trunk`) so AC-4
    // sentence 2 cannot pass by coincidence.
    await execa("git", ["init", "--bare", "-b", "trunk", upstreamBarePath]);
    await execa("git", [
      "clone",
      "--quiet",
      upstreamBarePath,
      upstreamSeedPath,
    ]);
    await execa("git", [
      "-C",
      upstreamSeedPath,
      ...GIT_IDENTITY,
      "commit",
      "--allow-empty",
      "-m",
      "upstream-init",
    ]);
    await execa("git", [
      "-C",
      upstreamSeedPath,
      "push",
      "-u",
      "origin",
      "trunk",
    ]);

    // The user-visible working clone: fresh clone of `origin` + `upstream`
    // remote added + fetched so `refs/remotes/upstream/HEAD` is populated.
    await execa("git", ["clone", "--quiet", barePath, clonePath]);
    await execa("git", ["-C", clonePath, "branch", "feat-local"]);
    // `pushedBranch` must exist BOTH locally and as `origin/<name>` on the
    // working clone — origin already has it (pushed from `seedPath`), so
    // materialise the local tracking branch here.
    await execa("git", [
      "-C",
      clonePath,
      "branch",
      "feat-shared",
      "origin/feat-shared",
    ]);
    await execa("git", [
      "-C",
      clonePath,
      "remote",
      "add",
      "upstream",
      upstreamBarePath,
    ]);
    await execa("git", ["-C", clonePath, "fetch", "--quiet", "upstream"]);
    await execa("git", [
      "-C",
      clonePath,
      "remote",
      "set-head",
      "upstream",
      "--auto",
    ]);

    // Empty repo: init only, no remote configured → no `refs/remotes/*/HEAD`.
    await execa("git", ["init", "-b", "main", emptyRepoPath]);

    // Non-repo dir: portable node:fs (no reliance on PATH `mkdir`).
    mkdirSync(nonRepoPath, { recursive: true });

    return {
      barePath,
      upstreamBarePath,
      upstreamRemoteName: "upstream",
      upstreamDefaultBranch: "trunk",
      clonePath,
      emptyRepoPath,
      nonRepoPath,
      defaultBranch: "main",
      localOnlyBranch: "feat-local",
      pushedBranch: "feat-shared",
      addCommitToBare: async (): Promise<string> => {
        const throwaway = mkdtempSync(join(tmpdir(), "sentinel-git-push-"));
        await execa("git", ["clone", "--quiet", barePath, throwaway]);
        await execa("git", [
          "-C",
          throwaway,
          ...GIT_IDENTITY,
          "commit",
          "--allow-empty",
          "-m",
          "another",
        ]);
        await execa("git", ["-C", throwaway, "push", "origin", "main"]);
        const { stdout: sha } = await execa("git", [
          "-C",
          throwaway,
          "rev-parse",
          "HEAD",
        ]);
        rmSync(throwaway, { recursive: true, force: true });
        return sha.trim();
      },
    };
  },

  teardownFixture: async (fixture: GitFixture): Promise<void> => {
    // Every fixture child sits under a single `mkdtemp` root; derive it
    // portably from any known child.
    const root = dirname(fixture.barePath);
    rmSync(root, { recursive: true, force: true });
  },
};

gitPortContract(harness, "GitCliAdapter");
