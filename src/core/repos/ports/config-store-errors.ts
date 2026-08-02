/**
 * Core module: repos — `ConfigStore` error family.
 *
 * Follows the `GitError` hierarchy pattern (dec-006): base class +
 * one subclass per failure family. `ConfigValidationError` carries
 * structured field-level diagnostics for user-readable messages (AC-1).
 */

export interface ConfigErrorOptions {
  readonly cause?: unknown;
}

export class ConfigError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message);
    this.name = "ConfigError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class ConfigValidationError extends ConfigError {
  readonly fields: ReadonlyArray<{
    readonly path: string;
    readonly message: string;
  }>;
  constructor(
    message: string,
    fields: ReadonlyArray<{
      readonly path: string;
      readonly message: string;
    }>,
  ) {
    super(message);
    this.name = "ConfigValidationError";
    this.fields = fields;
  }
}

export class ConfigReadError extends ConfigError {
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message, options);
    this.name = "ConfigReadError";
  }
}

export class ConfigWriteError extends ConfigError {
  constructor(message: string, options?: ConfigErrorOptions) {
    super(message, options);
    this.name = "ConfigWriteError";
  }
}
