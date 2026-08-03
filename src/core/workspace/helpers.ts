/**
 * Core module: workspace — private path-derivation helpers.
 *
 * Pure string functions for building deterministic worktree paths.
 * NOT exported from the module barrel — internal use only.
 */

/**
 * Extract the last non-empty segment of `repoPath` using string split.
 * Walks backward to skip any trailing empty segments from trailing slashes.
 */
export function repoBasename(repoPath: string): string {
  const segments = repoPath.split("/");
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg !== undefined && seg !== "") {
      return seg;
    }
  }
  return "";
}

/**
 * Replace `/` with `-` and trim leading/trailing dashes so branch labels
 * become safe single-segment path components.
 */
export function sanitizeBranchLabel(label: string): string {
  const replaced = label.replaceAll("/", "-");
  let start = 0;
  while (start < replaced.length && replaced[start] === "-") {
    start++;
  }
  let end = replaced.length;
  while (end > start && replaced[end - 1] === "-") {
    end--;
  }
  return replaced.slice(start, end);
}

/**
 * Derive a deterministic, collision-resistant worktree path:
 * `<worktreesDir>/<repoBasename>/<sanitizedLabel>-<timestamp>`.
 */
export function deriveWorktreePath(
  worktreesDir: string,
  repoPath: string,
  branchLabel: string,
  timestamp: number,
): string {
  const normalizedDir = worktreesDir.endsWith("/")
    ? worktreesDir.slice(0, -1)
    : worktreesDir;
  return `${normalizedDir}/${repoBasename(repoPath)}/${sanitizeBranchLabel(branchLabel)}-${timestamp}`;
}
