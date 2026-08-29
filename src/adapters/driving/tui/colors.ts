/**
 * Driving adapter: tui — the colour seam (`[E6.F2.H2]`, #39; AC-14).
 *
 * **This is the ONLY module in `src/` that imports `picocolors`.** The rule
 * is the `@clack/prompts` precedent restated: a terminal library is confined
 * to one file so the rest of the adapter — and every test of it — stays a
 * pure string-in / string-out surface. The confinement is grep-verifiable at
 * statement level: `grep -rEn '^import .*"picocolors"' src/` must return
 * exactly one hit, the one below (a plain `grep -rn picocolors src/` also
 * matches the prose in this header and in `__test__/tui-test-doubles.ts`).
 * A second importer is a review finding, not a refactor.
 *
 * Two design points, both load-bearing:
 *
 * - **Roles, not colours.** Callers ask for `good` / `warn` / `bad` /
 *   `muted`; they never name green or red. Colour stays pure decoration —
 *   every fact it carries (state, verdict, severity) is also present as
 *   plain text on the same line, so a monochrome terminal loses nothing.
 * - **Injected, never detected.** `picocolors` decides `isColorSupported`
 *   once at module load from `NO_COLOR` / `FORCE_COLOR` / TTY / **`CI`** —
 *   which means an assertion that trusted the ambient palette would pass
 *   locally and fail (or vacuously pass) in CI. So the renderers take a
 *   palette as a required argument: {@link TUI_PALETTE} in the flow,
 *   {@link PLAIN_PALETTE} in the pure tests. This module holds no state of
 *   its own, touches no stream, and never reads `process`.
 *
 * The import form is `import pc from "picocolors"` and must stay that way:
 * the package is CJS (`export = picocolors`) with no `exports` map, so under
 * this repo's `NodeNext` + `verbatimModuleSyntax` tsconfig the namespace
 * form `import * as pc` resolves to `{ createColors, default }` and
 * `pc.red` is `undefined` at runtime (verified at stage S1, not assumed).
 */

import pc from "picocolors";

/**
 * The four roles the result surface needs. Each is a plain
 * `string -> string`; an implementation may decorate or return its input
 * unchanged, and callers must behave identically either way.
 */
export interface TuiPalette {
  /** Successful outcomes: an `ok` state, an `approve` verdict. */
  readonly good: (text: string) => string;
  /** Attention without failure: `ambiguous`, `request-changes`, `major`. */
  readonly warn: (text: string) => string;
  /** Failure and severity peaks: failed states, `blocker`, failure lines. */
  readonly bad: (text: string) => string;
  /** Secondary detail: paths, counts, degradation notices, `minor`/`nit`. */
  readonly muted: (text: string) => string;
}

/**
 * The real palette. `picocolors`' formatters are standalone closures (they
 * capture their open/close codes and never read `this`), so referencing
 * them directly is safe. When colour is unsupported each one returns its
 * input unchanged — this palette is therefore already correct under
 * `NO_COLOR=1`, with no branch of our own.
 */
export const TUI_PALETTE: TuiPalette = {
  good: pc.green,
  warn: pc.yellow,
  bad: pc.red,
  muted: pc.dim,
};

/**
 * The identity palette: four functions that return their input. Injected by
 * every pure renderer test so its assertions compare exact strings and can
 * never inherit the ambient, `CI`-dependent colour decision.
 */
export const PLAIN_PALETTE: TuiPalette = {
  good: (text: string) => text,
  warn: (text: string) => text,
  bad: (text: string) => text,
  muted: (text: string) => text,
};
