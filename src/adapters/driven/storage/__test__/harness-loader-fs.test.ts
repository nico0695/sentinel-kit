import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarnessLoaderAdapter } from "../harness-loader-fs.js";
import {
  type HarnessFixture,
  type HarnessLoaderContractHarness,
  harnessLoaderContract,
} from "./HarnessLoader.contract.js";

const harness: HarnessLoaderContractHarness = {
  build(basePath: string) {
    return createHarnessLoaderAdapter(basePath);
  },
  async setupFixture(): Promise<HarnessFixture> {
    const basePath = mkdtempSync(join(tmpdir(), "sentinel-harness-test-"));
    return { basePath };
  },
  async teardownFixture(fixture: HarnessFixture): Promise<void> {
    rmSync(fixture.basePath, { recursive: true, force: true });
  },
  async writeHarnessFile(
    fixture: HarnessFixture,
    type: string,
    filename: string,
    content: string,
  ): Promise<void> {
    const dir = join(fixture.basePath, "harnesses", type);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, "utf-8");
  },
  async writeSkillFile(
    fixture: HarnessFixture,
    name: string,
    content: string,
  ): Promise<void> {
    const dir = join(fixture.basePath, "skills");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), content, "utf-8");
  },
};

harnessLoaderContract(harness, "harness-loader-fs");
