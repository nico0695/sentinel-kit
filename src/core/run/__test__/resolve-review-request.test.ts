/**
 * `resolveReviewRequest` behavioural suite ([E6.F1.H1], D3/D5, spec.md AC-8).
 *
 * One test per row of design.md's precedence table, all three timeout levels
 * (`--timeout` > `config.reviewTimeoutMs` > `DEFAULT_REVIEW_TIMEOUT_MS`), the
 * missing-harness `InvalidRunRequestError` (design A-3), `RepoNotFoundError`
 * on an unknown alias, and `UnknownEngineError` surfacing through the
 * internal `resolveEngine` call.
 */

import { describe, expect, it } from "vitest";
import type { GlobalConfig, RepoRegistry } from "../../repos/index.js";
import { RepoNotFoundError } from "../../repos/index.js";
import {
  DEFAULT_REVIEW_TIMEOUT_MS,
  type ResolveReviewRequestInput,
  resolveReviewRequest,
} from "../resolve-review-request.js";
import { InvalidRunRequestError, UnknownEngineError } from "../run-errors.js";

const baseConfig: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const baseRegistry: RepoRegistry = {
  "acme/widgets": {
    url: "https://example.com/acme/widgets.git",
    defaultHarness: "pr-review",
  },
};

function input(
  overrides: Partial<ResolveReviewRequestInput> = {},
): ResolveReviewRequestInput {
  return {
    repoAlias: "acme/widgets",
    targetRef: "feature/x",
    repos: baseRegistry,
    config: baseConfig,
    clonesDir: "/home/u/.sentinel/clones",
    ...overrides,
  };
}

