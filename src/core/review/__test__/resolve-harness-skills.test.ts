import { describe, expect, it } from "vitest";
import type { Skill } from "../ports/harness-schemas.js";
import { resolveHarnessSkills } from "../resolve-harness-skills.js";

function skill(name: string): Skill {
  return { name, content: `${name} content` };
}

function skillMap(...skills: Skill[]): ReadonlyMap<string, Skill> {
  return new Map(skills.map((s) => [s.name, s]));
}

describe("resolveHarnessSkills", () => {
  it("returns empty when no skill names and no extras", () => {
    const result = resolveHarnessSkills([], [], new Map());
    expect(result.resolved).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("resolves harness skills from available map", () => {
    const a = skill("alpha");
    const b = skill("beta");
    const result = resolveHarnessSkills(["alpha", "beta"], [], skillMap(a, b));
    expect(result.resolved).toEqual([a, b]);
    expect(result.missing).toEqual([]);
  });

  it("merges extras with harness skills", () => {
    const a = skill("alpha");
    const b = skill("beta");
    const result = resolveHarnessSkills(["alpha"], ["beta"], skillMap(a, b));
    expect(result.resolved).toEqual([a, b]);
    expect(result.missing).toEqual([]);
  });

  it("deduplicates overlapping harness and extra skills", () => {
    const a = skill("alpha");
    const result = resolveHarnessSkills(["alpha"], ["alpha"], skillMap(a));
    expect(result.resolved).toEqual([a]);
  });

  it("sorts resolved skills alphabetically", () => {
    const a = skill("alpha");
    const b = skill("beta");
    const c = skill("charlie");
    const result = resolveHarnessSkills(
      ["charlie", "alpha"],
      ["beta"],
      skillMap(a, b, c),
    );
    expect(result.resolved.map((s) => s.name)).toEqual([
      "alpha",
      "beta",
      "charlie",
    ]);
  });

  it("reports missing skills separately", () => {
    const a = skill("alpha");
    const result = resolveHarnessSkills(
      ["alpha", "missing-one"],
      ["missing-two"],
      skillMap(a),
    );
    expect(result.resolved).toEqual([a]);
    expect(result.missing).toEqual(["missing-one", "missing-two"]);
  });

  it("reports missing in sorted order", () => {
    const result = resolveHarnessSkills(["zeta", "alpha"], [], new Map());
    expect(result.missing).toEqual(["alpha", "zeta"]);
  });
});
