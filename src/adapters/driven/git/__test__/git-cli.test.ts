/**
 * git-cli-adapter test: drives the shared `GitPort` contract suite through
 * a harness over `createGitCliAdapter`. The fixture provisions two hermetic
 * bare repos in `os.tmpdir()` (one initialised with `-b main`, a second
 * with `-b trunk`) so AC-4 sentence 2 (`defaultBranch({ remote: 'upstream'
 * })`) cannot pass by coincidence.
 *
 * `createGitCliAdapter` is imported from the driven-git PUBLIC index
 * (`../index.js`), proving the adapter is reachable through its public API
 * (mirrors the FakeEngine test — dec-006 of E0.F2.H2 for engines).
 *
 * The fixture drives git through a small `git(...)` helper that always
 * passes per-invocation identity flags (`-c user.email=... -c
 * user.name=...`, dec-008) and the hermetic env from dec-009 — global +
 * system git config are neutralised, terminal prompts are disabled, and
 * locale is pinned to `C` so the runner's ambient config cannot hijack the
 * fixture.
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

/**
 * Hermetic git env (dec-009): `GIT_CONFIG_GLOBAL=/dev/null` and
 * `GIT_CONFIG_SYSTEM=/dev/null` neutralise the runner's `~/.gitconfig` and
 * `/etc/gitconfig` — no ambient `commit.gpgsign`, `core.hooksPath`,
 * `init.templateDir`, or `commit.template` can hijack the fixture.
 * `GIT_TERMINAL_PROMPT=0` prevents an interactive credential prompt from
 * hanging a spawn on a mistyped URL. `LC_ALL=C` / `LANG=C` pin stderr
 * wording — same reason the adapter pins them.
 */
const HERMETIC_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
  LANG: "C",
};

/** Fixture-side wrapper: every `git` spawn goes through here. */
async function git(args: readonly string[]) {
  return execa("git", args as string[], { env: HERMETIC_GIT_ENV });
}

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
    await git(["init", "--bare", "-b", "main", barePath]);
    await git(["clone", "--quiet", barePath, seedPath]);
    await git([
      "-C",
      seedPath,
      ...GIT_IDENTITY,
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ]);
    await git(["-C", seedPath, "branch", "feat-shared"]);
    await git(["-C", seedPath, "push", "-u", "origin", "main", "feat-shared"]);

    // Second bare with a DIFFERENT default branch (`trunk`) so AC-4
    // sentence 2 cannot pass by coincidence.
    await git(["init", "--bare", "-b", "trunk", upstreamBarePath]);
    await git(["clone", "--quiet", upstreamBarePath, upstreamSeedPath]);
    await git([
      "-C",
      upstreamSeedPath,
      ...GIT_IDENTITY,
      "commit",
      "--allow-empty",
      "-m",
      "upstream-init",
    ]);
    await git(["-C", upstreamSeedPath, "push", "-u", "origin", "trunk"]);

    // The user-visible working clone: fresh clone of `origin` + `upstream`
    // remote added + fetched so `refs/remotes/upstream/HEAD` is populated.
    await git(["clone", "--quiet", barePath, clonePath]);
    await git(["-C", clonePath, "branch", "feat-local"]);
    // `pushedBranch` must exist BOTH locally and as `origin/<name>` on the
    // working clone — origin already has it (pushed from `seedPath`), so
    // materialise the local tracking branch here.
    await git(["-C", clonePath, "branch", "feat-shared", "origin/feat-shared"]);
    await git(["-C", clonePath, "remote", "add", "upstream", upstreamBarePath]);
    await git(["-C", clonePath, "fetch", "--quiet", "upstream"]);
    await git(["-C", clonePath, "remote", "set-head", "upstream", "--auto"]);

    // Empty repo: init only, no remote configured → no `refs/remotes/*/HEAD`.
    await git(["init", "-b", "main", emptyRepoPath]);

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
        try {
          await git(["clone", "--quiet", barePath, throwaway]);
          await git([
            "-C",
            throwaway,
            ...GIT_IDENTITY,
            "commit",
            "--allow-empty",
            "-m",
            "another",
          ]);
          await git(["-C", throwaway, "push", "origin", "main"]);
          const { stdout: sha } = await git([
            "-C",
            throwaway,
            "rev-parse",
            "HEAD",
          ]);
          return sha.trim();
        } finally {
          rmSync(throwaway, { recursive: true, force: true });
        }
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
