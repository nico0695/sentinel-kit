import { z } from "zod";

export const HarnessSkillsSchema = z.object({
  skills: z.array(z.string()),
});

export type HarnessSkillsConfig = z.infer<typeof HarnessSkillsSchema>;

export interface Harness {
  readonly type: string;
  readonly instructions: string;
  readonly outputContract?: string;
  readonly skills: readonly string[];
}

export interface Skill {
  readonly name: string;
  readonly content: string;
}

export interface ResolvedHarness {
  readonly harness: Harness;
  readonly skills: readonly Skill[];
}
