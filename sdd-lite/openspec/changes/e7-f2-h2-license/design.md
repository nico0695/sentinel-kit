# Design

## Routing Digest

- change_name: e7-f2-h2-license
- objective: new-feature (repo metadata and docs; no `src/` change)
- route: continue-lite
- digest_summary: Verbatim edits to four files. `LICENSE` = canonical MIT text (choosealicense/SPDX form) with holder `2026 nico0695`; `package.json` gains `"license": "MIT"` right after `"version"`; PRD §8 splits each ordered list with an HTML comment so CommonMark renders identifiers 1-4, 6 (Taken) and 5, 7, 8 (Open); README lines 19 and 61 replaced.
- affected_areas_digest: `LICENSE` (new), `package.json`, `docs/prd-sentinel.md` lines 276-286, `README.md` lines 19 and 61.
- interfaces_digest: npm manifest `license` field only; no code, config, or API change.

## Summary

- change_name: e7-f2-h2-license
- objective: new-feature
- route: continue-lite
- shape: full sections, condensed (four surfaces, so the proportional-design single-surface condition is not met).

## Design Overview

- The executor applies the exact text in this section; no wording is left to execution.
- AC-5 mechanism (resolves the only `design` question): CommonMark renders an ordered list using the first item's number and numbers the rest sequentially; an ordered list not starting at `1` cannot interrupt a paragraph; changing nothing but literal numbers does not help. Each identifier gap is therefore placed at the start of a separate list, separated from the previous list by a blank line, an HTML comment (invisible on GitHub, ends the list), and a blank line. Each label line (`**Taken in this version**`, `**Open**`) is followed by a blank line so the list is not absorbed into the paragraph. Side effect, intended: today the `**Open**` block renders as one run-on paragraph (the `5.` list cannot interrupt the label paragraph); after this change it renders as a real list.

### 1. `LICENSE` (new, repo root, LF line endings, single trailing newline)

```text
MIT License

Copyright (c) 2026 nico0695

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2. `package.json`

Insert one line after `"version": "0.0.0",` (2-space indent, biome-compatible):

```json
  "license": "MIT",
```

### 3. `docs/prd-sentinel.md` §8 (replace lines 276-286, from `**Taken in this version**` through decision 8; heading line 274 and the `---` after stay)

````markdown
**Taken in this version**

1. **Single product**: <unchanged text>
2. **Git tooling: own wrapper** <unchanged text>
3. **Naming: `sentinel`**. <unchanged text>
4. **Language/runtime/stack**: <unchanged text>

<!-- Decision numbers are stable identifiers: 5 is still open. Separate lists keep 6 rendered as 6. -->

6. **License: MIT** (closed in `[E7.F2.H2]`). The repository is already public, the public npm release of `@nico0695/sentinel` is planned in `[E7.F2.H3]`, and the runtime dependencies are permissively licensed (MIT/ISC). `LICENSE` lives at the repo root (copyright holder `nico0695`) and `package.json` declares `"license": "MIT"`.

**Open**

5. **`sentinel open` (interactive session)**: <unchanged text>

<!-- Decision 6 moved to Taken; separate list keeps 7 rendered as 7. -->

7. **Engine spike (§6.2)**: <unchanged text>
8. **Context spike (§6.3)**: <unchanged text>
````

`<unchanged text>` means the existing line content byte-for-byte. The old Open item 6 line is deleted. PRD title `v0.3` and history line untouched.

### 4. `README.md`

- Line 19, old: `> dogfooding, user documentation, licence and release. Scope and progress:` new: `> dogfooding, user documentation and release. Scope and progress:`
- Line 61, old: `merges everything. License is not yet decided (tracked for the wrap-up epic).` new: `merges everything. Licensed under the [MIT License](./LICENSE).`

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `LICENSE` | new file, canonical MIT | low |
| `package.json` | +1 line after `version` | low (biome-checked) |
| `docs/prd-sentinel.md` §8 | Taken/Open lists restructured per §3 | low |
| `README.md` | lines 19 and 61 replaced | low |

## Interfaces, Data, And State

- Only interface touched: npm manifest `license` (SPDX id `MIT`). `files` unchanged; npm always packs `LICENSE` (AC-8).
- Executor verification of AC-5: render check via any CommonMark renderer available locally is optional; the source inspection rule is that every list whose first number is not `1` is preceded by a blank line and is not directly adjacent to a previous list.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Split lists with HTML comments | chosen | renders exact identifiers on GitHub, invisible, keeps list styling |
| Switch delimiter (`6)`) to start a new list | rejected | works but inconsistent marker style in source |
| Escape numbers (`6\.`) as plain paragraphs | rejected | loses list rendering, inconsistent with 1-4 |
| Convert §8 to a table or headings | rejected | larger diff than the story needs |
| Place `license` near `dependencies` or at end | rejected | npm convention puts it beside `name`/`version` |
| choosealicense vs. SPDX template line wrapping | choosealicense wrapping | identical wording; GitHub's licensee matches it directly |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| PRD markdown mechanism for AC-5 (from spec) | stable decision identifiers | design | resolved: HTML-comment-separated lists, A-level (claude) |

No `execution` rows carried; spec had none.

## Approval Notes

- Phase validation skipped: mode `auto`, user indicated advancement, single design question resolved with evidence, all risks low.
