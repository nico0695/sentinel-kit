import { HarnessNotFoundError } from "../ports/harness-errors.js";
import type { HarnessLoader } from "../ports/harness-loader.js";
import type { Harness, Skill } from "../ports/harness-schemas.js";

export class FakeHarnessLoader implements HarnessLoader {
  private readonly harnesses = new Map<string, Harness>();
  private readonly skills = new Map<string, Skill>();

  addHarness(harness: Harness): void {
    this.harnesses.set(harness.type, harness);
  }

  addSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  async listHarnesses(): Promise<string[]> {
    return [...this.harnesses.keys()];
  }

  async loadHarness(type: string): Promise<Harness> {
    const harness = this.harnesses.get(type);
    if (harness === undefined) {
      throw new HarnessNotFoundError(type);
    }
    return harness;
  }

  async listSkills(): Promise<string[]> {
    return [...this.skills.keys()];
  }

  async loadSkill(name: string): Promise<Skill> {
    const skill = this.skills.get(name);
    if (skill === undefined) {
      throw new HarnessNotFoundError(name);
    }
    return skill;
  }
}
