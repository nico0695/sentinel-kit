/**
 * Fixture-reconstruction helper for `builtin-verdict-extraction.test.ts` —
 * `[E4.F1.H2]` (#27). TEST-ONLY scaffolding, not production code: it lives
 * under `__test__/`, so `depcruise src` never cruises it
 * (`.dependency-cruiser.cjs`'s `exclude: { path: "(^|/)__test__/" }`), and
 * its `node:fs`/`node:url` imports are sanctioned test-local file reading,
 * not the real envelope-parsing adapter work `spec.md` places out of scope
 * for this story (E4.F2.x).
 *
 * Reconstructs the plain string `extractBuiltInVerdict` receives from the
 * two real fixture envelope shapes captured by E1.F1.H3, plus a uniform
 * plain-text reader for `unknown-model-stdout.txt` and every
 * `fixtures/synthetic/*.txt` file (already the reconstructed text, no
 * envelope to unwrap — spec.md's "Envelope boundary" section).
 *
 * No existing test in the repo reads a fixture file from disk (confirmed by
 * grep across `src/`: `run-review-fixtures.ts`'s `node:fs` usage only writes
 * hermetic tmp fixtures at test time), so this is a new pattern, documented
 * here rather than assumed familiar.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Repo-root-relative path resolution: `__test__/` is 4 directories below
 * repo root (`__test__` → `run` → `core` → `src` → root).
 */
function fixturePath(relativePath: string): string {
  return fileURLToPath(
    new URL(`../../../../fixtures/${relativePath}`, import.meta.url),
  );
}

/**
 * Reads and JSON-parses a Claude Code fixture, returning `.result` — or
 * `""` when the field is absent (`timeout-sigterm.json` has no `.result` at
 * all) or when the file is not valid JSON, never throwing. Symmetric with
 * `reconstructOpenCodeText`'s tolerance of a malformed/truncated line.
 */
export function reconstructClaudeCodeResult(relativePath: string): string {
  const raw = readFileSync(fixturePath(relativePath), "utf-8");
  let doc: { result?: string };
  try {
    doc = JSON.parse(raw) as { result?: string };
  } catch {
    return "";
  }
  return doc.result ?? "";
}

/**
 * Reads an OpenCode NDJSON fixture line by line, concatenating every
 * `type: "text"` event's `part.text`, in order. Tolerates a truncated /
 * non-JSON final line (`timeout-sigterm-partial.ndjson`) by skipping it.
 */
export function reconstructOpenCodeText(relativePath: string): string {
  const lines = readFileSync(fixturePath(relativePath), "utf-8").split("\n");
  let text = "";
  for (const line of lines) {
    if (line.trim() === "") continue;
    let event: { type?: string; part?: { text?: string } };
    try {
      event = JSON.parse(line);
    } catch {
      continue; // truncated / malformed final line — tolerated, not fed to the parser
    }
    if (event.type === "text" && typeof event.part?.text === "string") {
      text += event.part.text;
    }
  }
  return text;
}

/**
 * Raw plain-text fixture — `unknown-model-stdout.txt` and every
 * `fixtures/synthetic/*.txt` file — read verbatim, no reconstruction.
 */
export function readPlainTextFixture(relativePath: string): string {
  return readFileSync(fixturePath(relativePath), "utf-8");
}
