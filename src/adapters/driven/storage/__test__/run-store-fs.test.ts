/**
 * `createRunStoreFsAdapter` test: drives the shared `RunStore` contract
 * suite through a harness over a temp `runsRoot`. Each test gets a fresh
 * temp directory; cleanup removes it in `afterEach`. The adapter is
 * imported through the storage barrel (`../index.js`), proving it is
 * reachable via its public API — same shape as `config-store-yaml.test.ts`.
 *
 * fs-specific tests (atomicity, determinism, on-disk layout, redaction) are
 * appended below the contract-suite driver by ST-4, per plan.md.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStoreFsAdapter } from "../index.js";
import {
  type RunStoreContractHarness,
  type RunStoreFixture,
  runStoreContract,
} from "./RunStore.contract.js";

const harness: RunStoreContractHarness = {
  build(runsRoot: string) {
    return createRunStoreFsAdapter(runsRoot);
  },
  async setupFixture(): Promise<RunStoreFixture> {
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-test-"));
    return { runsRoot };
  },
  async teardownFixture(fixture: RunStoreFixture): Promise<void> {
    rmSync(fixture.runsRoot, { recursive: true, force: true });
  },
};

runStoreContract(harness, "run-store-fs");
