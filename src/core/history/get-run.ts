import type { RunRecord, RunStore } from "./ports/run-store.js";

export interface GetRunRequest {
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
  return deps.store.get(request.repoName, request.id);
}
