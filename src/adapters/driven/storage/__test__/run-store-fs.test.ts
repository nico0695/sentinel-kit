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
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidRunQueryError,
  RunCorruptedError,
  RunNotFoundError,
  type RunRecord,
} from "../../../../core/history/index.js";
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

/* ------------------------------------------------------------------ */
/*  [E5.F2.H2] ST-4: fs-specific planted-state tests + closing gate    */
/* ------------------------------------------------------------------ */

const TS = "20260822T131000123Z";

function writeRawMetadata(finalDir: string, content: string): void {
  mkdirSync(finalDir, { recursive: true });
  writeFileSync(join(finalDir, "metadata.json"), content, "utf-8");
}

const VALID_METADATA_JSON = JSON.stringify({
  version: 1,
  repo: "sentinel-kit",
  startedAt: "2026-08-22T13:10:00.123Z",
  durationMs: 42137,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature/x",
  state: "ok",
});

describe("createRunStoreFsAdapter — list() partial/corrupt classification (AC-4..AC-8)", () => {
  let runsRoot: string;

  afterEach(() => {
    rmSync(runsRoot, { recursive: true, force: true });
  });

  it("includes a .partial-<ts> staging leftover with status partial (AC-4)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const repoDir = join(runsRoot, "sentinel-kit");
    mkdirSync(join(repoDir, `.partial-${TS}`), { recursive: true });
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs).toEqual([
      {
        id: TS,
        repoName: "sentinel-kit",
        startedAtEpochMs: 1787404200123,
        status: "partial",
      },
    ]);
  });

  it("resolves a same-id final+.partial- coexistence to the final entry only (AC-4)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const repoDir = join(runsRoot, "sentinel-kit");
    mkdirSync(join(repoDir, `.partial-${TS}`), { recursive: true });
    writeRawMetadata(join(repoDir, TS), VALID_METADATA_JSON);
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("ok");
  });

  it("treats a final dir with missing metadata.json as corrupt (AC-6)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    mkdirSync(join(runsRoot, "sentinel-kit", TS), { recursive: true });
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs).toEqual([
      {
        id: TS,
        repoName: "sentinel-kit",
        startedAtEpochMs: 1787404200123,
        status: "corrupt",
      },
    ]);
  });

  it("treats a final dir with invalid JSON as corrupt (AC-6)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    writeRawMetadata(join(runsRoot, "sentinel-kit", TS), "{not valid json");
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs[0]?.status).toBe("corrupt");
  });

  it("treats a final dir whose metadata.json is missing a required field as corrupt (AC-6)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const { harness: _dropped, ...withoutHarness } =
      JSON.parse(VALID_METADATA_JSON);
    writeRawMetadata(
      join(runsRoot, "sentinel-kit", TS),
      JSON.stringify(withoutHarness),
    );
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs[0]?.status).toBe("corrupt");
  });

  it("treats a final dir whose metadata.json declares an unknown version as corrupt (AC-6)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const withVersion2 = { ...JSON.parse(VALID_METADATA_JSON), version: 2 };
    writeRawMetadata(
      join(runsRoot, "sentinel-kit", TS),
      JSON.stringify(withVersion2),
    );
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs[0]?.status).toBe("corrupt");
  });

  it("returns ok, partial and corrupt entries together, none affecting the others (AC-7)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const repoDir = join(runsRoot, "sentinel-kit");
    const okTs = "20260822T131000123Z";
    const partialTs = "20260822T131000124Z";
    const corruptTs = "20260822T131000125Z";
    writeRawMetadata(join(repoDir, okTs), VALID_METADATA_JSON);
    mkdirSync(join(repoDir, `.partial-${partialTs}`), { recursive: true });
    mkdirSync(join(repoDir, corruptTs), { recursive: true });
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs).toHaveLength(3);
    const byId = new Map(runs.map((r) => [r.id, r.status]));
    expect(byId.get(okTs)).toBe("ok");
    expect(byId.get(partialTs)).toBe("partial");
    expect(byId.get(corruptTs)).toBe("corrupt");
  });

  it("silently ignores a stray file and a non-ts-named directory — not listed, not an error (AC-12)", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-scan-"));
    const repoDir = join(runsRoot, "sentinel-kit");
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, ".DS_Store"), "junk", "utf-8");
    mkdirSync(join(repoDir, "some-other-dir"), { recursive: true });
    const adapter = createRunStoreFsAdapter(runsRoot);

    const runs = await adapter.list("sentinel-kit");

    expect(runs).toEqual([]);
  });
});

