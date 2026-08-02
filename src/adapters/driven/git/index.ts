/**
 * Driven adapter: git — `GitPort` implementation over the `git` binary
 * (execa + machine-readable output, PRD §5.1 / setup-tecnico decision 2).
 *
 * Public API: the `createGitCliAdapter` factory. Internals stay private.
 */
export { createGitCliAdapter } from "./git-cli.js";
