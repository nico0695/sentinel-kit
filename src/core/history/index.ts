/**
 * Core module: history — querying previous runs (PRD §4.2).
 *
 * Public API: the `RunStore` driven port and its `RunRecord`/
 * `RunDiffSummary`/`RunFailureRecord` domain shapes, the `RunRecordPathFieldsSchema`
 * zod schema validating the two fields that become filesystem path segments,
 * and the module's typed error family. `listRuns`/`getRun` use cases land in
 * `[E5.F2.H2]`.
 */

export type {
  RunDiffSummary,
  RunFailureRecord,
  RunRecord,
  RunStore,
} from "./ports/run-store.js";
export {
  HistoryError,
  type HistoryErrorOptions,
  InvalidRunRecordError,
  RunAlreadyExistsError,
  RunPersistenceError,
} from "./ports/run-store-errors.js";
export {
  type RunRecordPathFields,
  RunRecordPathFieldsSchema,
} from "./ports/run-store-schemas.js";
