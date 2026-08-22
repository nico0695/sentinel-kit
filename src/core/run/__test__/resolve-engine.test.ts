/**
 * `resolveEngine` behavioural suite (AC-1..AC-5).
 *
 * Precedence matrix (run > repo > global), unknown-name rejection at each
 * winning level, the shadowed-invalid-value case, and error message content.
 */

import { describe, expect, it } from "vitest";
import { resolveEngine } from "../resolve-engine.js";
import { UnknownEngineError } from "../run-errors.js";

describe("resolveEngine", () => {
  describe("precedence (AC-1, AC-2, AC-3)", () => {
    it("resolves the global default when neither override is present", () => {
      expect(resolveEngine({ globalDefault: "claude-code" })).toBe(
        "claude-code",
      );
    });

    it("resolves the repo override over the global default", () => {
      expect(
        resolveEngine({
          globalDefault: "claude-code",
          repoOverride: "opencode",
        }),
      ).toBe("opencode");
    });

    it("resolves the run override over both repo and global", () => {
      expect(
        resolveEngine({
          globalDefault: "claude-code",
          repoOverride: "opencode",
          runOverride: "claude-code",
        }),
      ).toBe("claude-code");
    });

    it("resolves the run override over the global default when repo is absent", () => {
      expect(
        resolveEngine({
          globalDefault: "claude-code",
          runOverride: "opencode",
        }),
      ).toBe("opencode");
    });
  });

  describe("unknown-name rejection (AC-4, AC-5)", () => {
    it("throws UnknownEngineError when the winning run override is invalid", () => {
      expect(() =>
        resolveEngine({
          globalDefault: "claude-code",
          repoOverride: "opencode",
          runOverride: "codex",
        }),
      ).toThrow(UnknownEngineError);

      try {
        resolveEngine({ globalDefault: "claude-code", runOverride: "codex" });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownEngineError);
        const unknownEngineError = error as UnknownEngineError;
        expect(unknownEngineError.value).toBe("codex");
        expect(unknownEngineError.level).toBe("run");
        expect(unknownEngineError.message).toContain("codex");
        expect(unknownEngineError.message).toContain("run");
      }
    });

    it("throws UnknownEngineError when the winning repo override is invalid", () => {
      try {
        resolveEngine({
          globalDefault: "claude-code",
          repoOverride: "not-an-engine",
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownEngineError);
        const unknownEngineError = error as UnknownEngineError;
        expect(unknownEngineError.value).toBe("not-an-engine");
        expect(unknownEngineError.level).toBe("repo");
      }
    });

    it("does not validate a repo override shadowed by a valid run override", () => {
      // The invalid repoOverride is never inspected: runOverride wins
      // precedence outright, so resolution never touches the repo level.
      expect(
        resolveEngine({
          globalDefault: "claude-code",
          repoOverride: "not-an-engine",
          runOverride: "opencode",
        }),
      ).toBe("opencode");
    });
  });
});
