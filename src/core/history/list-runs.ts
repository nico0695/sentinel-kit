import type { RunStore, RunSummary } from "./ports/run-store.js";

export interface ListRunsRequest {
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
  const runs = await deps.store.list(request.repoName);
  return { runs };
}
