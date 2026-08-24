/**
 * Composition root: sentinel home resolution (D2 / AC-7).
 *
 * Two distinct roots exist, and confusing them is the whole point of this
 * module:
 *
 * - the **sentinel home** — mutable user state (`config.yaml`, `repos.yaml`,
 *   user harnesses/skills, clones, worktrees, runs). `SENTINEL_HOME` when set
 *   and non-blank, otherwise `~/.sentinel`.
 * - the **package root** — the immutable directory the npm package ships, where
 *   the factory `harnesses/` and `skills/` live. Found by walking up to the
 *   nearest `package.json`, because `npm run dev` (`src/main/cli.ts`) and the
 *   bundled `dist/cli.js` sit at different depths.
 *
 * Every path this module returns is absolute. Nothing outside `src/main/`
 * resolves a path: `container.ts` calls `sentinelPaths()` **once** and hands the
 * single resulting object to every consumer.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Environment shape this module reads — `process.env` satisfies it. */
export type PathEnv = Readonly<Record<string, string | undefined>>;

const SENTINEL_HOME_VAR = "SENTINEL_HOME";
const DEFAULT_HOME_DIRNAME = ".sentinel";

/**
 * The full sentinel home layout, derived from a single root.
 *
 * This is deliberately one cohesive object rather than a set of loose strings:
 * `registerRepo` and `resolveReviewRequest` independently concatenate
 * `${clonesDir}/${alias}`, so `repo add` writing to one clones directory while
 * `review` reads from another would fail silently and invisibly to every
 * fake-based unit test. Passing this object around makes that divergence
 * impossible to express — there is only ever one `clonesDir` to hand out.
 */
export interface SentinelPaths {
  /** Home root. Base path for `createConfigStoreAdapter` and the user `createHarnessLoaderAdapter`. */
  readonly root: string;
  /** `<root>/config.yaml` — owned by the config store; exposed for diagnostics. */
  readonly configFile: string;
  /** `<root>/repos.yaml` — owned by the config store; exposed for diagnostics. */
  readonly reposFile: string;
  /** `<root>/harnesses` — user-defined harnesses (factory ones ship with the package). */
  readonly harnessesDir: string;
  /** `<root>/skills` — user-defined skills. */
  readonly skillsDir: string;
  /** `<root>/clones` — managed clones, `<clonesDir>/<owner>/<repo>`. */
  readonly clonesDir: string;
  /** `<root>/worktrees` — ephemeral per-review worktrees. */
  readonly worktreesDir: string;
  /** `<root>/runs` — `createRunStoreFsAdapter` root, `<runsDir>/<repoName>/<id>`. */
  readonly runsDir: string;
}

/**
 * Resolve the sentinel home root (D2).
 *
 * `env.SENTINEL_HOME` wins when set and non-blank; otherwise `<homeDir>/.sentinel`.
 * Both inputs are parameters rather than `process.env` / `os.homedir()` reads so
 * this stays a pure function unit-testable without mutating globals.
 *
 * @returns an absolute path.
 */
export function resolveSentinelHome(env: PathEnv, homeDir: string): string {
  const configured = env[SENTINEL_HOME_VAR]?.trim();
  if (configured !== undefined && configured !== "") {
    return resolve(configured);
  }
  return resolve(homeDir, DEFAULT_HOME_DIRNAME);
}

/**
 * Derive the whole home layout from one root.
 *
 * The root is resolved to an absolute path first (a no-op for the output of
 * `resolveSentinelHome`), so every field is absolute regardless of the caller.
 */
export function sentinelPaths(root: string): SentinelPaths {
  const base = resolve(root);
  return {
    root: base,
    configFile: join(base, "config.yaml"),
    reposFile: join(base, "repos.yaml"),
    harnessesDir: join(base, "harnesses"),
    skillsDir: join(base, "skills"),
    clonesDir: join(base, "clones"),
    worktreesDir: join(base, "worktrees"),
    runsDir: join(base, "runs"),
  };
}

/**
 * Absolute path of the nearest ancestor directory containing a `package.json`.
 *
 * Used to locate the factory `harnesses/` and `skills/` that ship with the npm
 * package — they live relative to the installed package, never to the sentinel
 * home. A fixed `../..` would be wrong for one of the two entry depths
 * (`src/main/cli.ts` under `npm run dev` vs. `dist/cli.js` when installed).
 *
 * @param startPath file or directory to start the upward walk from. Defaults to
 * this module's own location; overridable so the walk itself is testable.
 * @throws Error when no `package.json` exists in any ancestor directory.
 */
export function resolvePackageRoot(startPath?: string): string {
  const start = startPath ?? fileURLToPath(import.meta.url);
  const resolved = resolve(start);
  let current = isDirectory(resolved) ? resolved : dirname(resolved);

  for (;;) {
    if (existsSync(join(current, "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Unable to locate the sentinel package root: no package.json found above ${start}`,
      );
    }
    current = parent;
  }
}

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}
