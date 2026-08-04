import { SkillNotFoundError } from "./ports/harness-errors.js";
import type { HarnessLoader } from "./ports/harness-loader.js";
import type { ResolvedHarness, Skill } from "./ports/harness-schemas.js";
import { resolveHarnessSkills } from "./resolve-harness-skills.js";

export interface LoadHarnessesDeps {
  readonly factory: HarnessLoader;
  readonly user: HarnessLoader;
}

export async function loadHarnesses(
  deps: LoadHarnessesDeps,
  extraSkills?: readonly string[],
): Promise<Map<string, ResolvedHarness>> {
  const [factoryTypes, userTypes] = await Promise.all([
    deps.factory.listHarnesses(),
    deps.user.listHarnesses(),
  ]);

  const mergedTypes = [...new Set([...factoryTypes, ...userTypes])];
  const userTypeSet = new Set(userTypes);

  const [factorySkillNames, userSkillNames] = await Promise.all([
    deps.factory.listSkills(),
    deps.user.listSkills(),
  ]);

  const allSkillNames = [...new Set([...factorySkillNames, ...userSkillNames])];
  const userSkillNameSet = new Set(userSkillNames);

  const skillEntries = await Promise.all(
    allSkillNames.map(async (name) => {
      const loader = userSkillNameSet.has(name) ? deps.user : deps.factory;
      const skill = await loader.loadSkill(name);
      return [name, skill] as const;
    }),
  );
  const availableSkills = new Map<string, Skill>(skillEntries);

  const result = new Map<string, ResolvedHarness>();

  for (const type of mergedTypes) {
    const loader = userTypeSet.has(type) ? deps.user : deps.factory;
    const harness = await loader.loadHarness(type);

    const { resolved, missing } = resolveHarnessSkills(
      harness.skills,
      extraSkills ?? [],
      availableSkills,
    );

    if (missing.length > 0) {
      const first = missing[0] as string;
      throw new SkillNotFoundError(first, type);
    }

    result.set(type, { harness, skills: resolved });
  }

  return result;
}
