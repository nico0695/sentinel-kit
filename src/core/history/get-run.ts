import type { RunRecord, RunStore } from "./ports/run-store.js";
import { toRunStorageKey } from "./run-storage-key.js";

export interface GetRunRequest {
  /** User-facing repo alias (`owner/repo`); normalised to a storage key (D7). */
  readonly repoName: string;
  readonly id: string;
}

export interface GetRunDeps {
  readonly store: RunStore;
}

export type GetRunResult = RunRecord;

export async function getRun(
  request: GetRunRequest,
  deps: GetRunDeps,
): Promise<GetRunResult> {
  return deps.store.get(toRunStorageKey(request.repoName), request.id);
}
