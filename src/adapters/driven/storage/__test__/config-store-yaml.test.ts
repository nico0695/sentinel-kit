/**
 * config-store-yaml adapter test: drives the shared `ConfigStore`
 * contract suite through a harness over `createConfigStoreAdapter`.
 *
 * Each test gets a fresh temp directory; cleanup removes it in
 * `afterEach`. The adapter is imported through the storage barrel
 * (`../index.js`), proving it is reachable via its public API.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigStoreAdapter } from "../index.js";
import {
  type ConfigFixture,
  type ConfigStoreContractHarness,
  configStoreContract,
} from "./ConfigStore.contract.js";

const harness: ConfigStoreContractHarness = {
  build(basePath: string) {
    return createConfigStoreAdapter(basePath);
  },
  async setupFixture(): Promise<ConfigFixture> {
    const basePath = mkdtempSync(join(tmpdir(), "sentinel-config-test-"));
    return { basePath };
  },
  async teardownFixture(fixture: ConfigFixture): Promise<void> {
    rmSync(fixture.basePath, { recursive: true, force: true });
  },
};

configStoreContract(harness, "config-store-yaml");
