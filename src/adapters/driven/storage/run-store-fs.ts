/**
 * Driven adapter: storage — filesystem-backed `RunStore` implementation.
 *
 * `save()` implements design.md's 10-step flow: validate the path-sensitive
 * fields (step 1), derive the deterministic paths (steps 2-3, via
 * `run-layout.ts`), reject a genuine collision (step 4), create the repo
 * directory (step 5), clear a same-timestamp staging remnant from an earlier
 * failed attempt at THIS run (step 6 — safe only because paths are
 * deterministic, D7), stage every file (steps 7-8), and atomically rename
 * into place (step 9). Every fs failure is translated into the port error
 * hierarchy; callers never see a raw `ENOENT`/`EACCES`/`ENOTEMPTY`.
 *
 * `list()`/`get()` (`[E5.F2.H2]`) read the same layout back: `list()` scans
 * `runsRoot/<repoName>/` and classifies every entry via
 * `classifyRunDirEntry` (D9's three-way rule), validating each `final`
 * entry's `metadata.json` against `RunMetadataSchema` to decide `ok` vs
 * `corrupt` (D6); `get()` resolves one specific `id` and, for an `ok` run,
 * also reads the optional body files `save()` conditionally wrote.
 */
import type { Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { ZodError } from "zod";
import {
  InvalidRunQueryError,
  InvalidRunRecordError,
  RunAlreadyExistsError,
  RunCorruptedError,
  type RunMetadata,
  RunMetadataSchema,
  RunNotFoundError,
  RunPersistenceError,
  RunQueryFieldsSchema,
  type RunRecord,
  RunRecordPathFieldsSchema,
  type RunStore,
  type RunSummary,
} from "../../../core/history/index.js";
import {
  classifyRunDirEntry,
  deriveRunPaths,
  formatRunTimestamp,
  parseRunTimestamp,
  serializeRunMetadata,
} from "./run-layout.js";

function zodToFields(
  err: ZodError,
): ReadonlyArray<{ readonly path: string; readonly message: string }> {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

/** `readFile`'d `metadata.json`, parsed and schema-validated. */
type MetadataReadResult = RunMetadata | "corrupt" | "missing";

async function readMetadata(finalDir: string): Promise<MetadataReadResult> {
  let raw: string;
  try {
    raw = await readFile(join(finalDir, "metadata.json"), "utf-8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return "missing";
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return "corrupt";
  }

  const result = RunMetadataSchema.safeParse(parsedJson);
  return result.success ? result.data : "corrupt";
}

function toSummaryFromMetadata(
  id: string,
  repoName: string,
  epochMs: number,
  metadata: RunMetadata,
): RunSummary {
  return {
    id,
    repoName,
    startedAtEpochMs: epochMs,
    status: "ok",
    durationMs: metadata.durationMs,
    harness: metadata.harness,
    baseRef: metadata.baseRef,
    targetRef: metadata.targetRef,
    state: metadata.state,
    ...(metadata.verdict !== undefined ? { verdict: metadata.verdict } : {}),
    ...(metadata.engine !== undefined ? { engine: metadata.engine } : {}),
  };
}

function minimalSummary(
  id: string,
  repoName: string,
  epochMs: number,
  status: "partial" | "corrupt",
): RunSummary {
  return { id, repoName, startedAtEpochMs: epochMs, status };
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return undefined;
    }
    throw err;
  }
}

async function readOptionalValidationLogs(
  validationsDir: string,
): Promise<readonly string[] | undefined> {
  let names: readonly string[];
  try {
    names = await readdir(validationsDir);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return undefined;
    }
    throw err;
  }
  const sorted = [...names].sort();
  const contents: string[] = [];
  for (const name of sorted) {
    contents.push(await readFile(join(validationsDir, name), "utf-8"));
  }
  return contents;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return false;
    }
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

