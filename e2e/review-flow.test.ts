/**
 * e2e smoke: register → review → history, in process (`[E7.F1.H1]`, #41).
 *
 * The one suite that exercises the composition root for real — real git, real
 * filesystem, real `commander` dispatch, real persistence — with exactly one
 * substitution: the `ReviewEngine`, injected through `createCliDeps`'
 * test-only `engineOverride` seam so no `claude-code`/`opencode` process is
 * ever spawned (d-003). Everything from `createCliDeps` inward is the
 * production graph; `src/main/cli.ts` and the built bundle sit above the
 * boundary and are deliberately out of its blast radius (spec N-1).
 *
 * Every leg is an argv array through `run(argv)`, never a direct use-case
 * call: a command that could not be driven this way would be holding domain
 * logic it should not have. `run` returns the exit code as a value and never
 * touches `process`, so the exit-code contract is assertable in process.
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFakeEngine } from "../src/adapters/driven/engines/index.js";
import { type CliIo, createCli } from "../src/adapters/driving/cli/index.js";
import type { ReviewEngine } from "../src/core/run/index.js";
import { createCliDeps } from "../src/main/container.js";
import {
  createHermeticRepo,
  type HermeticRepo,
} from "./support/hermetic-git.js";

/** What `repo add` registers; `deriveAlias` turns it into `acme/widget`. */
const REPO_URL = "https://example.test/acme/widget.git";
const REPO_ALIAS = "acme/widget";
/**
 * The single path segment runs are stored under: `persistRun` maps the alias
 * through `toRunStorageKey` (`owner/repo` → `owner__repo`) on the way into the
 * store and never denormalises it, so both the run directory and
 * `metadata.json#repo` carry this form rather than the alias the user typed.
 */
const REPO_STORAGE_KEY = "acme__widget";

const ENGINE_OUTPUT = [
  "## Review",
  "",
  "[SEV: low] `widget.ts` — the constant could carry a unit in its name.",
  "",
  "VERDICT: approve",
].join("\n");

/** The blocking counterpart: same shape, the one verdict that gates a run. */
const CHANGES_ENGINE_OUTPUT = [
  "## Review",
  "",
  "[SEV: high] `widget.ts` — the exported helper drops its error path.",
  "",
  "VERDICT: request-changes",
].join("\n");

/** Captures the two line channels the CLI writes through. */
interface CapturedIo extends CliIo {
  readonly out: string[];
  readonly err: string[];
}

function createCapturedIo(): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line) => {
      out.push(line);
    },
    stderr: (line) => {
      err.push(line);
    },
  };
}

const temporaryRoots: string[] = [];

