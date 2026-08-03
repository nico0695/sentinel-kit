import type { Skill } from "./ports/harness-schemas.js";

export function resolveHarnessSkills(
  harnessSkillNames: readonly string[],
  extraSkills: readonly string[],
  availableSkills: ReadonlyMap<string, Skill>,
): { resolved: readonly Skill[]; missing: readonly string[] } {
  const merged = [...new Set([...harnessSkillNames, ...extraSkills])];
  merged.sort();

  const resolved: Skill[] = [];
  const missing: string[] = [];

  for (const name of merged) {
    const skill = availableSkills.get(name);
    if (skill !== undefined) {
      resolved.push(skill);
    } else {
      missing.push(name);
    }
  }

  return { resolved, missing };
}
