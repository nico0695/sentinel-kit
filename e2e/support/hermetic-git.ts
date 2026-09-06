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

import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
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
 */
export const HERMETIC_GIT_ENV = {
  ...process.env,
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

  // Leave the clone on the base branch: the review's worktree is created
  // detached at a resolved sha, but a clone parked on the branch under review
  // is a needlessly confusing starting state for anyone reading a leftover.
  await git(["-C", repoPath, "checkout", "-q", "main"]);

  return { root, repoPath, baseBranch: "main", featureBranch };
}
