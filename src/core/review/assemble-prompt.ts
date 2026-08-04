import type {
  DiffFileEntry,
  DiffWarning,
  ReviewDiff,
} from "../workspace/index.js";
import { ContextModeNotSupportedError } from "./ports/harness-errors.js";
import type { ResolvedHarness, Skill } from "./ports/harness-schemas.js";

export interface AssemblePromptInput {
  readonly resolvedHarness: ResolvedHarness;
  readonly diff: ReviewDiff;
  readonly validationOutput?: readonly string[];
}

export function assemblePrompt(input: AssemblePromptInput): string {
  if (input.resolvedHarness.harness.contextMode === "agent") {
    throw new ContextModeNotSupportedError("agent");
  }

  const sections = [
    renderInstructions(input.resolvedHarness.harness.instructions),
    renderSkills(input.resolvedHarness.skills),
    renderOutputContract(input.resolvedHarness.harness.outputContract),
    renderDiff(input.diff),
    renderValidationOutput(input.validationOutput),
  ];
  return sections.filter((s): s is string => s !== null).join("\n\n");
}

function renderInstructions(instructions: string): string {
  return `<instructions>\n${instructions}\n</instructions>`;
}

function renderSkills(skills: readonly Skill[]): string {
  if (skills.length === 0) {
    return "<skills>\n</skills>";
  }
  const inner = skills
    .map((s) => `<skill name="${s.name}">\n${s.content}\n</skill>`)
    .join("\n");
  return `<skills>\n${inner}\n</skills>`;
}

function renderOutputContract(contract: string | undefined): string | null {
  if (contract === undefined) {
    return null;
  }
  return `<output-contract>\n${contract}\n</output-contract>`;
}

function renderDiff(diff: ReviewDiff): string {
  const attrs = `totalLines="${diff.totalLines}" estimatedTokens="${diff.estimatedTokens}" truncated="${String(diff.truncated)}"`;
  const parts: string[] = [];

  for (const w of diff.warnings) {
    parts.push(renderWarning(w));
  }

  for (const f of diff.files) {
    parts.push(renderFile(f));
  }

  if (parts.length === 0) {
    return `<diff ${attrs}>\n</diff>`;
  }
  return `<diff ${attrs}>\n${parts.join("\n")}\n</diff>`;
}

function renderWarning(warning: DiffWarning): string {
  return `<warning>${warning.message}</warning>`;
}

function renderFile(entry: DiffFileEntry): string {
  const truncAttr = entry.truncated ? ` truncated="true"` : "";
  const body = entry.content ?? "[content not available]";
  return `<file path="${entry.path}" additions="${entry.additions}" deletions="${entry.deletions}"${truncAttr}>\n${body}\n</file>`;
}

function renderValidationOutput(
  lines: readonly string[] | undefined,
): string | null {
  if (lines === undefined || lines.length === 0) {
    return null;
  }
  return `<validation-output>\n${lines.join("\n")}\n</validation-output>`;
}