describe("createRunStoreFsAdapter — get() on partial/corrupt (AC-11)", () => {
  let runsRoot: string;

  afterEach(() => {
    rmSync(runsRoot, { recursive: true, force: true });
  });

  it("rejects a partial id with RunCorruptedError", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-get-"));
    mkdirSync(join(runsRoot, "sentinel-kit", `.partial-${TS}`), {
      recursive: true,
    });
    const adapter = createRunStoreFsAdapter(runsRoot);

    await expect(adapter.get("sentinel-kit", TS)).rejects.toBeInstanceOf(
      RunCorruptedError,
    );
  });

  it("rejects a corrupt id (invalid metadata.json) with RunCorruptedError", async () => {
    runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-get-"));
    writeRawMetadata(join(runsRoot, "sentinel-kit", TS), "{not valid json");
    const adapter = createRunStoreFsAdapter(runsRoot);

    await expect(adapter.get("sentinel-kit", TS)).rejects.toBeInstanceOf(
      RunCorruptedError,
    );
  });
});

describe("createRunStoreFsAdapter — query input validation (AC-13)", () => {
  it("rejects a path-traversal repoName/id in list()/get() before any fs access", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-query-"));
    try {
      const adapter = createRunStoreFsAdapter(runsRoot);

      await expect(adapter.list("../etc")).rejects.toBeInstanceOf(
        InvalidRunQueryError,
      );
      await expect(adapter.get("a/b", "x")).rejects.toBeInstanceOf(
        InvalidRunQueryError,
      );
      await expect(adapter.get("repo", "../../x")).rejects.toBeInstanceOf(
        InvalidRunQueryError,
      );
      await expect(adapter.get(".", "x")).rejects.toBeInstanceOf(
        InvalidRunQueryError,
      );

      // No-fs-access proof: the runsRoot itself has no entries at all —
      // validation rejected before any directory was ever touched.
      expect(readdirSync(runsRoot)).toEqual([]);
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });

  it("rejects a well-formed but non-ts-shaped id with RunNotFoundError, not a query error", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-query-"));
    try {
      const adapter = createRunStoreFsAdapter(runsRoot);
      await expect(
        adapter.get("sentinel-kit", "not-a-timestamp"),
      ).rejects.toBeInstanceOf(RunNotFoundError);
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });
});

describe("createRunStoreFsAdapter — raw fs failure translation on read (AC-14)", () => {
  afterEach(() => {
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("list() surfaces a non-ENOENT readdir failure as RunPersistenceError", async () => {
    vi.resetModules();
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-fail-"));
    mkdirSync(join(runsRoot, "sentinel-kit"), { recursive: true });
    const realFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.doMock("node:fs/promises", () => ({
      ...realFs,
      readdir: async (
        ..._args: Parameters<typeof realFs.readdir>
      ): ReturnType<typeof realFs.readdir> => {
        throw Object.assign(new Error("EACCES: simulated"), {
          code: "EACCES",
        });
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

      await expect(adapter.list("sentinel-kit")).rejects.toBeInstanceOf(
        RunPersistenceError,
      );
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });

  it("readdir order never determines list()'s result order — proven with a mocked reversed order (AC-2)", async () => {
    vi.resetModules();
    const runsRoot = mkdtempSync(join(tmpdir(), "sentinel-runstore-order-"));
    const repoDir = join(runsRoot, "sentinel-kit");
    const tsAsc = [
      "20260822T131000000Z",
      "20260822T131000001Z",
      "20260822T131000002Z",
    ];
    for (const ts of tsAsc) {
      writeRawMetadata(
        join(repoDir, ts),
        JSON.stringify({
          ...JSON.parse(VALID_METADATA_JSON),
          startedAt: new Date(1787404200000).toISOString(),
        }),
      );
    }
    const realFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.doMock("node:fs/promises", () => ({
      ...realFs,
      readdir: async (
        ...args: Parameters<typeof realFs.readdir>
      ): ReturnType<typeof realFs.readdir> => {
        const result = await realFs.readdir(...args);
        // Force descending order — the opposite of tsAsc — to prove list()
        // does not depend on readdir's own order (design's AC-2 hint).
        return [...result].sort().reverse() as Awaited<
          ReturnType<typeof realFs.readdir>
        >;
      },
    }));

    try {
      const { createRunStoreFsAdapter: createAdapterMocked } = await import(
        "../run-store-fs.js"
      );
      const adapter = createAdapterMocked(runsRoot);

      const runs = await adapter.list("sentinel-kit");

      expect(runs.map((r) => r.id)).toEqual(tsAsc);
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });
});
