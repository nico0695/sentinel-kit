import { z } from "zod";

export type ContextMode = "inline" | "agent";

export const HarnessSkillsSchema = z.object({
  skills: z.array(z.string()),
  contextMode: z.enum(["inline", "agent"]).default("inline"),
});

export type HarnessSkillsConfig = z.infer<typeof HarnessSkillsSchema>;

export interface Harness {
  readonly type: string;
  readonly instructions: string;
  readonly outputContract?: string;
  readonly skills: readonly string[];
  readonly contextMode: ContextMode;
}

export interface Skill {
  readonly name: string;
  readonly content: string;
}

export interface ResolvedHarness {
  readonly harness: Harness;
  readonly skills: readonly Skill[];
}
