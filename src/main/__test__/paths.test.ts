/**
 * Composition-root unit tests for D2 / AC-7 (`src/main/paths.ts`).
 *
 * Collected by the `adapters` vitest project, whose include S1 widened to
 * `src/{adapters,main}/**‍/__test__/**‍/*.test.ts`.
 *
 * `resolveSentinelHome` and `sentinelPaths` are pure, so nothing here mutates
 * `process.env` or `os.homedir()`. Only `resolvePackageRoot` touches the
 * filesystem, and it does so against a temp tree via its injectable start path.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  type PathEnv,
  resolvePackageRoot,
  resolveSentinelHome,
  type SentinelPaths,
  sentinelPaths,
} from "../paths.js";

const HOME = "/home/tester";

function env(overrides: Record<string, string | undefined> = {}): PathEnv {
  return { PATH: "/usr/bin", ...overrides };
}

describe("resolveSentinelHome", () => {
  it("uses SENTINEL_HOME when it is set", () => {
    expect(
      resolveSentinelHome(env({ SENTINEL_HOME: "/srv/sentinel" }), HOME),
    ).toBe("/srv/sentinel");
  });

  it("falls back to <homeDir>/.sentinel when SENTINEL_HOME is unset", () => {
    expect(resolveSentinelHome(env(), HOME)).toBe("/home/tester/.sentinel");
  });

  it("falls back to <homeDir>/.sentinel when SENTINEL_HOME is present but blank", () => {
    expect(resolveSentinelHome(env({ SENTINEL_HOME: "" }), HOME)).toBe(
      "/home/tester/.sentinel",
    );
  });

  it("falls back to <homeDir>/.sentinel when SENTINEL_HOME is only whitespace", () => {
    expect(resolveSentinelHome(env({ SENTINEL_HOME: "   \t " }), HOME)).toBe(
      "/home/tester/.sentinel",
    );
  });

  it("trims surrounding whitespace from a real SENTINEL_HOME value", () => {
    expect(
      resolveSentinelHome(env({ SENTINEL_HOME: "  /srv/sentinel  " }), HOME),
    ).toBe("/srv/sentinel");
  });

  it("treats SENTINEL_HOME set to undefined as unset", () => {
    expect(resolveSentinelHome(env({ SENTINEL_HOME: undefined }), HOME)).toBe(
      "/home/tester/.sentinel",
    );
  });

  it("returns an absolute path for a relative SENTINEL_HOME", () => {
    const resolved = resolveSentinelHome(
      env({ SENTINEL_HOME: "./sentinel-home" }),
      HOME,
    );
    expect(isAbsolute(resolved)).toBe(true);
    expect(resolved.endsWith(`${sep}sentinel-home`)).toBe(true);
  });

  it("normalises a SENTINEL_HOME containing traversal segments", () => {
    expect(
      resolveSentinelHome(env({ SENTINEL_HOME: "/srv/a/../sentinel" }), HOME),
    ).toBe("/srv/sentinel");
  });

  it("does not read process.env — the env argument is the only source", () => {
    const previous = process.env.SENTINEL_HOME;
    process.env.SENTINEL_HOME = "/should/never/be/read";
    try {
      expect(resolveSentinelHome(env(), HOME)).toBe("/home/tester/.sentinel");
    } finally {
      if (previous === undefined) {
        delete process.env.SENTINEL_HOME;
      } else {
        process.env.SENTINEL_HOME = previous;
      }
    }
  });
});

describe("sentinelPaths", () => {
  const paths = sentinelPaths("/srv/sentinel");

  it("derives the layout fixed by design's home-layout table", () => {
    expect(paths).toEqual({
      root: "/srv/sentinel",
      configFile: "/srv/sentinel/config.yaml",
      reposFile: "/srv/sentinel/repos.yaml",
      harnessesDir: "/srv/sentinel/harnesses",
      skillsDir: "/srv/sentinel/skills",
      clonesDir: "/srv/sentinel/clones",
      worktreesDir: "/srv/sentinel/worktrees",
      runsDir: "/srv/sentinel/runs",
    } satisfies SentinelPaths);
  });

  it("returns absolute paths for every field", () => {
    for (const value of Object.values(paths)) {
      expect(isAbsolute(value)).toBe(true);
    }
  });

  it("returns absolute paths even when handed a relative root", () => {
    const relative = sentinelPaths("sentinel-home");
    for (const value of Object.values(relative)) {
      expect(isAbsolute(value)).toBe(true);
    }
    expect(relative.clonesDir).toBe(join(relative.root, "clones"));
  });

  it("derives every field from the single root it was given", () => {
    for (const value of Object.values(paths)) {
      expect(value.startsWith(paths.root)).toBe(true);
    }
  });

  it("is deterministic: two calls with the same root agree on clonesDir", () => {
    expect(sentinelPaths("/srv/sentinel").clonesDir).toBe(
      sentinelPaths("/srv/sentinel").clonesDir,
    );
  });

  it("composes with resolveSentinelHome to place the layout under ~/.sentinel", () => {
    const composed = sentinelPaths(resolveSentinelHome(env(), HOME));
    expect(composed.root).toBe("/home/tester/.sentinel");
    expect(composed.runsDir).toBe("/home/tester/.sentinel/runs");
    expect(composed.worktreesDir).toBe("/home/tester/.sentinel/worktrees");
  });

  it("places the layout under SENTINEL_HOME when it is set", () => {
    const composed = sentinelPaths(
      resolveSentinelHome(env({ SENTINEL_HOME: "/tmp/box" }), HOME),
    );
    expect(composed.root).toBe("/tmp/box");
    expect(composed.clonesDir).toBe("/tmp/box/clones");
    expect(composed.root.startsWith(HOME)).toBe(false);
  });
});

describe("resolvePackageRoot", () => {
  const created: string[] = [];

  async function makeTree(): Promise<{ root: string; deep: string }> {
    const root = await mkdtemp(join(tmpdir(), "sentinel-pkg-"));
    created.push(root);
    await writeFile(join(root, "package.json"), '{"name":"fake"}\n', "utf-8");
    const deep = join(root, "dist", "nested", "deeper");
    await mkdir(deep, { recursive: true });
    return { root, deep };
  }

  afterAll(() => {
    created.length = 0;
  });

  it("finds the package.json in the start directory itself", async () => {
    const { root } = await makeTree();
    expect(resolvePackageRoot(root)).toBe(root);
  });

  it("walks upward from a nested directory to the nearest package.json", async () => {
    const { root, deep } = await makeTree();
    expect(resolvePackageRoot(deep)).toBe(root);
  });

  it("accepts a file path and starts from its directory", async () => {
    const { root, deep } = await makeTree();
    const file = join(deep, "cli.js");
    await writeFile(file, "", "utf-8");
    expect(resolvePackageRoot(file)).toBe(root);
  });

  it("accepts a non-existent file path (the bundled entrypoint case)", async () => {
    const { root, deep } = await makeTree();
    expect(resolvePackageRoot(join(deep, "does-not-exist.js"))).toBe(root);
  });

  it("stops at the nearest package.json, not the outermost one", async () => {
    const { root, deep } = await makeTree();
    const inner = join(root, "dist", "nested");
    await writeFile(join(inner, "package.json"), '{"name":"inner"}\n', "utf-8");
    expect(resolvePackageRoot(deep)).toBe(inner);
  });

  it("returns this repository's root when called with no argument", () => {
    const root = resolvePackageRoot();
    expect(isAbsolute(root)).toBe(true);
    expect(resolvePackageRoot(join(root, "src", "main"))).toBe(root);
  });

  // Guarded rather than unconditional: the walk terminates at the filesystem
  // root, so the error path only exists on a host with no `/package.json`.
  it.skipIf(existsSync("/package.json"))(
    "throws a named error when no package.json exists in any ancestor",
    () => {
      expect(() => resolvePackageRoot("/")).toThrow(/package root/);
    },
  );
});
