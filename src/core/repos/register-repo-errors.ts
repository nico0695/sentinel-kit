export interface RepoRegistrationErrorOptions {
  readonly cause?: unknown;
}

export class RepoRegistrationError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: RepoRegistrationErrorOptions) {
    super(message);
    this.name = "RepoRegistrationError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class InvalidRepoRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepoRequestError";
  }
}
