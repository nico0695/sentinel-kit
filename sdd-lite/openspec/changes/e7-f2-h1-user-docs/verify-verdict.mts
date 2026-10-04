// verify-verdict.mts <path-to-builtin-verdict-extraction.ts> <path-to-output.md>
//
// sdd-lite evidence for change e7-f2-h1-user-docs (story [E7.F2.H1], #43; AC-12).
// NOT product code: not linted, not typechecked, not shipped. It calls no model.
//
// Run it with the type-stripping flag, against the sandbox clone's parser:
//   node --experimental-strip-types verify-verdict.mts \
//     <sandbox>/sentinel-kit/src/core/run/builtin-verdict-extraction.ts \
//     <path to the harness's output.md>
//
// Checks (exit 1 on any mismatch):
//   1. output.md asks for the verdict as the last line ("last line").
//   2. A long synthetic answer shaped by that contract (40 finding lines, more
//      than 30 lines and more than 2000 chars) ending in `VERDICT: request-changes`
//      parses to `request-changes` with the built-in parser.
//   3. The same answer with the verdict FIRST (what the factory harnesses ask
//      for, follow-up F5) parses to `null`, i.e. `ambiguous`.
//   4. Every verdict value the contract offers parses when it is the last line.
//   5. A conflicting pair of markers in the tail window parses to `null`.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [extractionPath, outputMdPath] = process.argv.slice(2);
if (extractionPath === undefined || outputMdPath === undefined) {
  console.error(
    "usage: node --experimental-strip-types verify-verdict.mts <builtin-verdict-extraction.ts> <output.md>",
  );
  process.exit(2);
}

const mod = (await import(pathToFileURL(resolve(extractionPath)).href)) as {
  extractBuiltInVerdict: (output: string) => string | null;
};
const parse = mod.extractBuiltInVerdict;
if (typeof parse !== "function") {
  console.error("extractBuiltInVerdict is not exported by", extractionPath);
  process.exit(2);
}

let failed = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail === "" ? "" : ` (${detail})`}`);
  if (!ok) failed += 1;
}

const outputMd = readFileSync(resolve(outputMdPath), "utf8");
check("output.md says the verdict is the last line", /last line/i.test(outputMd));
for (const v of ["approve", "request-changes", "comment"]) {
  check(`output.md offers "VERDICT: ${v}"`, outputMd.includes(`VERDICT: ${v}`));
}

// Synthetic answer shaped by the contract: one finding per line, then the verdict.
const findings: string[] = [];
for (let i = 1; i <= 40; i++) {
  findings.push(
    `- src/module${i}.ts:${i * 3} — the error from call ${i} is swallowed by an empty catch block; report it and stop.`,
  );
}
const body = findings.join("\n");
const lines = body.split("\n").length;
check("synthetic body is longer than 30 lines", lines > 30, `${lines} lines`);
check("synthetic body is longer than 2000 chars", body.length > 2000, `${body.length} chars`);

const verdictLast = `${body}\nVERDICT: request-changes`;
check("verdict last parses to request-changes", parse(verdictLast) === "request-changes", String(parse(verdictLast)));
check(
  "verdict last with a trailing newline parses to request-changes",
  parse(`${verdictLast}\n`) === "request-changes",
);

const verdictFirst = `VERDICT: request-changes\n${body}`;
check(
  "control: verdict first (factory-style) parses to null (ambiguous), F5",
  parse(verdictFirst) === null,
  String(parse(verdictFirst)),
);

for (const v of ["approve", "request-changes", "comment"]) {
  check(`verdict last "${v}" parses to ${v}`, parse(`${body}\nVERDICT: ${v}`) === v);
}

check(
  "approve with no findings parses",
  parse("No findings.\nVERDICT: approve") === "approve",
);
check(
  "conflicting markers in the tail window parse to null",
  parse(`${body}\nVERDICT: approve\nVERDICT: request-changes`) === null,
);
check(
  "no marker parses to null",
  parse(`${body}\nLooks fine overall.`) === null,
);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
