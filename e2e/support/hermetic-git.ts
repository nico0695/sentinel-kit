/**
 * e2e support: a hermetic temporary git repository for the smoke suite
 * (`[E7.F1.H1]`, #41; spec S1/AC-2, design D-5).
 *
 * The recipe is restated here rather than imported from
 * `src/adapters/driven/git/__test__/git-cli.test.ts`, which is its origin: an
 * adapter's `__test__/` folder is that adapter's private world, and `e2e/`
 * owns its own fixtures. The two copies are expected to stay equivalent — if
 * the adapter suite's hermetic recipe changes, this file is the other place
 * to look.
 *
 * Not a `.test.ts` file, so the `e2e` vitest project (`e2e/**\/*.test.ts`)
 * does not collect it as a suite.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

/**
 * Identity passed per invocation instead of written into the repo's config:
 * the fixture never depends on `git config user.*` existing anywhere, and a
 * runner with no identity configured still produces commits.
 */
const GIT_IDENTITY = [
  "-c",
  "user.email=sentinel@test.local",
  "-c",
  "user.name=sentinel-test",
] as const;

/**
 * `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null` neutralise
 * `~/.gitconfig` and `/etc/gitconfig`, so no ambient `commit.gpgsign`,
 * `core.hooksPath`, `init.templateDir` or `init.defaultBranch` can reach the
 * fixture. `GIT_TERMINAL_PROMPT=0` keeps a credential prompt from hanging a
 * spawn. `LC_ALL=C` / `LANG=C` pin git's wording.
 *
 * The ambient repository-selecting and config-injecting names are set to
 * `undefined` explicitly (execa drops `undefined` entries): a suite launched
 * from a git hook, `git bisect run` or `git rebase --exec` inherits `GIT_DIR`
 * and friends, and `GIT_CONFIG_COUNT/KEY/VALUE` can set exactly the
 * `core.hooksPath` this comment claims is unreachable.
 */
const HERMETIC_GIT_ENV = {
  ...process.env,
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_CONFIG_COUNT: undefined,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
  LANG: "C",
};

/** Every git spawn of the fixture goes through here. */
async function git(args: readonly string[]): Promise<void> {
  await execa("git", [...args], { env: HERMETIC_GIT_ENV });
}

/** File committed on `main` only, after the feature branch was cut. */
export const BASE_ONLY_FILE = "unrelated.ts";

/** What the smoke needs to register a repository and review a branch. */
export interface HermeticRepo {
  /** Temp root holding every path below; the suite removes it in `afterEach`. */
  readonly root: string;
  /** Working clone, registered with `repo add --local-path`. */
  readonly repoPath: string;
  /** Pinned base branch — never `init.defaultBranch`. */
  readonly baseBranch: "main";
  /** Branch under review; carries one committed modification over the base. */
  readonly featureBranch: string;
}

/**
 * Provisions a bare origin plus a working clone with a seed commit on `main`
 * and a feature branch carrying a real diff, entirely inside `os.tmpdir()`
 * and without touching the network.
 *
 * The root is `realpath`ed because git reports canonical paths (on macOS
 * `tmpdir()` is a symlink into `/private/var`), and the smoke compares paths
 * git printed against paths it built itself.
 */
export async function createHermeticRepo(): Promise<HermeticRepo> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sentinel-e2e-")));
  try {
    return await provision(root);
  } catch (error) {
    // The root only reaches the caller through the return value, so a
    // provisioning failure would otherwise leak it with its path unrecoverable.
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

async function provision(root: string): Promise<HermeticRepo> {
  const barePath = join(root, "origin.git");
  const repoPath = join(root, "repo");
  const featureBranch = "feature/tighten-widget";

  await git(["init", "--bare", "-b", "main", barePath]);
  await git(["clone", "--quiet", barePath, repoPath]);

  writeFileSync(join(repoPath, "widget.ts"), "export const widget = 1;\n");
  await git(["-C", repoPath, "add", "widget.ts"]);
  await git([
    "-C",
    repoPath,
    ...GIT_IDENTITY,
    "commit",
    "-m",
    "seed: add widget",
  ]);
  await git(["-C", repoPath, "push", "-u", "origin", "main"]);
  // The clone was made from an empty origin, so `refs/remotes/origin/HEAD` was
  // never set and default-branch detection (`symbolic-ref` on it) would fail
  // with `GitNoDefaultBranchError`. Set it locally — no network — so a test can
  // register without `--base-branch` and let detection prove it yields `main`.
  await git(["-C", repoPath, "remote", "set-head", "origin", "main"]);

  await git(["-C", repoPath, "checkout", "-q", "-b", featureBranch]);
  writeFileSync(
    join(repoPath, "widget.ts"),
    "export const widget = 2;\nexport const tightened = true;\n",
  );
  await git(["-C", repoPath, "add", "widget.ts"]);
  await git([
    "-C",
    repoPath,
    ...GIT_IDENTITY,
    "commit",
    "-m",
    "feat: tighten widget",
  ]);
  await git(["-C", repoPath, "push", "-u", "origin", featureBranch]);

  // Advance `main` AFTER the feature branch was cut. Without this the branch
  // is cut from the tip of `main`, so `merge-base(main, feature) == main` and a
  // diff computed from the base ref instead of the merge-base (mutation M4 of
  // the fix round) is byte-identical to the correct one — undetectable. With
  // it, the merge-base is the seed commit, the correct diff is `widget.ts`
  // alone, and a wrongly-ranged diff also carries `unrelated.ts`. Do not
  // delete this commit as unused: the e2e diff assertions depend on it.
  await git(["-C", repoPath, "checkout", "-q", "main"]);
  writeFileSync(
    join(repoPath, BASE_ONLY_FILE),
    "export const unrelated = 1;\n",
  );
  await git(["-C", repoPath, "add", BASE_ONLY_FILE]);
  await git([
    "-C",
    repoPath,
    ...GIT_IDENTITY,
    "commit",
    "-m",
    "chore: advance main past the feature branch point",
  ]);
  await git(["-C", repoPath, "push", "origin", "main"]);

  // Leave the clone on the base branch: the review's worktree is created
  // detached at a resolved sha, but a clone parked on the branch under review
  // is a needlessly confusing starting state for anyone reading a leftover.
  await git(["-C", repoPath, "checkout", "-q", "main"]);

  return { root, repoPath, baseBranch: "main", featureBranch };
}
