import type { RunStore, RunSummary } from "./ports/run-store.js";
import { toRunStorageKey } from "./run-storage-key.js";

export interface ListRunsRequest {
  /** User-facing repo alias (`owner/repo`); normalised to a storage key (D7). */
  readonly repoName: string;
}

export interface ListRunsDeps {
  readonly store: RunStore;
}

export interface ListRunsResult {
  readonly runs: readonly RunSummary[];
}

export async function listRuns(
  request: ListRunsRequest,
  deps: ListRunsDeps,
): Promise<ListRunsResult> {
  const runs = await deps.store.list(toRunStorageKey(request.repoName));
  return { runs };
}
