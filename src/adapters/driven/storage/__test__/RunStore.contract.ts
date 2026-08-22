/**
 * Shared, adapter-agnostic `RunStore` contract suite.
 *
 * Parameterized over a harness so every `RunStore` implementation reuses it
 * verbatim. Imports ONLY vitest + core port types and error classes — never
 * any concrete adapter. Covers only what's observable through `save`: a
 * write-only port (D6) means the on-disk assertions live in the fs-adapter
 * test instead — this suite is deliberately thin (`risk-004`), not
 * incomplete, and `[E5.F2.H2]` is where it thickens once a read method
 * exists.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidRunRecordError,
  RunAlreadyExistsError,
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
  });
}
