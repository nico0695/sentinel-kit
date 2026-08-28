import { describe, expect, it } from "vitest";
import {
  type ListRunsDeps,
  listRuns,
  type RunRecord,
  type RunStore,
  type RunSummary,
} from "../index.js";

function createFakeRunStore(
  onList?: (repoName: string) => Promise<readonly RunSummary[]>,
): RunStore {
  return {
    save(_record: RunRecord): Promise<string> {
      throw new Error("not used by listRuns");
    },
    list(repoName: string): Promise<readonly RunSummary[]> {
      return (onList ?? (() => Promise.resolve([])))(repoName);
    },
    get(_repoName: string, _id: string): Promise<RunRecord> {
      throw new Error("not used by listRuns");
    },
  };
}

describe("listRuns", () => {
  it("passes repoName through to store.list and returns its result unchanged", async () => {
    const summaries: readonly RunSummary[] = [
      {
        id: "20260822T131000123Z",
        repoName: "sentinel-kit",
        startedAtEpochMs: 1787404200123,
        status: "ok",
      },
    ];
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName) => {
      receivedRepoName = repoName;
      return Promise.resolve(summaries);
    });
    const deps: ListRunsDeps = { store };

    const result = await listRuns({ repoName: "sentinel-kit" }, deps);

    expect(receivedRepoName).toBe("sentinel-kit");
    expect(result.runs).toBe(summaries);
  });

  it("returns an empty list unchanged", async () => {
    const store = createFakeRunStore(() => Promise.resolve([]));
    const deps: ListRunsDeps = { store };

    const result = await listRuns({ repoName: "never-saved" }, deps);

    expect(result.runs).toEqual([]);
  });

  it("propagates a rejection from store.list unchanged", async () => {
    const failure = new Error("boom");
    const store = createFakeRunStore(() => Promise.reject(failure));
    const deps: ListRunsDeps = { store };

    await expect(listRuns({ repoName: "x" }, deps)).rejects.toBe(failure);
  });
});

describe("listRuns storage-key normalisation (D7)", () => {
  it("normalises an `owner/repo` alias before calling store.list", async () => {
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName) => {
      receivedRepoName = repoName;
      return Promise.resolve([]);
    });

    await listRuns({ repoName: "owner/repo" }, { store });

    expect(receivedRepoName).toBe("owner__repo");
  });

  it("passes an alias with no separator through unchanged", async () => {
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName) => {
      receivedRepoName = repoName;
      return Promise.resolve([]);
    });

    await listRuns({ repoName: "sentinel-kit" }, { store });

    expect(receivedRepoName).toBe("sentinel-kit");
  });

  it("is idempotent — an already normalised key is not normalised twice", async () => {
    let receivedRepoName: string | undefined;
    const store = createFakeRunStore((repoName) => {
      receivedRepoName = repoName;
      return Promise.resolve([]);
    });

    await listRuns({ repoName: "owner__repo" }, { store });

    expect(receivedRepoName).toBe("owner__repo");
  });
});
