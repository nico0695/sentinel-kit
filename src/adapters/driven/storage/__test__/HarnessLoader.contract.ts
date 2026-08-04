import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HarnessError,
  HarnessValidationError,
  SkillNotFoundError,
} from "../../../../core/review/ports/harness-errors.js";
import type { HarnessLoader } from "../../../../core/review/ports/harness-loader.js";

export interface HarnessFixture {
  readonly basePath: string;
}

export interface HarnessLoaderContractHarness {
  readonly build: (basePath: string) => HarnessLoader;
  readonly setupFixture: () => Promise<HarnessFixture>;
  readonly teardownFixture: (fixture: HarnessFixture) => Promise<void>;
  readonly writeHarnessFile: (
    fixture: HarnessFixture,
    type: string,
    filename: string,
    content: string,
  ) => Promise<void>;
  readonly writeSkillFile: (
    fixture: HarnessFixture,
    name: string,
    content: string,
  ) => Promise<void>;
}

export function harnessLoaderContract(
  harness: HarnessLoaderContractHarness,
  label?: string,
): void {
  describe(`HarnessLoader contract${label ? `: ${label}` : ""}`, () => {
    let loader: HarnessLoader;
    let fixture: HarnessFixture;

    beforeEach(async () => {
      fixture = await harness.setupFixture();
      loader = harness.build(fixture.basePath);
    });

    afterEach(async () => {
      await harness.teardownFixture(fixture);
    });

    it("missing base directory returns empty harness list", async () => {
      const missing = harness.build("/nonexistent/path/xyz");
      const types = await missing.listHarnesses();
      expect(types).toEqual([]);
    });

    it("missing base directory returns empty skill list", async () => {
      const missing = harness.build("/nonexistent/path/xyz");
      const skills = await missing.listSkills();
      expect(skills).toEqual([]);
    });

    it("empty base directory returns empty harness list", async () => {
      const types = await loader.listHarnesses();
      expect(types).toEqual([]);
    });

    it("lists harness types from subdirectories", async () => {
      await harness.writeHarnessFile(
        fixture,
        "security",
        "harness.md",
        "# Security Review",
      );
      await harness.writeHarnessFile(
        fixture,
        "perf",
        "harness.md",
        "# Perf Review",
      );
      const types = await loader.listHarnesses();
      expect(types.sort()).toEqual(["perf", "security"]);
    });

    it("loads valid harness with all files", async () => {
      await harness.writeHarnessFile(
        fixture,
        "security",
        "harness.md",
        "# Security Instructions",
      );
      await harness.writeHarnessFile(
        fixture,
        "security",
        "output.md",
        "# Output Contract",
      );
      await harness.writeHarnessFile(
        fixture,
        "security",
        "skills.yaml",
        "skills:\n  - analyze\n  - report",
      );
      const h = await loader.loadHarness("security");
      expect(h.type).toBe("security");
      expect(h.instructions).toBe("# Security Instructions");
      expect(h.outputContract).toBe("# Output Contract");
      expect(h.skills).toEqual(["analyze", "report"]);
      expect(h.contextMode).toBe("inline");
    });

    it("loads minimal harness (harness.md only)", async () => {
      await harness.writeHarnessFile(
        fixture,
        "minimal",
        "harness.md",
        "# Minimal",
      );
      const h = await loader.loadHarness("minimal");
      expect(h.type).toBe("minimal");
      expect(h.instructions).toBe("# Minimal");
      expect(h.outputContract).toBeUndefined();
      expect(h.skills).toEqual([]);
      expect(h.contextMode).toBe("inline");
    });

    it("loads harness with contextMode from skills.yaml", async () => {
      await harness.writeHarnessFile(
        fixture,
        "agent-mode",
        "harness.md",
        "# Agent Mode",
      );
      await harness.writeHarnessFile(
        fixture,
        "agent-mode",
        "skills.yaml",
        "skills: []\ncontextMode: agent",
      );
      const h = await loader.loadHarness("agent-mode");
      expect(h.contextMode).toBe("agent");
    });

    it("defaults contextMode to inline when skills.yaml omits it", async () => {
      await harness.writeHarnessFile(
        fixture,
        "no-mode",
        "harness.md",
        "# No Mode",
      );
      await harness.writeHarnessFile(
        fixture,
        "no-mode",
        "skills.yaml",
        "skills: []",
      );
      const h = await loader.loadHarness("no-mode");
      expect(h.contextMode).toBe("inline");
    });

    it("missing harness.md throws HarnessValidationError", async () => {
      await expect(loader.loadHarness("ghost")).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(HarnessValidationError);
          expect(err).toBeInstanceOf(HarnessError);
          const ve = err as HarnessValidationError;
          expect(ve.fields.length).toBeGreaterThan(0);
          return true;
        },
      );
    });

    it("invalid skills.yaml YAML syntax throws HarnessValidationError", async () => {
      await harness.writeHarnessFile(
        fixture,
        "bad-yaml",
        "harness.md",
        "# Bad",
      );
      await harness.writeHarnessFile(
        fixture,
        "bad-yaml",
        "skills.yaml",
        "{{{{invalid: [}}}}",
      );
      await expect(loader.loadHarness("bad-yaml")).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(HarnessValidationError);
          expect(err).toBeInstanceOf(HarnessError);
          const ve = err as HarnessValidationError;
          expect(ve.fields.length).toBeGreaterThan(0);
          expect(ve.cause).toBeDefined();
          return true;
        },
      );
    });

    it("invalid skills.yaml schema throws HarnessValidationError with fields", async () => {
      await harness.writeHarnessFile(
        fixture,
        "bad-schema",
        "harness.md",
        "# Bad",
      );
      await harness.writeHarnessFile(
        fixture,
        "bad-schema",
        "skills.yaml",
        "skills: not-an-array",
      );
      await expect(loader.loadHarness("bad-schema")).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(HarnessValidationError);
          const ve = err as HarnessValidationError;
          expect(ve.fields.length).toBeGreaterThan(0);
          return true;
        },
      );
    });

    it("lists skill files from skills directory", async () => {
      await harness.writeSkillFile(fixture, "analyze", "# Analyze");
      await harness.writeSkillFile(fixture, "report", "# Report");
      const skills = await loader.listSkills();
      expect(skills.sort()).toEqual(["analyze", "report"]);
    });

    it("loads skill content by name", async () => {
      await harness.writeSkillFile(fixture, "analyze", "# Analyze Skill");
      const skill = await loader.loadSkill("analyze");
      expect(skill.name).toBe("analyze");
      expect(skill.content).toBe("# Analyze Skill");
    });

    it("loading nonexistent skill throws SkillNotFoundError", async () => {
      await expect(loader.loadSkill("nonexistent")).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(SkillNotFoundError);
          expect(err).toBeInstanceOf(HarnessError);
          return true;
        },
      );
    });
  });
}
