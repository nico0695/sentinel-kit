/**
 * `extractBuiltInVerdict` behavioural suite — `[E4.F1.H2]` (#27).
 *
 * Parser-only concern, co-located beside the file it tests (matching the
 * `run-review.ts` ↔ `run-review.test.ts` convention) rather than folded into
 * `run-review.test.ts`, which exercises `runReview`'s pipeline through only
 * a couple of representative engine outputs. All 16 spec.md ACs are proven
 * here, either as a unit test (AC-1..AC-10, AC-13, the defensive-guard cast
 * test) or as a validation step recorded in `execution-log.md` (AC-11,
 * AC-12, AC-14, AC-15, AC-16 — process/inspection checks, not unit tests,
 * per spec.md's own Validation Hint column).
 */

import { describe, expect, it } from "vitest";
import { extractBuiltInVerdict } from "../builtin-verdict-extraction.js";
import * as runIndex from "../index.js";
import {
  readPlainTextFixture,
  reconstructClaudeCodeResult,
  reconstructOpenCodeText,
} from "./verdict-fixture-loader.js";

describe("extractBuiltInVerdict", () => {
  describe("real fixtures — marker-bearing (AC-1)", () => {
    it("claude-code/valid-verdict.json resolves to request-changes", () => {
      const output = reconstructClaudeCodeResult(
        "claude-code/valid-verdict.json",
      );
      expect(extractBuiltInVerdict(output)).toBe("request-changes");
    });

    it("claude-code/noisy-output.json resolves to request-changes (marker inside a fenced block, after prose)", () => {
      const output = reconstructClaudeCodeResult(
        "claude-code/noisy-output.json",
      );
      expect(extractBuiltInVerdict(output)).toBe("request-changes");
    });

    it("opencode/valid-verdict.ndjson resolves to request-changes", () => {
      const output = reconstructOpenCodeText("opencode/valid-verdict.ndjson");
      expect(extractBuiltInVerdict(output)).toBe("request-changes");
    });

    it("opencode/noisy-output.ndjson resolves to request-changes (marker inside a fenced block, after prose)", () => {
      const output = reconstructOpenCodeText("opencode/noisy-output.ndjson");
      expect(extractBuiltInVerdict(output)).toBe("request-changes");
    });
  });

  describe("real fixtures — negative controls (AC-2)", () => {
    it("claude-code/no-verdict.json (real prose review, no marker) resolves to null", () => {
      const output = reconstructClaudeCodeResult("claude-code/no-verdict.json");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("claude-code/auth-error.json (short error string, no marker) resolves to null", () => {
      const output = reconstructClaudeCodeResult("claude-code/auth-error.json");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("claude-code/context-overflow.json (short error string, no marker) resolves to null", () => {
      const output = reconstructClaudeCodeResult(
        "claude-code/context-overflow.json",
      );
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("claude-code/timeout-sigterm.json (no .result field — genuinely empty reconstructed text) resolves to null", () => {
      const output = reconstructClaudeCodeResult(
        "claude-code/timeout-sigterm.json",
      );
      expect(output).toBe("");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    // Corrected characterization (plan.md trap 2 / state.yaml spec-revalidation
    // finding): this fixture has 2 real `text` events, ~449 chars of genuine
    // review prose — NOT empty input. It proves the parser finds no marker in
    // real content, a different and more valuable property than empty-input
    // tolerance.
    it("opencode/no-verdict.ndjson (real prose, 2 text events, no marker line) resolves to null", () => {
      const output = reconstructOpenCodeText("opencode/no-verdict.ndjson");
      expect(output.length).toBeGreaterThan(400);
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("opencode/context-overflow.ndjson (error events only, genuinely empty reconstructed text) resolves to null", () => {
      const output = reconstructOpenCodeText(
        "opencode/context-overflow.ndjson",
      );
      expect(output).toBe("");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("opencode/timeout-sigterm-partial.ndjson (truncated mid-stream, genuinely empty reconstructed text) resolves to null", () => {
      const output = reconstructOpenCodeText(
        "opencode/timeout-sigterm-partial.ndjson",
      );
      expect(output).toBe("");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("opencode/unknown-model-stdout.txt (raw non-JSON log dump, no marker) resolves to null", () => {
      const output = readPlainTextFixture("opencode/unknown-model-stdout.txt");
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(output);
      }).not.toThrow();
      expect(result).toBeNull();
    });
  });

  describe("synthetic fixtures (AC-3, AC-4, AC-5)", () => {
    it("decoy-then-genuine.txt resolves to the tail-positioned genuine value, not the early decoy (AC-3)", () => {
      const output = readPlainTextFixture("synthetic/decoy-then-genuine.txt");
      const result = extractBuiltInVerdict(output);
      expect(result).toBe("approve");
      expect(result).not.toBe("comment");
      expect(result).not.toBeNull();
    });

    it("contradiction.txt resolves to null under the widened whole-tail-window scan (AC-4)", () => {
      const output = readPlainTextFixture("synthetic/contradiction.txt");
      expect(extractBuiltInVerdict(output)).toBeNull();
    });

    it("ansi-wrapped-verdict.txt resolves to approve after SGR stripping, and the raw string does not match the bare marker regex (AC-5)", () => {
      const raw = readPlainTextFixture("synthetic/ansi-wrapped-verdict.txt");

      expect(extractBuiltInVerdict(raw)).toBe("approve");

      // Control assertion: proves the stripping step is what made the
      // difference, not some other accidental match.
      const bareMarker = /^VERDICT:\s*(approve|request-changes|comment)$/;
      expect(bareMarker.test(raw.trim())).toBe(false);
    });
  });

  describe("case sensitivity (AC-6)", () => {
    it("lower-cased marker keyword does not match", () => {
      expect(extractBuiltInVerdict("verdict: approve")).toBeNull();
    });

    it("mixed-cased marker keyword and value do not match", () => {
      expect(extractBuiltInVerdict("Verdict: Approve")).toBeNull();
    });
  });

  describe("fuzzy-match rejection (AC-7)", () => {
    it("a space before the colon does not match", () => {
      expect(extractBuiltInVerdict("VERDICT : approve")).toBeNull();
    });

    it("a hyphen instead of a colon does not match", () => {
      expect(extractBuiltInVerdict("VERDICT-approve")).toBeNull();
    });
  });

  describe("fence tolerance (AC-8)", () => {
    it("matches a marker that is the sole line inside a bare markdown fence", () => {
      const input = "```\nVERDICT: approve\n```";
      expect(extractBuiltInVerdict(input)).toBe("approve");
    });
  });

  describe("repeated-value collapse (AC-9)", () => {
    it("two identical VERDICT lines collapse to that one value, not a contradiction", () => {
      const input = "VERDICT: approve\nAll good.\nVERDICT: approve";
      expect(extractBuiltInVerdict(input)).toBe("approve");
    });
  });

  describe("empty / absent input (AC-10)", () => {
    it("an empty string resolves to null and never throws", () => {
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict("");
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("a long non-JSON string with no marker-shaped line resolves to null and never throws", () => {
      const longNoise = "This is unrelated log noise. ".repeat(100);
      expect(longNoise.length).toBeGreaterThan(2000);
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(longNoise);
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it("an input with fewer newlines than the tail-window line bound resolves to null and never throws (PR #65 review: lastNLines boundary)", () => {
      // Regression pin for a fromIndex(-1)-clamping bug caught while fixing a
      // Copilot review finding: an input whose newline count is well under
      // TAIL_LINES must fall back to the whole string, not throw or hang.
      const fewNewlines = "\n\n\n";
      let result: unknown;
      expect(() => {
        result = extractBuiltInVerdict(fewNewlines);
      }).not.toThrow();
      expect(result).toBeNull();
    });
  });

  describe("defensive non-string-input coercion (d-design-open-questions (b))", () => {
    it("a non-string value passed via an explicit cast is coerced, not thrown", () => {
      let result: unknown;
      expect(() => {
        // Explicit cast past the (output: string) signature — proves the
        // top-of-function `typeof output === "string" ? ... : String(...)`
        // coercion branch is actually exercised, not merely present as
        // untested defensive code.
        result = extractBuiltInVerdict(123 as unknown as string);
      }).not.toThrow();
      expect(result).toBeNull();
    });
  });

  describe("not exported from the module's public index (AC-13, mechanical)", () => {
    it("index.ts's export namespace does not contain extractBuiltInVerdict or any file-private helper", () => {
      const exportedNames = Object.keys(runIndex);
      expect(exportedNames).not.toContain("extractBuiltInVerdict");
      expect(exportedNames).not.toContain("computeTailWindow");
      expect(exportedNames).not.toContain("stripAnsiSgr");
      expect(exportedNames).not.toContain("collectDistinctVerdicts");
    });
  });
});
