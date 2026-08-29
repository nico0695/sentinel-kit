/**
 * The `[SEV: …]` heuristic (`[E6.F2.H2]`, #39; AC-3, and AC-2's extraction
 * half).
 *
 * Two things are under guard here:
 *
 * - **What counts as a finding**: a trimmed line whose text — after an
 *   optional list or quote marker — starts with `[SEV: <level>]`, matched
 *   case-insensitively over exactly `blocker | major | minor | nit`. A level
 *   outside those four is not a finding, and neither is prose.
 * - **What survives**: everything after the marker, verbatim. The matrix
 *   below deliberately varies the separator (em dash, hyphen, none) and the
 *   `file:line` shape (single line, range) because carrying the remainder
 *   unparsed is exactly what makes those variations irrelevant (spec A8).
 *
 * The two positive cases that matter most are not invented: they are read
 * from the real engine fixture `fixtures/claude-code/valid-verdict.json`,
 * the same file the verdict-extraction suites use.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFindings, matchFindingLine } from "../findings.js";

/** The `result` text of the real claude-code fixture: 1 major, 1 minor. */
function fixtureMarkdown(): string {
  const raw = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../fixtures/claude-code/valid-verdict.json",
        import.meta.url,
      ),
    ),
    "utf-8",
  );

  const parsed = JSON.parse(raw) as { readonly result: string };

  return parsed.result;
}

describe("matchFindingLine — real fixture lines (AC-2, AC-3)", () => {
  const lines = fixtureMarkdown().split("\n");

  it("classifies the fixture's major line and keeps its text verbatim", () => {
    const major = lines.find((line) => line.startsWith("[SEV: major]"));

    expect(major).toBeDefined();
    expect(matchFindingLine(major ?? "")).toEqual({
      severity: "major",
      text: (major ?? "").replace("[SEV: major] ", ""),
    });
  });

  it("keeps the `calc.js:6-8` line range intact — no re-splitting", () => {
    const major = lines.find((line) => line.startsWith("[SEV: major]"));
    const finding = matchFindingLine(major ?? "");

    expect(finding?.text.startsWith("calc.js:6-8 — ")).toBe(true);
    expect(finding?.text).toContain("divide-by-zero guard");
  });

  it("classifies the fixture's minor line", () => {
    const minor = lines.find((line) => line.startsWith("[SEV: minor]"));
    const finding = matchFindingLine(minor ?? "");

    expect(finding?.severity).toBe("minor");
    expect(finding?.text.startsWith("calc.js:9 — ")).toBe(true);
  });
});

describe("matchFindingLine — accepted shapes (AC-3)", () => {
  it("accepts a bare marker line", () => {
    expect(
      matchFindingLine("[SEV: blocker] auth.ts:12 — token never expires"),
    ).toEqual({
      severity: "blocker",
      text: "auth.ts:12 — token never expires",
    });
  });

  it("accepts a list-prefixed line", () => {
    expect(matchFindingLine("- [SEV: nit] naming")).toEqual({
      severity: "nit",
      text: "naming",
    });
  });

  it("accepts a quoted bullet (repeatable prefix)", () => {
    expect(matchFindingLine("> - [SEV: blocker] leaked worktree")).toEqual({
      severity: "blocker",
      text: "leaked worktree",
    });
  });

  it("accepts an ordered-list prefix in both forms", () => {
    expect(matchFindingLine("1. [SEV: major] a")?.severity).toBe("major");
    expect(matchFindingLine("12) [SEV: major] b")?.severity).toBe("major");
  });

  it("accepts an indented line", () => {
    expect(matchFindingLine("    [SEV: major] indented finding")).toEqual({
      severity: "major",
      text: "indented finding",
    });
  });

  it("accepts a hyphen separator", () => {
    expect(matchFindingLine("[SEV: major] calc.js:6 - dropped guard")).toEqual({
      severity: "major",
      text: "calc.js:6 - dropped guard",
    });
  });

  it("accepts no separator at all", () => {
    expect(matchFindingLine("[SEV: minor] calc.js:9 rename this")).toEqual({
      severity: "minor",
      text: "calc.js:9 rename this",
    });
  });

  it("matches case-insensitively and tolerates inner spacing", () => {
    expect(matchFindingLine("[sev: MAJOR] a")?.severity).toBe("major");
    expect(matchFindingLine("[ SEV : Minor ]  b")).toEqual({
      severity: "minor",
      text: "b",
    });
  });

  it("absorbs a trailing carriage return and outer whitespace", () => {
    expect(matchFindingLine("  [SEV: nit] trailing  \r")).toEqual({
      severity: "nit",
      text: "trailing",
    });
  });

  it("keeps an empty remainder as an empty string", () => {
    expect(matchFindingLine("[SEV: blocker]")).toEqual({
      severity: "blocker",
      text: "",
    });
  });
});

describe("matchFindingLine — rejected shapes (AC-3)", () => {
  it("rejects a level outside the four", () => {
    expect(matchFindingLine("[SEV: critical] the build is on fire")).toBe(
      undefined,
    );
  });

  it("rejects prose", () => {
    expect(matchFindingLine("The review found a few problems.")).toBe(
      undefined,
    );
  });

  it("rejects a heading and a verdict line", () => {
    expect(matchFindingLine("## Findings")).toBe(undefined);
    expect(matchFindingLine("VERDICT: request-changes")).toBe(undefined);
  });

  it("rejects a marker that does not start the line", () => {
    expect(matchFindingLine("see [SEV: major] below")).toBe(undefined);
  });

  it("rejects a malformed marker", () => {
    expect(matchFindingLine("[SEVERITY: major] a")).toBe(undefined);
    expect(matchFindingLine("[SEV major] a")).toBe(undefined);
    expect(matchFindingLine("SEV: major — a")).toBe(undefined);
  });

  it("rejects an empty line", () => {
    expect(matchFindingLine("")).toBe(undefined);
    expect(matchFindingLine("   ")).toBe(undefined);
  });
});

describe("extractFindings (AC-2)", () => {
  it("returns the fixture's two findings in source order", () => {
    const findings = extractFindings(fixtureMarkdown());

    expect(findings.map((finding) => finding.severity)).toEqual([
      "major",
      "minor",
    ]);
    expect(findings[0]?.text.startsWith("calc.js:6-8 — ")).toBe(true);
    expect(findings[1]?.text.startsWith("calc.js:9 — ")).toBe(true);
  });

  it("keeps source order across a mixed markdown document", () => {
    const markdown = [
      "## Review",
      "",
      "Some prose about the diff.",
      "- [SEV: nit] naming",
      "[SEV: blocker] auth.ts:12 — token never expires",
      "[SEV: critical] ignored: unknown level",
      "  [SEV: major] calc.js:6-8 — dropped guard",
      "",
      "VERDICT: request-changes",
    ].join("\n");

    expect(extractFindings(markdown)).toEqual([
      { severity: "nit", text: "naming" },
      { severity: "blocker", text: "auth.ts:12 — token never expires" },
      { severity: "major", text: "calc.js:6-8 — dropped guard" },
    ]);
  });

  it("returns nothing for markdown that ignores the convention", () => {
    expect(
      extractFindings("# Review\n\nLooks fine to me.\n\nVERDICT: approve\n"),
    ).toEqual([]);
  });

  it("returns nothing for empty markdown", () => {
    expect(extractFindings("")).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    expect(extractFindings("[SEV: major] a\r\n[SEV: nit] b\r\n")).toEqual([
      { severity: "major", text: "a" },
      { severity: "nit", text: "b" },
    ]);
  });
});
