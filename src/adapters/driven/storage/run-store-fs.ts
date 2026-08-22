/**
 * Driven adapter: storage — filesystem-backed `RunStore` implementation.
 *
 * Implements design.md's 10-step `save()` flow: validate the path-sensitive
 * fields (step 1), derive the deterministic paths (steps 2-3, via
 * `run-layout.ts`), reject a genuine collision (step 4), create the repo
 * directory (step 5), clear a same-timestamp staging remnant from an earlier
 * failed attempt at THIS run (step 6 — safe only because paths are
 * deterministic, D7), stage every file (steps 7-8), and atomically rename
 * into place (step 9). Every fs failure is translated into the port error
 * hierarchy; callers never see a raw `ENOENT`/`EACCES`/`ENOTEMPTY`.
 */
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodError } from "zod";
import {
  InvalidRunRecordError,
  RunAlreadyExistsError,
  RunPersistenceError,
  type RunRecord,
  RunRecordPathFieldsSchema,
  type RunStore,
} from "../../../core/history/index.js";
import {
  deriveRunPaths,
  formatRunTimestamp,
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
  };
}
