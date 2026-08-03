import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { ZodError } from "zod";
import {
  HarnessNotFoundError,
  HarnessValidationError,
} from "../../../core/review/ports/harness-errors.js";
import type { HarnessLoader } from "../../../core/review/ports/harness-loader.js";
import {
  type Harness,
  HarnessSkillsSchema,
  type Skill,
} from "../../../core/review/ports/harness-schemas.js";

const HARNESSES_DIR = "harnesses";
const SKILLS_DIR = "skills";
const HARNESS_FILE = "harness.md";
const OUTPUT_FILE = "output.md";
const SKILLS_FILE = "skills.yaml";

function zodToFields(
  err: ZodError,
): ReadonlyArray<{ readonly path: string; readonly message: string }> {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

export function createHarnessLoaderAdapter(basePath: string): HarnessLoader {
  const harnessesPath = join(basePath, HARNESSES_DIR);
  const skillsPath = join(basePath, SKILLS_DIR);

  return {
    async listHarnesses(): Promise<string[]> {
      try {
        const entries = await readdir(harnessesPath, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return [];
        }
        throw err;
      }
    },

    async loadHarness(type: string): Promise<Harness> {
      const dir = join(harnessesPath, type);
      const harnessFile = join(dir, HARNESS_FILE);

      let instructions: string;
      try {
        instructions = await readFile(harnessFile, "utf-8");
      } catch (err: unknown) {
        if (isEnoent(err)) {
          throw new HarnessValidationError(
            `Missing required harness.md in harness "${type}"`,
            [{ path: "harness.md", message: "File is required but not found" }],
          );
        }
        throw err;
      }

      let outputContract: string | undefined;
      try {
        outputContract = await readFile(join(dir, OUTPUT_FILE), "utf-8");
      } catch (err: unknown) {
        if (!isEnoent(err)) {
          throw err;
        }
      }

      let skills: readonly string[] = [];
      try {
        const raw = await readFile(join(dir, SKILLS_FILE), "utf-8");
        let parsed: unknown;
        try {
          parsed = parse(raw);
        } catch (yamlErr: unknown) {
          throw new HarnessValidationError(
            `Invalid ${SKILLS_FILE} in harness "${type}"`,
            [{ path: SKILLS_FILE, message: "Invalid YAML syntax" }],
            { cause: yamlErr },
          );
        }
        const result = HarnessSkillsSchema.safeParse(parsed);
        if (!result.success) {
          throw new HarnessValidationError(
            `Invalid ${SKILLS_FILE} in harness "${type}"`,
            zodToFields(result.error),
            { cause: result.error },
          );
        }
        skills = result.data.skills;
      } catch (err: unknown) {
        if (err instanceof HarnessValidationError) {
          throw err;
        }
        if (!isEnoent(err)) {
          throw err;
        }
      }

      const harness: Harness = { type, instructions, skills };
      if (outputContract !== undefined) {
        return { ...harness, outputContract };
      }
      return harness;
    },

    async listSkills(): Promise<string[]> {
      try {
        const entries = await readdir(skillsPath);
        return entries
          .filter((e) => e.endsWith(".md"))
          .map((e) => e.replace(/\.md$/, ""));
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return [];
        }
        throw err;
      }
    },

    async loadSkill(name: string): Promise<Skill> {
      const filePath = join(skillsPath, `${name}.md`);
      try {
        const content = await readFile(filePath, "utf-8");
        return { name, content };
      } catch (err: unknown) {
        if (isEnoent(err)) {
          throw new HarnessNotFoundError(name);
        }
        throw err;
      }
    },
  };
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
