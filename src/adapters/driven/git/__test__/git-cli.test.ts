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
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    // realpath: on macOS tmpdir() lives under /var -> /private/var; git reports
    // canonical paths (e.g. in `worktree list`), so the fixture must compare against them.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "sentinel-git-")));

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

    // H2 divergent-branch setup for merge-base + diff contract tests.
    // Record fork-point SHA before divergent commits.
    const { stdout: forkSha } = await git([
      "-C",
      seedPath,
      "rev-parse",
      "HEAD",
    ]);
    const forkPointSha = forkSha.trim();

    // feat-diverge: two file additions from the fork point.
    await git(["-C", seedPath, "checkout", "-b", "feat-diverge"]);
    writeFileSync(join(seedPath, "file-a.txt"), "feature-a\n");
    await git(["-C", seedPath, "add", "file-a.txt"]);
    await git(["-C", seedPath, ...GIT_IDENTITY, "commit", "-m", "add file-a"]);
    writeFileSync(join(seedPath, "file-b.txt"), "feature-b\n");
    await git(["-C", seedPath, "add", "file-b.txt"]);
    await git(["-C", seedPath, ...GIT_IDENTITY, "commit", "-m", "add file-b"]);
    await git(["-C", seedPath, "push", "-u", "origin", "feat-diverge"]);

    // Back on main: one independent file addition (should NOT appear in
    // the PR-semantics diff against feat-diverge).
    await git(["-C", seedPath, "checkout", "main"]);
    writeFileSync(join(seedPath, "file-c.txt"), "base-only\n");
    await git(["-C", seedPath, "add", "file-c.txt"]);
    await git([
      "-C",
      seedPath,
      ...GIT_IDENTITY,
      "commit",
      "-m",
      "add file-c (base only)",
    ]);
    await git(["-C", seedPath, "push", "origin", "main"]);

    // `feat-remote-only`: pushed to origin, NEVER materialised as a local
    // branch in `clonePath` — the shape of a PR branch in a managed clone
    // and the case `worktree add --detach` cannot DWIM (risk-e6h1-014).
    await git(["-C", seedPath, "checkout", "-q", "-b", "feat-remote-only"]);
    writeFileSync(join(seedPath, "file-remote-only.txt"), "remote-only\n");
    await git(["-C", seedPath, "add", "file-remote-only.txt"]);
    await git([
      "-C",
      seedPath,
      ...GIT_IDENTITY,
      "commit",
      "-m",
      "add file-remote-only",
    ]);
    await git(["-C", seedPath, "push", "-u", "origin", "feat-remote-only"]);
    const { stdout: remoteOnlySha } = await git([
      "-C",
      seedPath,
      "rev-parse",
      "HEAD",
    ]);
    await git(["-C", seedPath, "checkout", "-q", "main"]);

    // `feat-ambiguous`: pushed to origin at main's tip; a LOCAL ref of the
    // same name is created below at the fork point, so the two refs differ
    // and local-vs-remote precedence is observable.
    await git(["-C", seedPath, "branch", "feat-ambiguous"]);
    await git(["-C", seedPath, "push", "origin", "feat-ambiguous"]);
    const { stdout: ambiguousRemote } = await git([
      "-C",
      seedPath,
      "rev-parse",
      "feat-ambiguous",
    ]);

    // `feat-both`: same branch name on BOTH remotes, local on neither —
    // unresolvable without a `<remote>/` qualifier.
    await git(["-C", seedPath, "branch", "feat-both"]);
    await git(["-C", seedPath, "push", "origin", "feat-both"]);
    await git(["-C", upstreamSeedPath, "branch", "feat-both"]);
    await git(["-C", upstreamSeedPath, "push", "origin", "feat-both"]);

    // Re-fetch in the working clone to pick up both divergent branches.
    await git(["-C", clonePath, "fetch", "--quiet", "origin"]);
    await git(["-C", clonePath, "fetch", "--quiet", "upstream"]);

    // The local half of the ambiguous pair, pinned to the fork point.
    await git(["-C", clonePath, "branch", "feat-ambiguous", forkPointSha]);

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
      remoteOnlyBranch: "feat-remote-only",
      remoteOnlyBranchSha: remoteOnlySha.trim(),
      ambiguousBranch: "feat-ambiguous",
      ambiguousLocalSha: forkPointSha,
      ambiguousRemoteSha: ambiguousRemote.trim(),
      multiRemoteBranch: "feat-both",
      knownCommitSha: forkPointSha,
      featureBranch: "feat-diverge",
      forkPointSha,
      featureBranchChangedFiles: 2,
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
