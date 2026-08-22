/**
 * `createRunStoreFsAdapter` test: drives the shared `RunStore` contract
 * suite through a harness over a temp `runsRoot`, then adds fs-specific
 * assertions the portable contract suite deliberately doesn't make
 * (`risk-004`): on-disk file set and omissions (AC-4..AC-8), byte-for-byte
 * content, zero-padded validation logs, atomicity via mid-staging failure
 * injection (AC-11), clockless determinism (AC-14), the
 * pre-existing-directory-unmodified half of AC-13, and the decoy-token
 * redaction test observed ON DISK rather than only in the serialized
 * string (AC-18). This is the story's closing gate.
 *
 * AC-17 (no `process.env` reads) has no test here, by design.md's own
 * explicit deferral: an absence across the whole adapter+core surface
 * isn't observable through the port. Verified by inspection instead —
 * `grep -rn "process\.env" src/core/history src/adapters/driven/storage`
 * — result recorded in `execution-log.md`'s ST-4 entry.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRecord } from "../../../../core/history/index.js";
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

/* ------------------------------------------------------------------ */
/*  ST-4: fs-specific tests                                            */
/* ------------------------------------------------------------------ */

function baseRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    repoName: "sentinel-kit",
    startedAtEpochMs: 1787404200123,
    durationMs: 42137,
    harness: "pr-review",
    baseRef: "main",
    targetRef: "feature/x",
    state: "ok",
    ...overrides,
  };
}

describe("createRunStoreFsAdapter — on-disk layout (AC-4..AC-8)", () => {
  let runsRoot: string;

  afterEach(() => {
    rmSync(runsRoot, { recursive: true, force: true });
  });

  it("writes metadata.json, omits result.md/prompt.md/validations when their data is absent", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-layout-"));
    const adapter = createRunStoreFsAdapter(runsRoot);
    const runDir = await adapter.save(baseRecord());

    expect(existsSync(join(runDir, "metadata.json"))).toBe(true);
    expect(existsSync(join(runDir, "result.md"))).toBe(false);
    expect(existsSync(join(runDir, "prompt.md"))).toBe(false);
    expect(existsSync(join(runDir, "validations"))).toBe(false);
  });

  it("writes result.md and prompt.md byte-for-byte when supplied (AC-5, AC-6)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-layout-"));
    const adapter = createRunStoreFsAdapter(runsRoot);
    const engineOutput = "VERDICT: approve\n\nLooks good.\n";
    const prompt = "# Review this diff\n\n<diff content>\n";
    const runDir = await adapter.save(baseRecord({ engineOutput, prompt }));

    expect(readFileSync(join(runDir, "result.md"), "utf-8")).toBe(engineOutput);
    expect(readFileSync(join(runDir, "prompt.md"), "utf-8")).toBe(prompt);
  });

  it("writes each validation entry to a zero-padded validations/NNN.log, in order (AC-7)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-layout-"));
    const adapter = createRunStoreFsAdapter(runsRoot);
    const runDir = await adapter.save(
      baseRecord({ validationOutput: ["lint: clean", "typecheck: clean"] }),
    );

    const validationsDir = join(runDir, "validations");
    expect(readdirSync(validationsDir).sort()).toEqual(["001.log", "002.log"]);
    expect(readFileSync(join(validationsDir, "001.log"), "utf-8")).toBe(
      "lint: clean",
    );
    expect(readFileSync(join(validationsDir, "002.log"), "utf-8")).toBe(
      "typecheck: clean",
    );
  });

  it("plants a decoy token and asserts it lands only in the files whose contract is to carry it — never in metadata.json (AC-18, on disk)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-layout-"));
    const adapter = createRunStoreFsAdapter(runsRoot);
    const decoy = "DECOY-SECRET-TOKEN-DO-NOT-PERSIST";
    const runDir = await adapter.save(
      baseRecord({
        prompt: `prompt with ${decoy}`,
        engineOutput: `output with ${decoy}`,
        validationOutput: [`validation with ${decoy}`],
      }),
    );

    expect(readFileSync(join(runDir, "prompt.md"), "utf-8")).toContain(decoy);
    expect(readFileSync(join(runDir, "result.md"), "utf-8")).toContain(decoy);
    expect(
      readFileSync(join(runDir, "validations", "001.log"), "utf-8"),
    ).toContain(decoy);
    expect(readFileSync(join(runDir, "metadata.json"), "utf-8")).not.toContain(
      decoy,
    );
  });

  it("only the .partial- prefix distinguishes a staged run from a final one — no other marker file exists (D3/D7 rationale)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-layout-"));
    const adapter = createRunStoreFsAdapter(runsRoot);
    const runDir = await adapter.save(baseRecord());
    const repoDir = join(runsRoot, "sentinel-kit");
    const entries = readdirSync(repoDir);
    expect(entries).toEqual([runDir.slice(repoDir.length + 1)]);
    expect(entries.every((e) => !e.startsWith("."))).toBe(true);
  });
});

