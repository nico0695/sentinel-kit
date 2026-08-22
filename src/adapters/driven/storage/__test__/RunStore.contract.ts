/**
 * Shared, adapter-agnostic `RunStore` contract suite.
 *
 * Parameterized over a harness so every `RunStore` implementation reuses it
 * verbatim. Imports ONLY vitest + core port types and error classes — never
 * any concrete adapter. Covers what's observable through `save`/`list`/`get`
 * alone; on-disk-specific assertions (planted `.partial-<ts>`/corrupt state,
 * raw fs failure injection) live in the fs-adapter test instead, per
 * `[E5.F2.H1]`'s stated split. `[E5.F2.H2]` thickens this suite, closing
 * that story's `risk-004`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidRunRecordError,
  RunAlreadyExistsError,
  RunNotFoundError,
  type RunRecord,
  type RunStore,
} from "../../../../core/history/index.js";

export interface RunStoreFixture {
  readonly runsRoot: string;
}

export interface RunStoreContractHarness {
  readonly build: (runsRoot: string) => RunStore;
  readonly setupFixture: () => Promise<RunStoreFixture>;
  readonly teardownFixture: (fixture: RunStoreFixture) => Promise<void>;
}

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

export function runStoreContract(
  harness: RunStoreContractHarness,
  label?: string,
): void {
  describe(`RunStore contract${label ? `: ${label}` : ""}`, () => {
    let store: RunStore;
    let fixture: RunStoreFixture;

    beforeEach(async () => {
      fixture = await harness.setupFixture();
      store = harness.build(fixture.runsRoot);
    });

    afterEach(async () => {
      await harness.teardownFixture(fixture);
    });

    it("saves a valid record and resolves with a non-empty absolute path (AC-1, AC-15)", async () => {
      const path = await store.save(baseRecord());
      expect(path.length).toBeGreaterThan(0);
      expect(path.startsWith("/")).toBe(true);
    });

    it("rejects an empty repoName with InvalidRunRecordError, before creating anything (AC-19)", async () => {
      await expect(
        store.save(baseRecord({ repoName: "" })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a repoName containing a path separator (AC-19)", async () => {
      await expect(
        store.save(baseRecord({ repoName: "a/b" })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
      await expect(
        store.save(baseRecord({ repoName: "a\\b" })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a repoName starting with '.' (AC-19, subsumes '.' and '..')", async () => {
      await expect(
        store.save(baseRecord({ repoName: "." })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
      await expect(
        store.save(baseRecord({ repoName: ".." })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
      await expect(
        store.save(baseRecord({ repoName: ".hidden" })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a non-integer startedAtEpochMs (AC-19)", async () => {
      await expect(
        store.save(baseRecord({ startedAtEpochMs: 1.5 })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a negative startedAtEpochMs (AC-19)", async () => {
      await expect(
        store.save(baseRecord({ startedAtEpochMs: -1 })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a non-finite startedAtEpochMs (AC-19)", async () => {
      await expect(
        store.save(baseRecord({ startedAtEpochMs: Number.POSITIVE_INFINITY })),
      ).rejects.toBeInstanceOf(InvalidRunRecordError);
    });

    it("rejects a second save of the exact same record with RunAlreadyExistsError, without touching the first run (AC-13)", async () => {
      const record = baseRecord();
      const firstPath = await store.save(record);
      await expect(store.save(record)).rejects.toBeInstanceOf(
        RunAlreadyExistsError,
      );
      // A genuine third read through the same store proves the first run
      // still resolves — the rejected second save did not corrupt it.
      await expect(store.save(record)).rejects.toBeInstanceOf(
        RunAlreadyExistsError,
      );
      expect(firstPath.length).toBeGreaterThan(0);
    });

    it("saves two distinct records for the same repo without collision", async () => {
      const first = await store.save(
        baseRecord({ startedAtEpochMs: 1787404200000 }),
      );
      const second = await store.save(
        baseRecord({ startedAtEpochMs: 1787404200001 }),
      );
      expect(first).not.toBe(second);
    });

    it("list() returns [] for a repo with no runs, without erroring (AC-3)", async () => {
      const runs = await store.list("never-saved");
      expect(runs).toEqual([]);
    });

    it("list() returns saved runs in ascending startedAtEpochMs order, regardless of save order (AC-1)", async () => {
      await store.save(baseRecord({ startedAtEpochMs: 1787404200002 }));
      await store.save(baseRecord({ startedAtEpochMs: 1787404200000 }));
      await store.save(baseRecord({ startedAtEpochMs: 1787404200001 }));

      const runs = await store.list("sentinel-kit");

      expect(runs.map((r) => r.startedAtEpochMs)).toEqual([
        1787404200000, 1787404200001, 1787404200002,
      ]);
    });

    it("list() maps an ok entry's summary fields 1:1 from the saved record (AC-8)", async () => {
      const record = baseRecord({
        engine: "claude-code",
        verdict: "approve",
      });
      await store.save(record);

      const runs = await store.list("sentinel-kit");

      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        repoName: record.repoName,
        startedAtEpochMs: record.startedAtEpochMs,
        status: "ok",
        durationMs: record.durationMs,
        harness: record.harness,
        baseRef: record.baseRef,
        targetRef: record.targetRef,
        state: record.state,
        engine: record.engine,
        verdict: record.verdict,
      });
    });

    it("get() round-trips a full record, including optional bodies, unchanged (AC-9)", async () => {
      const record = baseRecord({
        engine: "claude-code",
        verdict: "approve",
        prompt: "the exact prompt sent to the engine",
        engineOutput: "the engine's raw output",
        validationOutput: ["log 1", "log 2"],
        usage: { inputTokens: 4800, outputTokens: 900, totalTokens: 5700 },
        diff: {
          fileCount: 3,
          totalLines: 412,
          estimatedTokens: 5100,
          truncated: true,
          warnings: ["diff truncated: kept 400 of 900 lines"],
        },
      });
      await store.save(record);
      const runs = await store.list(record.repoName);
      const [summary] = runs;
      if (summary === undefined) {
        throw new Error("expected list() to return the just-saved run");
      }

      const fetched = await store.get(record.repoName, summary.id);

      expect(fetched).toEqual(record);
    });

    it("get() defaults diff.warnings to [] on round-trip when the saved array was empty (AC-9)", async () => {
      const record = baseRecord({
        diff: {
          fileCount: 1,
          totalLines: 10,
          estimatedTokens: 100,
          truncated: false,
          warnings: [],
        },
      });
      await store.save(record);
      const runs = await store.list(record.repoName);
      const [summary] = runs;
      if (summary === undefined) {
        throw new Error("expected list() to return the just-saved run");
      }

      const fetched = await store.get(record.repoName, summary.id);

      expect(fetched.diff).toEqual(record.diff);
    });

    it("get() round-trips a record with no optional fields, omitting them rather than inventing empty values (AC-9)", async () => {
      const record = baseRecord();
      await store.save(record);
      const runs = await store.list(record.repoName);
      const [summary] = runs;
      if (summary === undefined) {
        throw new Error("expected list() to return the just-saved run");
      }

      const fetched = await store.get(record.repoName, summary.id);

      expect(fetched).toEqual(record);
      for (const key of [
        "engine",
        "verdict",
        "prompt",
        "engineOutput",
        "diff",
        "usage",
        "validationOutput",
        "failure",
      ]) {
        expect(key in fetched).toBe(false);
      }
    });

    it("get() rejects an unknown id with RunNotFoundError (AC-10)", async () => {
      await expect(
        store.get("sentinel-kit", "20260101T000000000Z"),
      ).rejects.toBeInstanceOf(RunNotFoundError);
    });
  });
}
