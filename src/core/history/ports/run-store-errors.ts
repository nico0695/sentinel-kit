/**
 * Core module: history — `RunStore` error family.
 *
 * Follows the `ConfigError`/`GitError` hierarchy pattern (dec-006): base
 * class + one subclass per failure family, `cause` stored conditionally
 * for `exactOptionalPropertyTypes`.
 */

export interface HistoryErrorOptions {
  readonly cause?: unknown;
}

export class HistoryError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: HistoryErrorOptions) {
    super(message);
    this.name = "HistoryError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

/** Raised before any directory is created — `record` fails path validation. */
export class InvalidRunRecordError extends HistoryError {
  readonly fields: ReadonlyArray<{
    readonly path: string;
    readonly message: string;
  }>;
  constructor(
    message: string,
    fields: ReadonlyArray<{ readonly path: string; readonly message: string }>,
    options?: HistoryErrorOptions,
  ) {
    super(message, options);
    this.name = "InvalidRunRecordError";
    this.fields = fields;
  }
}

/** The final run directory already exists; it is never overwritten or merged. */
export class RunAlreadyExistsError extends HistoryError {
  readonly path: string;
  constructor(path: string, options?: HistoryErrorOptions) {
    super(`Run already exists: ${path}`, options);
    this.name = "RunAlreadyExistsError";
    this.path = path;
  }
}

/** Any raw fs failure during staging or the closing rename. */
export class RunPersistenceError extends HistoryError {
  constructor(message: string, options?: HistoryErrorOptions) {
    super(message, options);
    this.name = "RunPersistenceError";
  }
}
