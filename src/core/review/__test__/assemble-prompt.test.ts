import { describe, expect, it } from "vitest";
import type { DiffFileEntry, ReviewDiff } from "../../workspace/index.js";
import {
  type AssemblePromptInput,
  assemblePrompt,
} from "../assemble-prompt.js";
import {
  ContextModeNotSupportedError,
  HarnessError,
} from "../ports/harness-errors.js";
import type {
  ContextMode,
  ResolvedHarness,
  Skill,
} from "../ports/harness-schemas.js";

function buildInput(
  overrides?: Partial<{
    instructions: string;
    skills: readonly Skill[];
    outputContract: string | undefined;
    diff: ReviewDiff;
    validationOutput: readonly string[] | undefined;
    contextMode: ContextMode;
  }>,
): AssemblePromptInput {
  const defaultDiff: ReviewDiff = {
    files: [
      {
        path: "src/foo.ts",
        additions: 5,
        deletions: 2,
        content: "+added line\n-removed line",
        truncated: false,
        diffLineCount: 7,
      },
    ],
    totalLines: 7,
    estimatedTokens: 20,
    truncated: false,
    warnings: [],
  };

  const hasContractOverride =
    overrides !== undefined && "outputContract" in overrides;
  const contractValue = hasContractOverride
    ? overrides.outputContract
    : "Return JSON with findings array.";

  const harness = {
    type: "security",
    instructions: overrides?.instructions ?? "Review this code carefully.",
    skills: ["skill-a"] as readonly string[],
    contextMode: overrides?.contextMode ?? ("inline" as const),
    ...(contractValue !== undefined ? { outputContract: contractValue } : {}),
  };

  const skills: readonly Skill[] = overrides?.skills ?? [
    { name: "skill-a", content: "Skill A content here." },
  ];

  const resolvedHarness: ResolvedHarness = { harness, skills };

  const result: AssemblePromptInput = {
    resolvedHarness,
    diff: overrides?.diff ?? defaultDiff,
  };

  if (overrides !== undefined && "validationOutput" in overrides) {
    if (overrides.validationOutput !== undefined) {
      return { ...result, validationOutput: overrides.validationOutput };
    }
  } else {
    return {
      ...result,
      validationOutput: ["lint passed", "types checked"],
    };
  }

  return result;
}

