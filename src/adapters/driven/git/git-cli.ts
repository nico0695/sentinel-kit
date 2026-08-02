/**
 * Driven adapter: git — `GitPort` implementation over the `git` binary
 * using execa + machine-readable output (PRD §5.1 / setup-tecnico decision 2).
 *
 * Adapter-side rules: every raw failure is translated into a typed port
 * error (spec §Error translation, dec-006). The core never sees an
 * ExecaError. `execa` and `node:path` are imported here only — they must
 * NOT reach the core (guard 2 `core-no-io-libs`).
 */
import { isAbsolute } from "node:path";
import { type ExecaError, execa } from "execa";
import {
  type BranchRef,
  type CloneRequest,
  type DefaultBranchRequest,
  type DiffRequest,
  type DiffResult,
  type FetchRequest,
  type FileStats,
  GitCloneError,
  GitCommandError,
  GitDiffError,
  type GitErrorOptions,
  GitFetchError,
  GitMergeBaseError,
  GitNoDefaultBranchError,
  type GitPort,
  GitWorktreeError,
  type MergeBaseRequest,
  type WorktreeAddRequest,
  type WorktreeInfo,
  type WorktreeRemoveRequest,
} from "../../../core/repos/index.js";

const DEFAULT_REMOTE = "origin";
const REFS_HEADS_PREFIX = "refs/heads/";
const REFS_REMOTES_PREFIX = "refs/remotes/";

/**
 * Locale + prompt overrides applied to every git invocation (dec-009):
 * - `LC_ALL=C` / `LANG=C` pin git's stderr wording to English so
 *   `isHeadUnsetSignal` matches on any host locale (fr_FR, es_ES, …).
 * - `GIT_TERMINAL_PROMPT=0` prevents an interactive credential prompt from
 *   deadlocking a spawn in test / CI / headless contexts (a mistyped URL
 *   fails instead of hanging).
 *
 * Bag is `as const` so execa's generic overload keeps `stdout: string`
 * (default `encoding: "utf8"` — the widening happens when execa infers
 * from a broadly-typed options bag).
 */
const EXECA_BASE = {
  env: {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    GIT_TERMINAL_PROMPT: "0",
  },
} as const;

/** Factory: returns a fresh `GitPort` backed by the local `git` binary. */
export function createGitCliAdapter(): GitPort {
  return {
    async clone({ url, targetPath }: CloneRequest): Promise<void> {
      if (!isAbsolute(targetPath)) {
        throw new GitCloneError(
          `clone: targetPath must be absolute (received: ${targetPath})`,
        );
      }
      try {
        await execa("git", ["clone", "--quiet", url, targetPath], EXECA_BASE);
      } catch (raw) {
        throw wrapAs(GitCloneError, `git clone failed for ${url}`, raw);
      }
    },

    async fetch({ repoPath, options }: FetchRequest): Promise<void> {
      const remote = options?.remote ?? DEFAULT_REMOTE;
      try {
        await execa(
          "git",
          ["-C", repoPath, "fetch", "--quiet", remote],
          EXECA_BASE,
        );
      } catch (raw) {
        throw wrapAs(GitFetchError, `git fetch ${remote} failed`, raw);
      }
    },

    async branches(repoPath: string): Promise<readonly BranchRef[]> {
      let stdout: string;
      try {
        const result = await execa(
          "git",
          [
            "-C",
            repoPath,
            "for-each-ref",
            "--format=%(refname)",
            "refs/heads",
            "refs/remotes",
          ],
          EXECA_BASE,
        );
        stdout = result.stdout;
      } catch (raw) {
        throw wrapAs(GitCommandError, "git for-each-ref failed", raw);
      }
      return parseBranches(stdout);
    },

    async defaultBranch({
      repoPath,
      remote,
    }: DefaultBranchRequest): Promise<string> {
      const target = remote ?? DEFAULT_REMOTE;
      const ref = `refs/remotes/${target}/HEAD`;
      let short: string;
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "symbolic-ref", "--short", ref],
          EXECA_BASE,
        );
        short = result.stdout.trim();
      } catch (raw) {
        if (isHeadUnsetSignal(raw)) {
          throw new GitNoDefaultBranchError(
            `default branch not set for remote '${target}'`,
          );
        }
        throw wrapAs(GitCommandError, `git symbolic-ref ${ref} failed`, raw);
      }
      if (short === "") {
        throw new GitNoDefaultBranchError(
          `default branch not set for remote '${target}'`,
        );
      }
      // `--short` returns `<remote>/<branch>`; strip the remote prefix.
      const prefix = `${target}/`;
      return short.startsWith(prefix) ? short.slice(prefix.length) : short;
    },

    async worktreeAdd({
      repoPath,
      targetPath,
      commitish,
    }: WorktreeAddRequest): Promise<void> {
      if (!isAbsolute(targetPath)) {
        throw new GitWorktreeError(
          `worktreeAdd: targetPath must be absolute (received: ${targetPath})`,
        );
      }
      try {
        await execa(
          "git",
          [
            "-C",
            repoPath,
            "worktree",
            "add",
            "--detach",
            targetPath,
            commitish,
          ],
          EXECA_BASE,
        );
      } catch (raw) {
        throw wrapAs(GitWorktreeError, "git worktree add failed", raw);
      }
    },

    async worktreeRemove({
      repoPath,
      worktreePath,
    }: WorktreeRemoveRequest): Promise<void> {
      try {
        await execa(
          "git",
          ["-C", repoPath, "worktree", "remove", "--force", worktreePath],
          EXECA_BASE,
        );
      } catch (raw) {
        throw wrapAs(GitWorktreeError, "git worktree remove failed", raw);
      }
    },

    async worktreeList(repoPath: string): Promise<readonly WorktreeInfo[]> {
      let stdout: string;
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "worktree", "list", "--porcelain"],
          EXECA_BASE,
        );
        stdout = result.stdout;
      } catch (raw) {
        throw wrapAs(GitWorktreeError, "git worktree list failed", raw);
      }
      return parseWorktreeList(stdout);
    },

    async mergeBase({
      repoPath,
      commitA,
      commitB,
    }: MergeBaseRequest): Promise<string> {
      let stdout: string;
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "merge-base", commitA, commitB],
          EXECA_BASE,
        );
        stdout = result.stdout;
      } catch (raw) {
        throw wrapAs(GitMergeBaseError, "git merge-base failed", raw);
      }
      return stdout.trim();
    },

    async diff({ repoPath, from, to }: DiffRequest): Promise<DiffResult> {
      let raw: string;
      let numstatOut: string;
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "diff", from, to],
          EXECA_BASE,
        );
        raw = result.stdout;
      } catch (rawErr) {
        throw wrapAs(GitDiffError, "git diff failed", rawErr);
      }
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "diff", "--numstat", from, to],
          EXECA_BASE,
        );
        numstatOut = result.stdout;
      } catch (rawErr) {
        throw wrapAs(GitDiffError, "git diff --numstat failed", rawErr);
      }
      return { raw, stats: parseDiffNumstat(numstatOut) };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers (adapter-private).