export function createRunStoreFsAdapter(runsRoot: string): RunStore {
  return {
    async save(record: RunRecord): Promise<string> {
      /* --- 1. validate path-sensitive fields --- */
      const parsed = RunRecordPathFieldsSchema.safeParse({
        repoName: record.repoName,
        startedAtEpochMs: record.startedAtEpochMs,
      });
      if (!parsed.success) {
        throw new InvalidRunRecordError(
          "Invalid RunRecord",
          zodToFields(parsed.error),
          { cause: parsed.error },
        );
      }

      /* --- 2-3. derive deterministic paths --- */
      const ts = formatRunTimestamp(record.startedAtEpochMs);
      const { repoDir, finalDir, stagingDir } = deriveRunPaths(
        runsRoot,
        record.repoName,
        ts,
      );

      /* --- 4. reject a genuine collision --- */
      let finalDirExists: boolean;
      try {
        finalDirExists = await exists(finalDir);
      } catch (err: unknown) {
        throw new RunPersistenceError(
          `Failed to check for an existing run at ${finalDir}`,
          { cause: err },
        );
      }
      if (finalDirExists) {
        throw new RunAlreadyExistsError(finalDir);
      }

      try {
        /* --- 5. ensure the repo directory exists --- */
        await mkdir(repoDir, { recursive: true });

        /* --- 6. clear a same-timestamp staging remnant (safe: D7) --- */
        await rm(stagingDir, { recursive: true, force: true });
        await mkdir(stagingDir);

        /* --- 7-8. stage every file --- */
        await writeFile(
          join(stagingDir, "metadata.json"),
          serializeRunMetadata(record),
          "utf-8",
        );
        if (record.engineOutput !== undefined) {
          await writeFile(
            join(stagingDir, "result.md"),
            record.engineOutput,
            "utf-8",
          );
        }
        if (record.prompt !== undefined) {
          await writeFile(
            join(stagingDir, "prompt.md"),
            record.prompt,
            "utf-8",
          );
        }
        if (
          record.validationOutput !== undefined &&
          record.validationOutput.length > 0
        ) {
          const validationsDir = join(stagingDir, "validations");
          await mkdir(validationsDir);
          for (const [i, entry] of record.validationOutput.entries()) {
            const filename = `${String(i + 1).padStart(3, "0")}.log`;
            await writeFile(join(validationsDir, filename), entry, "utf-8");
          }
        }

        /* --- 9. atomic transition --- */
        await rename(stagingDir, finalDir);
      } catch (err: unknown) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => {
          /* best-effort cleanup; the original error is what matters */
        });
        throw new RunPersistenceError(`Failed to persist run at ${finalDir}`, {
          cause: err,
        });
      }

      return finalDir;
    },

    async list(repoName: string): Promise<readonly RunSummary[]> {
      const parsedRepo = RunQueryFieldsSchema.pick({
        repoName: true,
      }).safeParse({ repoName });
      if (!parsedRepo.success) {
        throw new InvalidRunQueryError(
          "Invalid repoName",
          zodToFields(parsedRepo.error),
          { cause: parsedRepo.error },
        );
      }

      const repoDir = join(runsRoot, repoName);

      let entries: Dirent[];
      try {
        entries = await readdir(repoDir, { withFileTypes: true });
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return [];
        }
        throw new RunPersistenceError(`Failed to list runs at ${repoDir}`, {
          cause: err,
        });
      }

      const partials = new Map<string, RunSummary>();
      const finals = new Map<string, RunSummary>();

      for (const entry of entries) {
        const classified = classifyRunDirEntry(entry.name, entry.isDirectory());
        if (classified.kind === "other") {
          continue;
        }
        if (classified.kind === "partial") {
          partials.set(
            classified.id,
            minimalSummary(
              classified.id,
              repoName,
              classified.epochMs,
              "partial",
            ),
          );
          continue;
        }

        let metadata: MetadataReadResult;
        try {
          metadata = await readMetadata(join(repoDir, classified.id));
        } catch (err: unknown) {
          throw new RunPersistenceError(
            `Failed to read metadata for run ${repoName}/${classified.id}`,
            { cause: err },
          );
        }

        finals.set(
          classified.id,
          metadata === "corrupt" || metadata === "missing"
            ? minimalSummary(
                classified.id,
                repoName,
                classified.epochMs,
                "corrupt",
              )
            : toSummaryFromMetadata(
                classified.id,
                repoName,
                classified.epochMs,
                metadata,
              ),
        );
      }

      /* Final wins over a same-id staging remnant (AC-4): merge partials
       * first, finals second, so a `Map` spread lets the later entry win. */
      const merged = new Map<string, RunSummary>([...partials, ...finals]);
      return [...merged.values()].sort(
        (a, b) => a.startedAtEpochMs - b.startedAtEpochMs,
      );
    },

    async get(repoName: string, id: string): Promise<RunRecord> {
      const parsedQuery = RunQueryFieldsSchema.safeParse({ repoName, id });
      if (!parsedQuery.success) {
        throw new InvalidRunQueryError(
          "Invalid run query",
          zodToFields(parsedQuery.error),
          { cause: parsedQuery.error },
        );
      }

      const epochMs = parseRunTimestamp(id);
      if (epochMs === null) {
        throw new RunNotFoundError(repoName, id);
      }

      const { finalDir, stagingDir } = deriveRunPaths(runsRoot, repoName, id);

      let metadata: MetadataReadResult;
      try {
        metadata = await readMetadata(finalDir);
      } catch (err: unknown) {
        throw new RunPersistenceError(`Failed to read run ${repoName}/${id}`, {
          cause: err,
        });
      }

      if (metadata === "corrupt") {
        throw new RunCorruptedError(repoName, id);
      }
      if (metadata === "missing") {
        let partialExists: boolean;
        try {
          partialExists = await exists(stagingDir);
        } catch (err: unknown) {
          throw new RunPersistenceError(
            `Failed to check for a partial run at ${stagingDir}`,
            { cause: err },
          );
        }
        throw partialExists
          ? new RunCorruptedError(repoName, id)
          : new RunNotFoundError(repoName, id);
      }

      let engineOutput: string | undefined;
      let prompt: string | undefined;
      let validationOutput: readonly string[] | undefined;
      try {
        engineOutput = await readOptionalFile(join(finalDir, "result.md"));
        prompt = await readOptionalFile(join(finalDir, "prompt.md"));
        validationOutput = await readOptionalValidationLogs(
          join(finalDir, "validations"),
        );
      } catch (err: unknown) {
        throw new RunPersistenceError(`Failed to read run ${repoName}/${id}`, {
          cause: err,
        });
      }

      return {
        repoName,
        startedAtEpochMs: epochMs,
        durationMs: metadata.durationMs,
        harness: metadata.harness,
        baseRef: metadata.baseRef,
        targetRef: metadata.targetRef,
        state: metadata.state,
        ...(metadata.engine !== undefined ? { engine: metadata.engine } : {}),
        ...(metadata.verdict !== undefined
          ? { verdict: metadata.verdict }
          : {}),
        ...(prompt !== undefined ? { prompt } : {}),
        ...(engineOutput !== undefined ? { engineOutput } : {}),
        ...(metadata.diff !== undefined
          ? {
              diff: {
                ...metadata.diff,
                warnings: metadata.diff.warnings ?? [],
              },
            }
          : {}),
        ...(metadata.usage !== undefined
          ? {
              usage: {
                ...(metadata.usage.inputTokens !== undefined
                  ? { inputTokens: metadata.usage.inputTokens }
                  : {}),
                ...(metadata.usage.outputTokens !== undefined
                  ? { outputTokens: metadata.usage.outputTokens }
                  : {}),
                ...(metadata.usage.totalTokens !== undefined
                  ? { totalTokens: metadata.usage.totalTokens }
                  : {}),
              },
            }
          : {}),
        ...(validationOutput !== undefined ? { validationOutput } : {}),
        ...(metadata.failure !== undefined
          ? { failure: metadata.failure }
          : {}),
      };
    },
  };
}
