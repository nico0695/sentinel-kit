/**
 * Driven adapter: opencode — the `OPENCODE_CONFIG` temp-file lifecycle
 * (PRD §4.2). `opencode run` writes files by default; this module creates
 * a fresh, per-invocation read-only permission config so the adapter never
 * spawns the CLI without it (AC-7, AC-8, AC-9).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DENY_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  permission: { edit: "deny", bash: "deny", webfetch: "deny" },
} as const;

/** A single `review()` invocation's deny-permission config file and its cleanup. */
export interface OpenCodePermissionConfig {
  readonly path: string;
  cleanup(): Promise<void>;
}

/**
 * Creates a fresh `fs.mkdtemp`-backed directory with one deny-permission
 * JSON file inside it (AC-8: never a fixed/shared path, never inside the
 * reviewed worktree). `cleanup()` swallows its own rejection internally
 * (AC-9) so callers can `await` it unconditionally from a `finally` block.
 */
export async function createDenyConfigFile(): Promise<OpenCodePermissionConfig> {
  const dir = await mkdtemp(join(tmpdir(), "sentinel-opencode-"));
  const path = join(dir, "opencode-config.json");
  await writeFile(path, JSON.stringify(DENY_CONFIG), "utf-8");
  return {
    path,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