describe("resolveReviewRequest", () => {
  describe("repoPath", () => {
    it("derives the managed clone path from clonesDir and the alias", () => {
      expect(resolveReviewRequest(input()).repoPath).toBe(
        "/home/u/.sentinel/clones/acme/widgets",
      );
    });

    it("prefers the entry's localPath when present", () => {
      const request = resolveReviewRequest(
        input({
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              localPath: "/srv/checkouts/widgets",
              defaultHarness: "pr-review",
            },
          },
        }),
      );

      expect(request.repoPath).toBe("/srv/checkouts/widgets");
    });
  });

  describe("baseRef", () => {
    it("falls back to the global default base branch", () => {
      expect(resolveReviewRequest(input()).baseRef).toBe("main");
    });

    it("prefers the entry's baseBranch over the global default", () => {
      const request = resolveReviewRequest(
        input({
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              baseBranch: "develop",
              defaultHarness: "pr-review",
            },
          },
        }),
      );

      expect(request.baseRef).toBe("develop");
    });
  });

  describe("targetRef", () => {
    it("carries the positional ref through verbatim", () => {
      expect(
        resolveReviewRequest(input({ targetRef: "hotfix/1" })).targetRef,
      ).toBe("hotfix/1");
    });
  });

  describe("harnessType (design A-3)", () => {
    it("falls back to the entry's defaultHarness", () => {
      expect(resolveReviewRequest(input()).harnessType).toBe("pr-review");
    });

    it("prefers the --type flag over the entry default", () => {
      const request = resolveReviewRequest(
        input({ flags: { harnessType: "quick" } }),
      );

      expect(request.harnessType).toBe("quick");
    });

    it("throws InvalidRunRequestError when neither source supplies one", () => {
      const call = () =>
        resolveReviewRequest(
          input({
            repos: {
              "acme/widgets": { url: "https://example.com/acme/widgets.git" },
            },
          }),
        );

      expect(call).toThrow(InvalidRunRequestError);
      expect(call).toThrow(/--type/);
    });

    it("does not invent a product default harness", () => {
      // Mutation guard for A-3: defaulting to a harness here would make the
      // throw above disappear and silently decide what the engine is told to
      // do, and what the run costs.
      expect(() =>
        resolveReviewRequest(
          input({
            repos: {
              "acme/widgets": { url: "https://example.com/acme/widgets.git" },
            },
          }),
        ),
      ).toThrow(InvalidRunRequestError);
    });
  });

  describe("timeoutMs (AC-8, D3: flag > config > constant)", () => {
    it("falls back to DEFAULT_REVIEW_TIMEOUT_MS when neither source supplies one", () => {
      expect(resolveReviewRequest(input()).timeoutMs).toBe(
        DEFAULT_REVIEW_TIMEOUT_MS,
      );
      expect(DEFAULT_REVIEW_TIMEOUT_MS).toBe(600_000);
    });

    it("prefers config.reviewTimeoutMs over the constant", () => {
      const request = resolveReviewRequest(
        input({ config: { ...baseConfig, reviewTimeoutMs: 120_000 } }),
      );

      expect(request.timeoutMs).toBe(120_000);
    });

    it("prefers the --timeout flag over config.reviewTimeoutMs", () => {
      const request = resolveReviewRequest(
        input({
          config: { ...baseConfig, reviewTimeoutMs: 120_000 },
          flags: { timeoutMs: 45_000 },
        }),
      );

      expect(request.timeoutMs).toBe(45_000);
    });
  });

  describe("limits", () => {
    it("omits limits when the config declares no diffLimits", () => {
      const request = resolveReviewRequest(input());

      expect(request.limits).toBeUndefined();
      expect(Object.hasOwn(request, "limits")).toBe(false);
    });

    it("forwards config.diffLimits when present", () => {
      const request = resolveReviewRequest(
        input({
          config: {
            ...baseConfig,
            diffLimits: { maxLines: 5000, maxTokens: 80_000 },
          },
        }),
      );

      expect(request.limits).toEqual({ maxLines: 5000, maxTokens: 80_000 });
    });
  });

  describe("validations (AC-11)", () => {
    it("omits validations when the entry declares none", () => {
      const request = resolveReviewRequest(input());

      expect(Object.hasOwn(request, "validations")).toBe(false);
    });

    it("forwards the entry's declared validations verbatim", () => {
      const request = resolveReviewRequest(
        input({
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              defaultHarness: "pr-review",
              validations: ["npm run check", "npm test"],
            },
          },
        }),
      );

      expect(request.validations).toEqual(["npm run check", "npm test"]);
    });
  });

  describe("validationTimeoutMs", () => {
    it("omits it when neither the entry nor the config supplies one", () => {
      expect(
        Object.hasOwn(resolveReviewRequest(input()), "validationTimeoutMs"),
      ).toBe(false);
    });

    it("falls back to the global validationTimeoutMs", () => {
      const request = resolveReviewRequest(
        input({ config: { ...baseConfig, validationTimeoutMs: 30_000 } }),
      );

      expect(request.validationTimeoutMs).toBe(30_000);
    });

    it("prefers the entry's validationTimeoutMs over the global one", () => {
      const request = resolveReviewRequest(
        input({
          config: { ...baseConfig, validationTimeoutMs: 30_000 },
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              defaultHarness: "pr-review",
              validationTimeoutMs: 5_000,
            },
          },
        }),
      );

      expect(request.validationTimeoutMs).toBe(5_000);
    });
  });

  describe("engineName (internal resolveEngine call)", () => {
    it("resolves the global default when no override exists", () => {
      expect(resolveReviewRequest(input()).engineName).toBe("claude-code");
    });

    it("prefers the entry's defaultEngine over the global default", () => {
      const request = resolveReviewRequest(
        input({
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              defaultHarness: "pr-review",
              defaultEngine: "opencode",
            },
          },
        }),
      );

      expect(request.engineName).toBe("opencode");
    });

    it("prefers the --engine flag over both other levels", () => {
      const request = resolveReviewRequest(
        input({
          repos: {
            "acme/widgets": {
              url: "https://example.com/acme/widgets.git",
              defaultHarness: "pr-review",
              defaultEngine: "opencode",
            },
          },
          flags: { engineName: "claude-code" },
        }),
      );

      expect(request.engineName).toBe("claude-code");
    });

    it("surfaces UnknownEngineError for an unknown --engine value", () => {
      expect(() =>
        resolveReviewRequest(input({ flags: { engineName: "gpt-cli" } })),
      ).toThrow(UnknownEngineError);
    });
  });

  describe("cleanupPolicy", () => {
    it("omits cleanupPolicy so runReview's own default stands", () => {
      const request = resolveReviewRequest(input());

      expect(Object.hasOwn(request, "cleanupPolicy")).toBe(false);
    });
  });

  describe("registry lookup", () => {
    it("throws RepoNotFoundError for an unknown alias", () => {
      const call = () =>
        resolveReviewRequest(input({ repoAlias: "acme/other" }));

      expect(call).toThrow(RepoNotFoundError);
      expect(call).toThrow(/acme\/other/);
    });
  });
});
