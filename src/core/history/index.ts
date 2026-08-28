/**
 * Core module: history — querying and persisting runs (PRD §4.2).
 *
 * Public API: the `RunStore` driven port and its `RunRecord`/
 * `RunDiffSummary`/`RunFailureRecord`/`RunSummary`/`RunStatus` domain shapes,
 * the `RunRecordPathFieldsSchema`/`RunQueryFieldsSchema` zod schemas
 * validating path-sensitive input, `RunMetadataSchema` validating the
 * persisted `metadata.json` document on read, the module's typed error
 * family, the `listRuns`/`getRun` use cases (`[E5.F2.H2]`) and the
 * `persistRun` use case that composes and stores a run (`[E6.F1.H1]`, D1).
 */

export type {
  GetRunDeps,
  GetRunRequest,
  GetRunResult,
} from "./get-run.js";
export { getRun } from "./get-run.js";
export type {
  ListRunsDeps,
  ListRunsRequest,
  ListRunsResult,
} from "./list-runs.js";
export { listRuns } from "./list-runs.js";
export type {
  PersistRunDeps,
  PersistRunRequest,
  PersistRunResult,
} from "./persist-run.js";
export { persistRun } from "./persist-run.js";
export {
  type RunMetadata,
  RunMetadataSchema,
} from "./ports/run-metadata-schemas.js";
export type {
  RunDiffSummary,
  RunFailureRecord,
  RunRecord,
  RunStatus,
  RunStore,
  RunSummary,
} from "./ports/run-store.js";
export {
  HistoryError,
  type HistoryErrorOptions,
  InvalidRunQueryError,
  InvalidRunRecordError,
  RunAlreadyExistsError,
  RunCorruptedError,
  RunNotFoundError,
  RunPersistenceError,
} from "./ports/run-store-errors.js";
export {
  type RunQueryFields,
  RunQueryFieldsSchema,
  type RunRecordPathFields,
  RunRecordPathFieldsSchema,
} from "./ports/run-store-schemas.js";
