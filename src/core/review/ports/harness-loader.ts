import type { Harness, Skill } from "./harness-schemas.js";

export interface HarnessLoader {
  listHarnesses(): Promise<string[]>;
  loadHarness(type: string): Promise<Harness>;
  listSkills(): Promise<string[]>;
  loadSkill(name: string): Promise<Skill>;
}
