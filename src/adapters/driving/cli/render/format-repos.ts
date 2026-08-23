/**
 * Driving adapter: cli — repository rendering (`[E6.F1.H1]`, #36; AC-10).
 *
 * Pure `(...) => string` helpers, tab-separated, with a **fixed field order**
 * and a literal `-` for an absent optional field. That is what lets
 * `sentinel repo list` survive a pipe: a consumer can split on `\t` and index
 * by position without the layout shifting when an entry happens to omit a
 * base branch. Nothing decorative is produced here — headers, counts and
 * human-facing notes belong on `stderr`, written by the command.
 *
 * A later `--json` mode (deferred by D6) is an added branch beside these
 * functions, never a rewrite of the command bodies.
 */

import type {
  RegisterRepoResult,
  RepoEntry,
} from "../../../../core/repos/index.js";

/** Rendered in place of an optional field the registry does not carry. */
const ABSENT = "-";

function field(value: string | undefined): string {
  return value === undefined || value === "" ? ABSENT : value;
}

/**
 * Field order of a `repo list` record. Exported so the tests assert the
 * contract rather than a hand-copied string, and so a future `--json` mode
 * has one place to read the field names from.
 */
export const REPO_LINE_FIELDS = [
  "alias",
  "url",
  "baseBranch",
  "harness",
] as const;

/** One `repo list` record: `alias<TAB>url<TAB>baseBranch<TAB>harness`. */
export function formatRepoLine(alias: string, entry: RepoEntry): string {
  return [
    alias,
    entry.url,
    field(entry.baseBranch),
    field(entry.defaultHarness),
  ].join("\t");
}

/** Field order of the single record `repo add` prints on success. */
export const REGISTER_OUTCOME_FIELDS = [
  "alias",
  "status",
  "localPath",
] as const;

/**
 * The outcome of `repo add`:
 * `alias<TAB>{registered|already-registered}<TAB>localPath`.
 *
 * The status field is present because `RegisterRepoResult.alreadyRegistered`
 * is a real outcome and reporting a re-registration as a fresh one would be a
 * lie — it is reported, not treated as an error (spec's behaviour table).
 *
 * `localPath` echoes `entry.localPath` verbatim and renders `-` when the
 * registry holds none. It deliberately does **not** reconstruct
 * `${clonesDir}/${alias}` for a cloned repository: that fallback is core's
 * cascade (`resolveReviewRequest`), and re-deriving it here would put a
 * domain rule inside a renderer (AC-1).
 */
export function formatRegisterOutcome(result: RegisterRepoResult): string {
  const status = result.alreadyRegistered ? "already-registered" : "registered";

  return [result.alias, status, field(result.entry.localPath)].join("\t");
}
