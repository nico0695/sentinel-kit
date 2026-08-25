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
      // Resolve to a concrete SHA FIRST (dec-011). `--detach` suppresses
      // git's DWIM, so passing a branch that only exists as
      // `refs/remotes/<remote>/<name>` — the normal case for a PR branch in
      // a managed clone — dies with `fatal: invalid reference`. Dropping
      // `--detach` is NOT the fix: it would create a local branch in the
      // managed clone, which PRD §5.1 forbids (ephemeral worktree per
      // review, never a checkout in the clone) and which would make two
      // concurrent reviews of the same branch collide.
      const revision = await resolveCommitish(
        repoPath,
        commitish,
        GitWorktreeError,
        "worktree add",
      );
      try {
        await execa(
          "git",
          ["-C", repoPath, "worktree", "add", "--detach", targetPath, revision],
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
      // Same resolution rule as `worktreeAdd` (dec-011): a caller-supplied
      // ref may exist only as `refs/remotes/<remote>/<name>`, which plain
      // `git merge-base` rejects with `Not a valid object name`. Resolving
      // both operands here keeps the adapter uniform — a remote-only branch
      // works on every `GitPort` method or fails clearly on every one.
      const revisionA = await resolveCommitish(
        repoPath,
        commitA,
        GitMergeBaseError,
        "merge-base",
      );
      const revisionB = await resolveCommitish(
        repoPath,
        commitB,
        GitMergeBaseError,
        "merge-base",
      );
      let stdout: string;
      try {
        const result = await execa(
          "git",
          ["-C", repoPath, "merge-base", revisionA, revisionB],
          EXECA_BASE,
        );
        stdout = result.stdout;
      } catch (raw) {
        throw wrapAs(GitMergeBaseError, "git merge-base failed", raw);
      }
      return stdout.trim();
    },

    async diff({ repoPath, from, to }: DiffRequest): Promise<DiffResult> {
      // Resolved ONCE and reused by both invocations below (dec-011): the
      // raw + numstat passes must describe the exact same revision pair,
      // and a remote-only branch is unusable as a bare `git diff` operand.
      const fromRevision = await resolveCommitish(
        repoPath,
        from,
        GitDiffError,
        "diff",
      );
      const toRevision = await resolveCommitish(
        repoPath,
        to,
        GitDiffError,
        "diff",
      );
      let raw: string;
      let numstatOut: string;
      try {
        const result = await execa(
          "git",
          [
            "-C",
            repoPath,
            "diff",
            "--no-ext-diff",
            "--no-color",
            fromRevision,
            toRevision,
          ],
          EXECA_BASE,
        );
        raw = result.stdout;
      } catch (rawErr) {
        throw wrapAs(GitDiffError, "git diff failed", rawErr);
      }
      try {
        const result = await execa(
          "git",
          [
            "-C",
            repoPath,
            "diff",
            "--numstat",
            "--no-ext-diff",
            fromRevision,
            toRevision,
          ],
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
 * Constructor shape shared by every `GitError` subclass. Reuses the
 * core-exported `GitErrorOptions` as the single source of truth for the
 * signature, so `wrapAs` and `resolveCommitish` can both be parameterized
 * over "which port error does THIS method throw".
 */
type GitErrorConstructor = new (
  message: string,
  options?: GitErrorOptions,
) => Error;

/**
 * Build a `GitError` subclass instance, preserving the raw failure in
 * `cause`.
 */
function wrapAs<ErrorClass extends GitErrorConstructor>(
  ErrorClass: ErrorClass,
  message: string,
  cause: unknown,
) {
  const asError = cause instanceof Error ? cause : new Error(String(cause));
  return new ErrorClass(`${message}: ${asError.message}`, { cause: asError });
}

/**
 * Step 1 of {@link resolveCommitish}: ask git directly.
 *
 * Resolves a bare SHA, a tag, a local branch, an explicit `origin/<name>`
 * and any revision expression (`main~2`), following git's own DWIM order —
 * `refs/heads/<name>` before `refs/remotes/<name>` — which is what gives a
 * local branch precedence over a same-named remote one.
 *
 * Never throws: a failure is returned so step 2 can run and, if it also
 * finds nothing, report this diagnostic as the `cause`.
 */
async function revParseCommit(
  repoPath: string,
  commitish: string,
): Promise<{ readonly sha: string } | { readonly failure: unknown }> {
  try {
    const { stdout } = await execa(
      "git",
      ["-C", repoPath, "rev-parse", "--verify", `${commitish}^{commit}`],
      EXECA_BASE,
    );
    const sha = stdout.trim();
    if (sha !== "") {
      return { sha };
    }
    return {
      failure: new Error(
        `git rev-parse --verify ${commitish} returned no revision`,
      ),
    };
  } catch (raw) {
    return { failure: raw };
  }
}

/**
 * Step 2 of {@link resolveCommitish}: the remote-tracking fallback.
 *
 * Requires EXACTLY ONE `refs/remotes/<remote>/<commitish>` match. Zero
 * matches and two-or-more matches (the same branch name on two remotes) both
 * reject with `ErrorClass` — silently reviewing the wrong revision would be
 * far worse than failing loudly. `directFailure` (step 1's git diagnostic)
 * travels as the rejection's `cause` so it is never lost.
 */
async function resolveRemoteTrackingCommit(
  repoPath: string,
  commitish: string,
  ErrorClass: GitErrorConstructor,
  context: string,
  directFailure: unknown,
): Promise<string> {
  let listed: string;
  try {
    const { stdout } = await execa(
      "git",
      [
        "-C",
        repoPath,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        REFS_REMOTES_PREFIX,
      ],
      EXECA_BASE,
    );
    listed = stdout;
  } catch (raw) {
    throw wrapAs(
      ErrorClass,
      `${context}: cannot resolve commitish '${commitish}' in ${repoPath}`,
      raw,
    );
  }

  const matches = matchRemoteTrackingRefs(listed, commitish);
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) {
    return only.sha;
  }
  if (matches.length === 0) {
    throw wrapAs(
      ErrorClass,
      `${context}: cannot resolve commitish '${commitish}' in ${repoPath} (no local ref, tag or remote-tracking branch matches)`,
      directFailure,
    );
  }
  const remotes = matches.map((m) => m.remote).join(", ");
  throw wrapAs(
    ErrorClass,
    `${context}: commitish '${commitish}' is ambiguous in ${repoPath} — it matches a branch on several remotes (${remotes}); qualify it as '<remote>/${commitish}'`,
    directFailure,
  );
}

/**
 * Resolve a caller-supplied `commitish` to a concrete 40-hex commit SHA
 * inside `repoPath`, so every git invocation that takes a revision receives
 * an unambiguous one.
 *
 * The invariant, in both steps: **exactly one revision, or an error.** Git
 * itself answers first ({@link revParseCommit}, which honours local-over-
 * remote precedence); only when it resolves nothing does the remote-tracking
 * scan run ({@link resolveRemoteTrackingCommit}, which requires a single
 * match). Nothing is ever guessed.
 *
 * This is the SINGLE resolution path for the whole adapter (dec-011,
 * risk-e6h1-014): `worktreeAdd`, `mergeBase` and `diff` all funnel through
 * it, so a remote-only branch behaves identically everywhere instead of
 * working in one method and dying in the next. `ErrorClass` and `context`
 * keep the rejection typed per method — a `mergeBase` failure surfaces as
 * `GitMergeBaseError`, never as `GitWorktreeError`.
 */
async function resolveCommitish(
  repoPath: string,
  commitish: string,
  ErrorClass: GitErrorConstructor,
  context: string,
): Promise<string> {
  const direct = await revParseCommit(repoPath, commitish);

  if ("sha" in direct) {
    return direct.sha;
  }

  return resolveRemoteTrackingCommit(
    repoPath,
    commitish,
    ErrorClass,
    context,
    direct.failure,
  );
}

/**
 * Select the `refs/remotes/<remote>/<name>` entries of a
 * `for-each-ref --format="%(refname) %(objectname)"` dump whose `<name>`
 * equals `branch`. The remote is the FIRST path segment after the prefix,
 * so branch names containing slashes (`feature/foo`) match correctly.
 */
function matchRemoteTrackingRefs(
  stdout: string,
  branch: string,
): readonly { readonly remote: string; readonly sha: string }[] {
  const matches: { remote: string; sha: string }[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const sep = trimmed.lastIndexOf(" ");
    if (sep < 0) continue;
    const refname = trimmed.slice(0, sep);
    const sha = trimmed.slice(sep + 1);
    if (!refname.startsWith(REFS_REMOTES_PREFIX)) continue;
    const rest = refname.slice(REFS_REMOTES_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash < 0) continue;
    const remote = rest.slice(0, slash);
    const name = rest.slice(slash + 1);
    if (name === branch) matches.push({ remote, sha });
  }
  return matches;
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

    for (const raw of trimmed.split("\n")) {
      const line = raw.trim();
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
