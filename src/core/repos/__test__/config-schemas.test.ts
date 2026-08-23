import { describe, expect, it } from "vitest";
import { GlobalConfigSchema, RepoEntrySchema } from "../index.js";

// AC-5 ([E5.F1.H2]): `validationTimeoutMs` is added additively and optionally
// to both `GlobalConfigSchema` and `RepoEntrySchema` (`z.number().optional()`,
// no `z.default()`). `RepoEntry.validations` stays exactly
// `z.array(z.string()).optional()` — unwidened. A config document written
// before this story still parses (field `undefined`), and a document
// carrying the new field parses with the value preserved.
describe("config-schemas — validationTimeoutMs (AC-5)", () => {
  describe("GlobalConfigSchema", () => {
    it("parses a pre-story document, leaving validationTimeoutMs undefined", () => {
      const result = GlobalConfigSchema.parse({
        defaultEngine: "claude-code",
        defaultBaseBranch: "main",
      });

      expect(result.validationTimeoutMs).toBeUndefined();
    });

    it("parses a document carrying validationTimeoutMs, preserving the value", () => {
      const result = GlobalConfigSchema.parse({
        defaultEngine: "claude-code",
        defaultBaseBranch: "main",
        validationTimeoutMs: 60_000,
      });

      expect(result.validationTimeoutMs).toBe(60_000);
    });

    it("does not add a default when validationTimeoutMs is absent", () => {
      // Mutation guard: adding `.default(...)` to the field would make this
      // assertion fail — the field must stay undefined, not fall back to a
      // schema-level default. The single default constant belongs to `run`.
      const result = GlobalConfigSchema.parse({});

      expect(result.validationTimeoutMs).toBeUndefined();
      expect(Object.hasOwn(result, "validationTimeoutMs")).toBe(false);
    });
  });

  describe("RepoEntrySchema", () => {
    it("parses a pre-story document, leaving validationTimeoutMs undefined", () => {
      const result = RepoEntrySchema.parse({
        url: "https://example.com/repo.git",
      });

      expect(result.validationTimeoutMs).toBeUndefined();
    });

    it("parses a document carrying validationTimeoutMs, preserving the value", () => {
      const result = RepoEntrySchema.parse({
        url: "https://example.com/repo.git",
        validationTimeoutMs: 30_000,
      });

      expect(result.validationTimeoutMs).toBe(30_000);
    });

    it("does not add a default when validationTimeoutMs is absent", () => {
      const result = RepoEntrySchema.parse({
        url: "https://example.com/repo.git",
      });

      expect(result.validationTimeoutMs).toBeUndefined();
      expect(Object.hasOwn(result, "validationTimeoutMs")).toBe(false);
    });

    it("leaves `validations` unwidened at `z.array(z.string()).optional()`", () => {
      const withValidations = RepoEntrySchema.parse({
        url: "https://example.com/repo.git",
        validations: ["npm run lint", "npm test"],
      });
      expect(withValidations.validations).toEqual(["npm run lint", "npm test"]);

      const withoutValidations = RepoEntrySchema.parse({
        url: "https://example.com/repo.git",
      });
      expect(withoutValidations.validations).toBeUndefined();

      // A non-string-array shape must still be rejected — `validations`
      // was not widened to accept objects as part of this story.
      expect(() =>
        RepoEntrySchema.parse({
          url: "https://example.com/repo.git",
          validations: [{ command: "npm test" }],
        }),
      ).toThrow();
    });
  });
});

// AC-8 ([E6.F1.H1], D3): `reviewTimeoutMs` is added additively and optionally
// to `GlobalConfigSchema` only (`z.number().optional()`, no `z.default()`).
// A `config.yaml` written before this story still parses with the field
// absent, and the fallback stays a `core/run` constant
// (`DEFAULT_REVIEW_TIMEOUT_MS`) rather than a schema-level default, so
// `resolveReviewRequest` remains the single place the effective value is
// decided.
describe("config-schemas — reviewTimeoutMs (AC-8)", () => {
  it("parses a pre-story config document, leaving reviewTimeoutMs undefined", () => {
    const result = GlobalConfigSchema.parse({
      defaultEngine: "claude-code",
      defaultBaseBranch: "main",
      diffLimits: { maxLines: 5000, maxTokens: 80_000 },
      validationTimeoutMs: 60_000,
    });

    expect(result.reviewTimeoutMs).toBeUndefined();
    expect(result.defaultEngine).toBe("claude-code");
    expect(result.defaultBaseBranch).toBe("main");
    expect(result.validationTimeoutMs).toBe(60_000);
  });

  it("parses an empty document, keeping every other default intact", () => {
    const result = GlobalConfigSchema.parse({});

    expect(result.reviewTimeoutMs).toBeUndefined();
    expect(result.defaultEngine).toBe("claude-code");
    expect(result.defaultBaseBranch).toBe("main");
  });

  it("parses a document carrying reviewTimeoutMs, preserving the value", () => {
    const result = GlobalConfigSchema.parse({
      defaultEngine: "claude-code",
      defaultBaseBranch: "main",
      reviewTimeoutMs: 120_000,
    });

    expect(result.reviewTimeoutMs).toBe(120_000);
  });

  it("does not add a default when reviewTimeoutMs is absent", () => {
    // Mutation guard: adding `.default(...)` to the field would make this
    // assertion fail — the field must stay absent, not fall back to a
    // schema-level default. The single fallback constant belongs to `run`.
    const result = GlobalConfigSchema.parse({});

    expect(Object.hasOwn(result, "reviewTimeoutMs")).toBe(false);
  });

  it("rejects a non-numeric reviewTimeoutMs", () => {
    expect(() =>
      GlobalConfigSchema.parse({ reviewTimeoutMs: "120000" }),
    ).toThrow();
  });

  it("does not add reviewTimeoutMs to RepoEntrySchema", () => {
    // D3 scopes the field to the global config only; a per-repo review
    // timeout is not part of this story's config-format change.
    const result = RepoEntrySchema.parse({
      url: "https://example.com/repo.git",
      reviewTimeoutMs: 120_000,
    });

    expect(Object.hasOwn(result, "reviewTimeoutMs")).toBe(false);
  });
});
