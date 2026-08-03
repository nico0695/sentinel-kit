/**
 * Core module: workspace — use case `computeReviewDiff`.
 *
 * Produces a size-bounded diff between two refs suitable for feeding into
 * a review engine. When the raw diff exceeds configurable line/token
 * limits, files are truncated largest-first until the diff fits, and a
 * warning is attached to the result (PRD §5.1, AC-1/2/3).
 */

import type { GitPort } from "../repos/index.js";
import { DiffSizePolicyError } from "./diff-errors.js";
import type {
  DiffFileEntry,
  DiffTruncatedWarning,
  ReviewDiff,
} from "./diff-types.js";
import { InvalidWorktreeRequestError } from "./workspace-errors.js";

/* ------------------------------------------------------------------ */
/*  Public constants                                                   */
/* ------------------------------------------------------------------ */

export const DEFAULT_MAX_LINES = 3000;
export const DEFAULT_MAX_TOKENS = 50000;

/* ------------------------------------------------------------------ */
/*  Public request / dependency shapes                                 */
/* ------------------------------------------------------------------ */

export interface ComputeReviewDiffRequest {
  readonly repoPath: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly limits?: {
    readonly maxLines: number;
    readonly maxTokens: number;
  };
}

export interface ComputeReviewDiffDeps {
  readonly git: GitPort;
}

/* ------------------------------------------------------------------ */
/*  Internal types (NOT exported)                                      */
/* ------------------------------------------------------------------ */

interface ParsedFileChunk {
  readonly path: string;
  readonly content: string;
  readonly lineCount: number;
  readonly estimatedTokens: number;
}

interface WorkingFileEntry {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  content: string | null;
  truncated: boolean;
  readonly diffLineCount: number;
  entryTokens: number;
}

/* ------------------------------------------------------------------ */
/*  Private helpers                                                    */
/* ------------------------------------------------------------------ */

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function parseRawDiff(raw: string): ParsedFileChunk[] {
  const pattern = /^diff --git /gm;
  const matchIndices: number[] = [];

  for (;;) {
    const match = pattern.exec(raw);
    if (match === null) break;
    matchIndices.push(match.index);
  }

  if (matchIndices.length === 0) {
    return [];
  }

  const chunks: ParsedFileChunk[] = [];

  for (let i = 0; i < matchIndices.length; i++) {
    const start = matchIndices[i] as number;
    const nextIdx = matchIndices[i + 1];
    const end = nextIdx !== undefined ? nextIdx : raw.length;
    const content = raw.slice(start, end);

    const nlIndex = content.indexOf("\n");
    const firstLine = nlIndex >= 0 ? content.slice(0, nlIndex) : content;
    const bIndex = firstLine.indexOf(" b/");
    const path = bIndex >= 0 ? firstLine.slice(bIndex + 3) : firstLine;

    let lineCount = 0;
    for (let j = 0; j < content.length; j++) {
      if (content[j] === "\n") {
        lineCount++;
      }
    }

    chunks.push({
      path,
      content,
      lineCount,
      estimatedTokens: estimateTokens(content),
    });
  }

  return chunks;
}

function truncateFiles(
  entries: WorkingFileEntry[],
  totalLines: number,
  estimatedTokens: number,
  maxLines: number,
  maxTokens: number,
): {
  totalLines: number;
  estimatedTokens: number;
  warning: DiffTruncatedWarning;
} {
  const originalLines = totalLines;
  const originalTokens = estimatedTokens;
  let currentLines = totalLines;
  let currentTokens = estimatedTokens;
  let truncatedCount = 0;

  while (currentLines > maxLines || currentTokens > maxTokens) {
    let largest: WorkingFileEntry | null = null;
    let largestIdx = -1;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] as WorkingFileEntry;
      if (entry.truncated) continue;
      if (largest === null || entry.diffLineCount >= largest.diffLineCount) {
        largest = entry;
        largestIdx = i;
      }
    }

    if (largest === null || largestIdx < 0) break;

    currentLines -= largest.diffLineCount;
    currentTokens -= largest.entryTokens;
    largest.content = null;
    largest.truncated = true;
    largest.entryTokens = 0;
    truncatedCount++;
  }

  const warning: DiffTruncatedWarning = {
    kind: "diff-truncated",
    message: `Diff truncated: ${truncatedCount} of ${entries.length} file(s) content removed to fit within limits (${maxLines} lines / ${maxTokens} tokens)`,
    originalLines,
    originalTokens,
    keptLines: currentLines,
    keptTokens: currentTokens,
    truncatedFileCount: truncatedCount,
    totalFileCount: entries.length,
  };

  return { totalLines: currentLines, estimatedTokens: currentTokens, warning };
}

