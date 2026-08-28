/**
 * Core module: history — module-private alias → storage-key normalisation (D7).
 *
 * `registerRepo` derives the user-facing repo alias as `owner/repo`, but
 * `RunStore` turns `repoName` into a single filesystem path segment and its
 * `RunRecordPathFieldsSchema`/`RunQueryFieldsSchema` reject any `/` or `\`.
 * This helper bridges the two contracts inside the module that owns the
 * persistence rule: `owner/repo` becomes `owner__repo`, so the CLI, the TUI
 * and every other caller keep passing the alias they show the user.
 *
 * Deliberately NOT exported from `./index.js`: the storage-key rule is a
 * `history` implementation detail, not part of the core's public API.
 * The mapping is idempotent — a key with no separator passes through
 * unchanged, so `f(f(x)) === f(x)` for every input.
 */

/** Separator used in place of a path separator inside a storage key. */
const STORAGE_KEY_SEPARATOR = "__";

/**
 * Maps a repo alias to the single path segment `RunStore` persists it under.
 *
 * @param repoName - user-facing alias, e.g. `owner/repo`.
 * @returns the storage key, e.g. `owner__repo`; unchanged when the alias
 *   contains no path separator.
 */
export function toRunStorageKey(repoName: string): string {
  return repoName
    .replaceAll("/", STORAGE_KEY_SEPARATOR)
    .replaceAll("\\", STORAGE_KEY_SEPARATOR);
}