// ---------------------------------------------------------------------------

/** Parse `for-each-ref --format=%(refname)` output into tagged `BranchRef[]`. */
function parseBranches(stdout: string): readonly BranchRef[] {
  const refs: BranchRef[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith(REFS_HEADS_PREFIX)) {
      const name = trimmed.slice(REFS_HEADS_PREFIX.length);
      refs.push({ name, kind: "local" });
      continue;
    }
    if (trimmed.startsWith(REFS_REMOTES_PREFIX)) {
      const rest = trimmed.slice(REFS_REMOTES_PREFIX.length);
      const slash = rest.indexOf("/");
      if (slash < 0) continue;
      const remote = rest.slice(0, slash);
      const branch = rest.slice(slash + 1);
      // Filter out the symbolic ref (e.g. refs/remotes/origin/HEAD).
      if (branch === "HEAD") continue;
      refs.push({ name: `${remote}/${branch}`, kind: "remote", remote });
    }
  }
  return refs;
}

/**
 * Build a `GitError` subclass instance, preserving the raw failure in
 * `cause`. Reuses the core-exported `GitErrorOptions` shape as the single
 * source of truth for the constructor signature.
 */
function wrapAs<
  ErrorClass extends new (
    message: string,
    options?: GitErrorOptions,
  ) => Error,
>(ErrorClass: ErrorClass, message: string, cause: unknown) {
  const asError = cause instanceof Error ? cause : new Error(String(cause));
  return new ErrorClass(`${message}: ${asError.message}`, { cause: asError });
}

/**
 * `git symbolic-ref` returns exit 128 with `fatal: ref … is not a symbolic
 * ref` when the requested HEAD isn't set. The `LC_ALL=C` / `LANG=C` pin in
 * `EXECA_BASE` guarantees this English wording on any host locale, so the
 * two-signal check (exit code + stderr regex) is stable — the exit code
 * alone would misclassify unrelated 128s, and the wording alone would
 * be fragile.
 */
function isHeadUnsetSignal(raw: unknown): boolean {
  const err = raw as Partial<ExecaError> & { stderr?: unknown };
  if (err?.exitCode !== 128) return false;
  const stderr = typeof err.stderr === "string" ? err.stderr : "";
  return /is not a symbolic ref/i.test(stderr);
}

/**
 * Parse `git worktree list --porcelain` output into `WorktreeInfo[]`.
 * Blocks are separated by blank lines; each block has `worktree <path>`,
 * `HEAD <sha>`, and either `branch refs/heads/<name>` or `detached`.
 */
function parseWorktreeList(stdout: string): readonly WorktreeInfo[] {
  const entries: WorktreeInfo[] = [];
  const blocks = stdout.split("\n\n");
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed === "") continue;

    let path = "";
    let head = "";
    let branch: string | null = null;

    for (const line of trimmed.split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        branch = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref;
      }
    }
    if (path !== "" && head !== "") {
      entries.push({ path, head, branch });
    }
  }
  return entries;
}

/** Parse `git diff --numstat` output into `FileStats[]`. */
function parseDiffNumstat(stdout: string): readonly FileStats[] {
  const stats: FileStats[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;
    const [addStr, delStr, ...pathParts] = parts;
    const filePath = pathParts.join("\t");
    stats.push({
      path: filePath,
      additions: addStr === "-" ? 0 : Number(addStr),
      deletions: delStr === "-" ? 0 : Number(delStr),
    });
  }
  return stats;
}