function toReadonlyEntries(working: WorkingFileEntry[]): DiffFileEntry[] {
  return working.map((w) => ({
    path: w.path,
    additions: w.additions,
    deletions: w.deletions,
    content: w.content,
    truncated: w.truncated,
    diffLineCount: w.diffLineCount,
  }));
}

/* ------------------------------------------------------------------ */
/*  Use case                                                           */
/* ------------------------------------------------------------------ */

export async function computeReviewDiff(
  request: ComputeReviewDiffRequest,
  deps: ComputeReviewDiffDeps,
): Promise<ReviewDiff> {
  /* --- 1. Validate inputs --- */
  if (!request.repoPath?.startsWith("/")) {
    throw new InvalidWorktreeRequestError(
      "repoPath must be a non-empty absolute path",
    );
  }
  if (!request.baseRef) {
    throw new InvalidWorktreeRequestError("baseRef must be non-empty");
  }
  if (!request.targetRef) {
    throw new InvalidWorktreeRequestError("targetRef must be non-empty");
  }

  const maxLines = request.limits?.maxLines ?? DEFAULT_MAX_LINES;
  const maxTokens = request.limits?.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (request.limits !== undefined) {
    if (maxLines <= 0) {
      throw new DiffSizePolicyError("maxLines must be greater than 0");
    }
    if (maxTokens <= 0) {
      throw new DiffSizePolicyError("maxTokens must be greater than 0");
    }
  }

  /* --- 2. Compute merge-base --- */
  const mergeBase = await deps.git.mergeBase({
    repoPath: request.repoPath,
    commitA: request.baseRef,
    commitB: request.targetRef,
  });

  /* --- 3. Get diff --- */
  const diffResult = await deps.git.diff({
    repoPath: request.repoPath,
    from: mergeBase,
    to: request.targetRef,
  });

  /* --- 4. Empty diff short-circuit --- */
  if (diffResult.raw === "" && diffResult.stats.length === 0) {
    return {
      files: [],
      totalLines: 0,
      estimatedTokens: 0,
      truncated: false,
      warnings: [],
    };
  }

  /* --- 5. Parse raw diff into chunks --- */
  const chunks = parseRawDiff(diffResult.raw);
  const chunkMap = new Map<string, ParsedFileChunk>();
  for (const chunk of chunks) {
    chunkMap.set(chunk.path, chunk);
  }

  /* --- 6. Build working entries from stats + chunks --- */
  const entries: WorkingFileEntry[] = diffResult.stats.map((stat) => {
    const chunk = chunkMap.get(stat.path);
    return {
      path: stat.path,
      additions: stat.additions,
      deletions: stat.deletions,
      content: chunk?.content ?? null,
      truncated: false,
      diffLineCount: chunk?.lineCount ?? 0,
      entryTokens: chunk?.estimatedTokens ?? 0,
    };
  });

  /* --- 7. Compute totals --- */
  let totalLines = 0;
  let estimatedTokensTotal = 0;
  for (const entry of entries) {
    totalLines += entry.diffLineCount;
    estimatedTokensTotal += entry.entryTokens;
  }

  /* --- 8. Within limits? --- */
  if (totalLines <= maxLines && estimatedTokensTotal <= maxTokens) {
    return {
      files: toReadonlyEntries(entries),
      totalLines,
      estimatedTokens: estimatedTokensTotal,
      truncated: false,
      warnings: [],
    };
  }

  /* --- 9. Truncate --- */
  const truncation = truncateFiles(
    entries,
    totalLines,
    estimatedTokensTotal,
    maxLines,
    maxTokens,
  );

  return {
    files: toReadonlyEntries(entries),
    totalLines: truncation.totalLines,
    estimatedTokens: truncation.estimatedTokens,
    truncated: true,
    warnings: [truncation.warning],
  };
}
