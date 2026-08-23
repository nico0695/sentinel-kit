/**
 * Driving adapter: cli — error rendering (AC-13).
 *
 * One line, on `stderr`, no stack trace, no `cause` chain, no raw exception
 * object. Deliberately free of per-error-type branching: the core error
 * families (`RepoNotFoundError`, `ConfigValidationError`, `RunNotFoundError`,
 * `UnknownEngineError`, `HarnessNotFoundError`, …) already carry human
 * messages, and a mapping table here would re-import domain knowledge into
 * the adapter.
 *
 * Rendering lives in this module rather than inside command bodies so every
 * command — and `createCli`'s catch-all — renders failures identically.
 */

/**
 * Reduces any throwable to a single human-readable line.
 *
 * A message spanning several lines is collapsed to one, because AC-13's
 * guarantee is "one line on stderr" and nothing prevents a `cause`-free
 * message from carrying a newline.
 */
export function formatErrorLine(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const collapsed = raw.replace(/\s*\n\s*/g, " ").trim();

  if (collapsed !== "") {
    return collapsed;
  }

  return error instanceof Error && error.name !== ""
    ? error.name
    : "Unknown error";
}
