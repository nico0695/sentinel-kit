import { describe, expect, it } from "vitest";
import {
  type GetRunDeps,
  getRun,
  type RunRecord,
  type RunStore,
  type RunSummary,
} from "../index.js";

function createFakeRunStore(
  onGet?: (repoName: string, id: string) => Promise<RunRecord>,
): RunStore {
  return {
    save(_record: RunRecord): Promise<string> {
      throw new Error("not used by getRun");
    },
    list(_repoName: string): Promise<readonly RunSummary[]> {
      throw new Error("not used by getRun");
    },
    get(repoName: string, id: string): Promise<RunRecord> {
      return (onGet ?? (() => Promise.reject(new Error("unset"))))(
        repoName,
        id,
      );
    },
  };
}

const RECORD: RunRecord = {
  repoName: "sentinel-kit",
  startedAtEpochMs: 1787404200123,
  durationMs: 42137,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature/x",
  state: "ok",
};

describe("getRun", () => {
  it("passes repoName and id through to store.get and returns its result unchanged", async () => {
    let received: { repoName: string; id: string } | undefined;
    const store = createFakeRunStore((repoName, id) => {
      received = { repoName, id };
      return Promise.resolve(RECORD);
    });
    const deps: GetRunDeps = { store };

    const result = await getRun(
      { repoName: "sentinel-kit", id: "20260822T131000123Z" },
      deps,
    );

    expect(received).toEqual({
      repoName: "sentinel-kit",
      id: "20260822T131000123Z",
    });
    expect(result).toBe(RECORD);
  });

  it("propagates a rejection from store.get unchanged", async () => {
    const failure = new Error("boom");
    const store = createFakeRunStore(() => Promise.reject(failure));
    const deps: GetRunDeps = { store };

    await expect(getRun({ repoName: "x", id: "y" }, deps)).rejects.toBe(
      failure,
    );
  });
});

describe("getRun storage-key normalisation (D7)", () => {
  it("normalises an `owner/repo` alias before calling store.get", async () => {
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName, _id) => {
      receivedRepoName = repoName;
      return Promise.resolve(RECORD);
    });

    await getRun(
      { repoName: "owner/repo", id: "20260822T131000123Z" },
      { store },
    );

    expect(receivedRepoName).toBe("owner__repo");
  });

  it("passes an alias with no separator through unchanged", async () => {
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName, _id) => {
      receivedRepoName = repoName;
      return Promise.resolve(RECORD);
    });

    await getRun(
      { repoName: "sentinel-kit", id: "20260822T131000123Z" },
      { store },
    );

    expect(receivedRepoName).toBe("sentinel-kit");
  });

  it("leaves the run id untouched", async () => {
    let receivedId: string | undefined;
    const store = createFakeRunStore((_repoName, id) => {
      receivedId = id;
      return Promise.resolve(RECORD);
    });

    await getRun(
      { repoName: "owner/repo", id: "20260822T131000123Z" },
      { store },
    );

    expect(receivedId).toBe("20260822T131000123Z");
  });
});
