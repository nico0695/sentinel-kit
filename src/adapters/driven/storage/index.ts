/**
 * Driven adapter: storage — config, harnesses, skills and runs (fs + yaml),
 * implementing ConfigStore, HarnessLoader and RunStore (PRD §4.2).
 */
export { createConfigStoreAdapter } from "./config-store-yaml.js";
export { createHarnessLoaderAdapter } from "./harness-loader-fs.js";
export { createRunStoreFsAdapter } from "./run-store-fs.js";