describe("createRunStoreFsAdapter — determinism (AC-14)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is clockless: two saves of the SAME record at far-apart system times still map to the identical path", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-clock-"));
    try {
      const adapter = createRunStoreFsAdapter(runsRoot);
      const record = baseRecord();

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
      const firstPath = await adapter.save(record);
      rmSync(firstPath, { recursive: true, force: true });

      vi.setSystemTime(new Date("2099-12-31T23:59:59.999Z"));
      const secondPath = await adapter.save(record);

      expect(secondPath).toBe(firstPath);
    } finally {
      vi.useRealTimers();
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });

  it("clears a same-timestamp .partial- staging remnant left by an earlier failed attempt at the SAME run, and succeeds", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-clock-"));
    try {
      const adapter = createRunStoreFsAdapter(runsRoot);
      const record = baseRecord();

      // Simulate a crash mid-staging: pre-create the staging dir by hand
      // with a leftover file that would NOT belong in a real run.
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const stagingDir = join(
        runsRoot,
        "sentinel-kit",
        ".partial-20260822T131000123Z",
      );
      mkdirSync(stagingDir, { recursive: true });
      writeFileSync(join(stagingDir, "leftover.txt"), "crash remnant");

      const runDir = await adapter.save(record);
      expect(existsSync(join(runDir, "leftover.txt"))).toBe(false);
      expect(existsSync(join(runDir, "metadata.json"))).toBe(true);
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });
});

describe("createRunStoreFsAdapter — atomicity (AC-11, AC-12) and RunPersistenceError (AC-20)", () => {
  it("leaves no directory at the final path when a fs failure happens mid-staging, and rejects with RunPersistenceError", async () => {
    vi.resetModules();
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-atomic-"));
    const realFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    let writeFileCalls = 0;
    vi.doMock("node:fs/promises", () => ({
      ...realFs,
      writeFile: async (
        ...args: Parameters<typeof realFs.writeFile>
      ): ReturnType<typeof realFs.writeFile> => {
        writeFileCalls += 1;
        // Let metadata.json (the first write) succeed, then fail — proves
        // the failure is caught mid-staging, not on the very first write.
        if (writeFileCalls === 2) {
          throw new Error("ENOSPC: simulated full disk");
        }
        return realFs.writeFile(...args);
      },
    }));

    try {
      const { createRunStoreFsAdapter: createAdapterMocked } = await import(
        "../run-store-fs.js"
      );
      const { RunPersistenceError } = await import(
        "../../../../core/history/index.js"
      );
      const adapter = createAdapterMocked(runsRoot);
      const ts = "20260822T131000123Z";

      await expect(
        adapter.save(baseRecord({ prompt: "will not finish writing" })),
      ).rejects.toBeInstanceOf(RunPersistenceError);

      const finalDir = join(runsRoot, "sentinel-kit", ts);
      const stagingDir = join(runsRoot, "sentinel-kit", `.partial-${ts}`);
      expect(existsSync(finalDir)).toBe(false);
      // Best-effort cleanup: the staging remnant is removed too, though
      // its presence would still be a correct "identifiable partial" per
      // spec.md — only finalDir's absence is the load-bearing assertion.
      expect(existsSync(stagingDir)).toBe(false);
      expect(writeFileCalls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });
});
