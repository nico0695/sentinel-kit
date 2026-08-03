export interface BranchListErrorOptions {
  readonly cause?: unknown;
}

export class BranchListError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: BranchListErrorOptions) {
    super(message);
    this.name = "BranchListError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class RepoNotFoundError extends Error {
  constructor(alias: string) {
    super(`Repository not found: ${alias}`);
    this.name = "RepoNotFoundError";
  }
}
