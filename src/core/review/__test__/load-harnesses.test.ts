import { describe, expect, it } from "vitest";
import { type LoadHarnessesDeps, loadHarnesses } from "../load-harnesses.js";
import {
  HarnessNotFoundError,
  SkillNotFoundError,
} from "../ports/harness-errors.js";
import type { Harness } from "../ports/harness-schemas.js";
import { FakeHarnessLoader } from "./fake-harness-loader.js";

function harness(type: string, skills: string[] = []): Harness {
  return {
    type,
    instructions: `${type} instructions`,
    skills,
    contextMode: "inline" as const,
  };
}

function makeDeps(
  factory?: FakeHarnessLoader,
  user?: FakeHarnessLoader,
): LoadHarnessesDeps & {
  factory: FakeHarnessLoader;
  user: FakeHarnessLoader;
} {
  return {
    factory: factory ?? new FakeHarnessLoader(),
    user: user ?? new FakeHarnessLoader(),
  };
}

describe("loadHarnesses", () => {
  it("returns empty map when both loaders are empty", async () => {
    const deps = makeDeps();
    const result = await loadHarnesses(deps);
    expect(result.size).toBe(0);
  });

  it("loads harnesses from factory loader", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security"));
    const result = await loadHarnesses(deps);
    expect(result.size).toBe(1);
    expect(result.get("security")?.harness.type).toBe("security");
  });

  it("loads harnesses from user loader", async () => {
    const deps = makeDeps();
    deps.user.addHarness(harness("custom"));
    const result = await loadHarnesses(deps);
    expect(result.size).toBe(1);
    expect(result.get("custom")?.harness.type).toBe("custom");
  });

  it("user harness overrides factory harness with same name", async () => {
    const deps = makeDeps();
    deps.factory.addHarness({
      type: "security",
      instructions: "factory version",
      skills: [],
      contextMode: "inline" as const,
    });
    deps.user.addHarness({
      type: "security",
      instructions: "user version",
      skills: [],
      contextMode: "inline" as const,
    });
    const result = await loadHarnesses(deps);
    expect(result.size).toBe(1);
    expect(result.get("security")?.harness.instructions).toBe("user version");
  });

  it("merges harnesses from both loaders", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security"));
    deps.user.addHarness(harness("custom"));
    const result = await loadHarnesses(deps);
    expect(result.size).toBe(2);
    expect(result.has("security")).toBe(true);
    expect(result.has("custom")).toBe(true);
  });

  it("resolves skills for harnesses", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security", ["skill-a"]));
    deps.factory.addSkill({ name: "skill-a", content: "skill a content" });
    const result = await loadHarnesses(deps);
    const resolved = result.get("security");
    expect(resolved?.skills).toHaveLength(1);
    expect(resolved?.skills[0]?.name).toBe("skill-a");
  });

  it("resolves extra skills alongside harness skills", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security", ["skill-a"]));
    deps.factory.addSkill({ name: "skill-a", content: "a" });
    deps.factory.addSkill({ name: "skill-b", content: "b" });
    const result = await loadHarnesses(deps, ["skill-b"]);
    const resolved = result.get("security");
    expect(resolved?.skills).toHaveLength(2);
    expect(resolved?.skills.map((s) => s.name)).toEqual(["skill-a", "skill-b"]);
  });

  it("user skills override factory skills with same name", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security", ["shared"]));
    deps.factory.addSkill({ name: "shared", content: "factory content" });
    deps.user.addSkill({ name: "shared", content: "user content" });
    const result = await loadHarnesses(deps);
    const resolved = result.get("security");
    expect(resolved?.skills[0]?.content).toBe("user content");
  });

  it("throws SkillNotFoundError for missing skill reference", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security", ["nonexistent"]));
    await expect(loadHarnesses(deps)).rejects.toThrow(SkillNotFoundError);
  });

  it("SkillNotFoundError includes skill name and referencing harness", async () => {
    const deps = makeDeps();
    deps.factory.addHarness(harness("security", ["missing-skill"]));
    try {
      await loadHarnesses(deps);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SkillNotFoundError);
      const e = err as SkillNotFoundError;
      expect(e.skillName).toBe("missing-skill");
      expect(e.referencedBy).toBe("security");
    }
  });

  it("propagates HarnessNotFoundError from loader", async () => {
    const factory = new FakeHarnessLoader();
    const user = new FakeHarnessLoader();
    const badLoader: FakeHarnessLoader = Object.create(factory);
    badLoader.listHarnesses = async () => ["ghost"];
    badLoader.loadHarness = async (type: string) => {
      throw new HarnessNotFoundError(type);
    };
    await expect(loadHarnesses({ factory: badLoader, user })).rejects.toThrow(
      HarnessNotFoundError,
    );
  });
});