describe("assemblePrompt", () => {
  it("renders full input with all sections", () => {
    const input = buildInput();
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      <skill name="skill-a">
      Skill A content here.
      </skill>
      </skills>

      <output-contract>
      Return JSON with findings array.
      </output-contract>

      <diff totalLines="7" estimatedTokens="20" truncated="false">
      <file path="src/foo.ts" additions="5" deletions="2">
      +added line
      -removed line
      </file>
      </diff>

      <validation-output>
      lint passed
      types checked
      </validation-output>"
    `);
  });

  it("produces identical output for identical input (determinism)", () => {
    const input = buildInput();
    const a = assemblePrompt(input);
    const b = assemblePrompt(input);
    expect(a).toBe(b);
  });

  it("omits output-contract when absent", () => {
    const input = buildInput({ outputContract: undefined });
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      <skill name="skill-a">
      Skill A content here.
      </skill>
      </skills>

      <diff totalLines="7" estimatedTokens="20" truncated="false">
      <file path="src/foo.ts" additions="5" deletions="2">
      +added line
      -removed line
      </file>
      </diff>

      <validation-output>
      lint passed
      types checked
      </validation-output>"
    `);
  });

  it("omits validation-output when absent", () => {
    const input = buildInput({ validationOutput: undefined });
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      <skill name="skill-a">
      Skill A content here.
      </skill>
      </skills>

      <output-contract>
      Return JSON with findings array.
      </output-contract>

      <diff totalLines="7" estimatedTokens="20" truncated="false">
      <file path="src/foo.ts" additions="5" deletions="2">
      +added line
      -removed line
      </file>
      </diff>"
    `);
  });

  it("omits both output-contract and validation-output when absent", () => {
    const input = buildInput({
      outputContract: undefined,
      validationOutput: undefined,
    });
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      <skill name="skill-a">
      Skill A content here.
      </skill>
      </skills>

      <diff totalLines="7" estimatedTokens="20" truncated="false">
      <file path="src/foo.ts" additions="5" deletions="2">
      +added line
      -removed line
      </file>
      </diff>"
    `);
  });

  it("omits validation-output for empty array", () => {
    const input = buildInput({ validationOutput: [] });
    const result = assemblePrompt(input);
    expect(result).not.toContain("<validation-output>");
  });

  it("renders empty skills tag when skills array is empty", () => {
    const input = buildInput({ skills: [] });
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      </skills>

      <output-contract>
      Return JSON with findings array.
      </output-contract>

      <diff totalLines="7" estimatedTokens="20" truncated="false">
      <file path="src/foo.ts" additions="5" deletions="2">
      +added line
      -removed line
      </file>
      </diff>

      <validation-output>
      lint passed
      types checked
      </validation-output>"
    `);
  });

  it("renders multiple skills in declaration order", () => {
    const skills: Skill[] = [
      { name: "zeta-skill", content: "Zeta content." },
      { name: "alpha-skill", content: "Alpha content." },
      { name: "mid-skill", content: "Mid content." },
    ];
    const input = buildInput({ skills });
    const result = assemblePrompt(input);
    const zetaIdx = result.indexOf('name="zeta-skill"');
    const alphaIdx = result.indexOf('name="alpha-skill"');
    const midIdx = result.indexOf('name="mid-skill"');
    expect(zetaIdx).toBeLessThan(alphaIdx);
    expect(alphaIdx).toBeLessThan(midIdx);
  });

  it("renders multi-file diff in array order", () => {
    const files: DiffFileEntry[] = [
      {
        path: "src/b.ts",
        additions: 3,
        deletions: 1,
        content: "+b change",
        truncated: false,
        diffLineCount: 4,
      },
      {
        path: "src/a.ts",
        additions: 1,
        deletions: 0,
        content: "+a change",
        truncated: false,
        diffLineCount: 1,
      },
    ];
    const diff: ReviewDiff = {
      files,
      totalLines: 5,
      estimatedTokens: 15,
      truncated: false,
      warnings: [],
    };
    const input = buildInput({ diff });
    const result = assemblePrompt(input);
    expect(result).toMatchInlineSnapshot(`
      "<instructions>
      Review this code carefully.
      </instructions>

      <skills>
      <skill name="skill-a">
      Skill A content here.
      </skill>
      </skills>

      <output-contract>
      Return JSON with findings array.
      </output-contract>

      <diff totalLines="5" estimatedTokens="15" truncated="false">
      <file path="src/b.ts" additions="3" deletions="1">
      +b change
      </file>
      <file path="src/a.ts" additions="1" deletions="0">
      +a change
      </file>
      </diff>

      <validation-output>
      lint passed
      types checked
      </validation-output>"
    `);
  });

  it("renders [content not available] for null-content file", () => {
    const files: DiffFileEntry[] = [
      {
        path: "src/binary.png",
        additions: 0,
        deletions: 0,
        content: null,
        truncated: false,
        diffLineCount: 0,
      },
    ];
    const diff: ReviewDiff = {
      files,
      totalLines: 0,
      estimatedTokens: 0,
      truncated: false,
      warnings: [],
    };
    const input = buildInput({ diff });
    const result = assemblePrompt(input);
    expect(result).toContain("[content not available]");
    expect(result).toContain('path="src/binary.png"');
  });

  it("renders diff warnings before file entries", () => {
    const diff: ReviewDiff = {
      files: [
        {
          path: "src/large.ts",
          additions: 100,
          deletions: 50,
          content: "+large diff",
          truncated: true,
          diffLineCount: 150,
        },
      ],
      totalLines: 150,
      estimatedTokens: 500,
      truncated: true,
      warnings: [
        {
          kind: "diff-truncated",
          message:
            "Diff truncated: kept 500 of 1200 lines (42% of 5 files truncated)",
          originalLines: 1200,
          originalTokens: 4000,
          keptLines: 500,
          keptTokens: 1500,
          truncatedFileCount: 5,
          totalFileCount: 10,
        },
      ],
    };
    const input = buildInput({ diff });
    const result = assemblePrompt(input);
    const warningIdx = result.indexOf("<warning>");
    const fileIdx = result.indexOf("<file ");
    expect(warningIdx).toBeGreaterThan(-1);
    expect(fileIdx).toBeGreaterThan(-1);
    expect(warningIdx).toBeLessThan(fileIdx);
    expect(result).toContain('truncated="true"');
  });

  it("throws ContextModeNotSupportedError when contextMode is agent", () => {
    const input = buildInput({ contextMode: "agent" });
    expect(() => assemblePrompt(input)).toThrow(ContextModeNotSupportedError);
  });

  it("ContextModeNotSupportedError extends HarnessError", () => {
    const err = new ContextModeNotSupportedError("agent");
    expect(err).toBeInstanceOf(HarnessError);
    expect(err.mode).toBe("agent");
    expect(err.message).toBe('Context mode "agent" is not yet supported');
    expect(err.name).toBe("ContextModeNotSupportedError");
  });
});
