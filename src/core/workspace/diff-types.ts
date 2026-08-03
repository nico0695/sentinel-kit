/**
 * Core module: workspace — diff type definitions (PRD §4.2).
 *
 * Pure readonly shapes for the `computeReviewDiff` use case. No runtime
 * dependencies — these are structural contracts only.
 */

export interface DiffFileEntry {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly content: string | null;
  readonly truncated: boolean;
  readonly diffLineCount: number;
}

export interface DiffTruncatedWarning {
  readonly kind: "diff-truncated";
  readonly message: string;
  readonly originalLines: number;
  readonly originalTokens: number;
  readonly keptLines: number;
  readonly keptTokens: number;
  readonly truncatedFileCount: number;
  readonly totalFileCount: number;
}

export type DiffWarning = DiffTruncatedWarning;

export interface ReviewDiff {
  readonly files: readonly DiffFileEntry[];
  readonly totalLines: number;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly warnings: readonly DiffWarning[];
}