afterEach(() => {
  // Unconditional and outside any `try`: a failed assertion mid-flow must not
  // leak a temp home, a clone or a worktree onto the runner.
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it("registers a repository, reviews a branch and reads the run back", async () => {
  const fixture: HermeticRepo = await createHermeticRepo();
  temporaryRoots.push(fixture.root);

  const sentinelHome = realpathSync(
    mkdtempSync(join(tmpdir(), "sentinel-home-")),
  );
  temporaryRoots.push(sentinelHome);

  // A directory that exists but is not a home: if `SENTINEL_HOME` ever stopped
  // being honoured, the fallback would write under here — inside the fixture
  // root, so still cleaned up, and visibly not the home this test asserts.
  const deadHomeDir = join(fixture.root, "dead-home");

  const engine: ReviewEngine = createFakeEngine({
    ok: true,
    result: { output: ENGINE_OUTPUT },
  });

  /**
   * One graph per leg, the way each real CLI process builds exactly one.
   * `SENTINEL_HOME` arrives as injected `env`; `process.env` is never mutated.
   */
  const run = async (
    ...args: string[]
  ): Promise<{ code: number; io: CapturedIo }> => {
    const io = createCapturedIo();
    const cli = createCli(
      createCliDeps({
        version: "0.0.0-e2e",
        env: { SENTINEL_HOME: sentinelHome },
        homeDir: deadHomeDir,
        io,
        engineOverride: engine,
      }),
    );
    const code = await cli.run([
      "/usr/bin/node",
      "/tmp/sentinel/cli.js",
      ...args,
    ]);
    return { code, io };
  };

  /* --- register (S1) --- */
  const added = await run(
    "repo",
    "add",
    REPO_URL,
    "--local-path",
    fixture.repoPath,
    "--base-branch",
    fixture.baseBranch,
    "--harness",
    "quick",
  );

  expect(added.io.err).toEqual([]);
  expect(added.code).toBe(0);
  expect(added.io.out).toHaveLength(1);
  expect(added.io.out[0]?.split("\t")[0]).toBe(REPO_ALIAS);

  const reposFile = join(sentinelHome, "repos.yaml");
  expect(existsSync(reposFile)).toBe(true);
  expect(readFileSync(reposFile, "utf-8")).toContain(REPO_ALIAS);

  const listed = await run("repo", "list");
  expect(listed.code).toBe(0);
  expect(listed.io.out.some((line) => line.startsWith(REPO_ALIAS))).toBe(true);

  /* --- review (S2) --- */
  const reviewed = await run(
    "review",
    REPO_ALIAS,
    fixture.featureBranch,
    "--type",
    "quick",
  );

  expect(reviewed.io.err).toEqual([]);
  expect(reviewed.code).toBe(0);

  /* --- persistence (S3) --- */
  const repoRunsDir = join(sentinelHome, "runs", REPO_STORAGE_KEY);
  const runIds = readdirSync(repoRunsDir);
  expect(runIds).toHaveLength(1);
  const runId = runIds[0] as string;
  const runDir = join(repoRunsDir, runId);

  expect(readFileSync(join(runDir, "result.md"), "utf-8")).toBe(ENGINE_OUTPUT);
  expect(
    readFileSync(join(runDir, "prompt.md"), "utf-8").length,
  ).toBeGreaterThan(0);

  const metadata: Record<string, unknown> = JSON.parse(
    readFileSync(join(runDir, "metadata.json"), "utf-8"),
  );
  expect(metadata.repo).toBe(REPO_STORAGE_KEY);
  expect(metadata.baseRef).toBe(fixture.baseBranch);
  expect(metadata.targetRef).toBe(fixture.featureBranch);
  expect(metadata.state).toBe("ok");
  expect(metadata.verdict).toBe("approve");
  // Not asserted on purpose: `metadata.json#engine` records the *resolved*
  // engine name (`claude-code`), because the override interposes after name
  // resolution — the FakeEngine ran under that name. Asserting it would pin a
  // falsehood rather than strengthen the smoke.

  // The `quick` harness declares `skills: []`, so no validation ever runs and
  // the store writes no `validations/` directory.
  expect(existsSync(join(runDir, "validations"))).toBe(false);

  /* --- history (S4) --- */
  const runsListed = await run("runs", "list", REPO_ALIAS);
  expect(runsListed.code).toBe(0);
  expect(runsListed.io.out).toHaveLength(1);

  // The run id IS the directory name — `metadata.json` carries no `id` field,
  // so identity is verified by matching the two.
  const [printedRepo, printedId] = (runsListed.io.out[0] as string).split("\t");
  expect(printedRepo).toBe(REPO_ALIAS);
  expect(printedId).toBe(runId);

  const shown = await run("runs", "show", REPO_ALIAS, runId);
  expect(shown.code).toBe(0);
  expect(shown.io.out).toContain("state\tok");
  expect(shown.io.out).toContain("verdict\tapprove");

  /* --- isolation (S6) --- */
  expect(existsSync(deadHomeDir)).toBe(false);
});

it("reports a request-changes verdict with the configurable gate exit code", async () => {
  const fixture: HermeticRepo = await createHermeticRepo();
  temporaryRoots.push(fixture.root);

  const sentinelHome = realpathSync(
    mkdtempSync(join(tmpdir(), "sentinel-home-")),
  );
  temporaryRoots.push(sentinelHome);

  const deadHomeDir = join(fixture.root, "dead-home");

  const engine: ReviewEngine = createFakeEngine({
    ok: true,
    result: { output: CHANGES_ENGINE_OUTPUT },
  });

  // Deliberately inlined rather than shared with the happy path: each e2e
  // scenario reads as one complete script, and factoring the wiring out would
  // mean rewriting a test that is not in this stage's scope.
  const run = async (
    ...args: string[]
  ): Promise<{ code: number; io: CapturedIo }> => {
    const io = createCapturedIo();
    const cli = createCli(
      createCliDeps({
        version: "0.0.0-e2e",
        env: { SENTINEL_HOME: sentinelHome },
        homeDir: deadHomeDir,
        io,
        engineOverride: engine,
      }),
    );
    const code = await cli.run([
      "/usr/bin/node",
      "/tmp/sentinel/cli.js",
      ...args,
    ]);
    return { code, io };
  };

  const added = await run(
    "repo",
    "add",
    REPO_URL,
    "--local-path",
    fixture.repoPath,
    "--base-branch",
    fixture.baseBranch,
    "--harness",
    "quick",
  );
  expect(added.io.err).toEqual([]);
  expect(added.code).toBe(0);

  /* --- review (S5) --- */
  const reviewed = await run(
    "review",
    REPO_ALIAS,
    fixture.featureBranch,
    "--type",
    "quick",
  );

  // The gate signal, and the whole point of this scenario: a completed review
  // that blocks. `1` is the `--changes-exit-code` default from `[E6.F1.H2]`,
  // returned by `run(argv)` as a value — nothing here touches `process`.
  expect(reviewed.io.err).toEqual([]);
  expect(reviewed.code).toBe(1);

  /* --- persistence: the same three files as the happy path --- */
  const repoRunsDir = join(sentinelHome, "runs", REPO_STORAGE_KEY);
  const runIds = readdirSync(repoRunsDir);
  expect(runIds).toHaveLength(1);
  const runDir = join(repoRunsDir, runIds[0] as string);

  expect(readFileSync(join(runDir, "result.md"), "utf-8")).toBe(
    CHANGES_ENGINE_OUTPUT,
  );
  expect(
    readFileSync(join(runDir, "prompt.md"), "utf-8").length,
  ).toBeGreaterThan(0);

  const metadata: Record<string, unknown> = JSON.parse(
    readFileSync(join(runDir, "metadata.json"), "utf-8"),
  );
  expect(metadata.repo).toBe(REPO_STORAGE_KEY);
  expect(metadata.baseRef).toBe(fixture.baseBranch);
  expect(metadata.targetRef).toBe(fixture.featureBranch);
  // A blocking verdict is still a completed run: the state stays `ok` and only
  // the verdict — and therefore the exit code — differs from the happy path.
  expect(metadata.state).toBe("ok");
  expect(metadata.verdict).toBe("request-changes");

  expect(existsSync(join(runDir, "validations"))).toBe(false);
});
