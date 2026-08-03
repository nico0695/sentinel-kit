export interface HarnessErrorOptions {
  readonly cause?: unknown;
}

export class HarnessError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: HarnessErrorOptions) {
    super(message);
    this.name = "HarnessError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class HarnessNotFoundError extends HarnessError {
  readonly type: string;
  constructor(type: string, options?: HarnessErrorOptions) {
    super(`Harness not found: ${type}`, options);
    this.name = "HarnessNotFoundError";
    this.type = type;
  }
}

export class HarnessValidationError extends HarnessError {
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
    options?: HarnessErrorOptions,
  ) {
    super(message, options);
    this.name = "HarnessValidationError";
    this.fields = fields;
  }
}

export class SkillNotFoundError extends HarnessError {
  readonly skillName: string;
  readonly referencedBy: string;
  constructor(
    skillName: string,
    referencedBy: string,
    options?: HarnessErrorOptions,
  ) {
    super(
      `Skill "${skillName}" not found (referenced by harness "${referencedBy}")`,
      options,
    );
    this.name = "SkillNotFoundError";
    this.skillName = skillName;
    this.referencedBy = referencedBy;
  }
}
