/**
 * The flow really hands the renderers `TUI_PALETTE` (`[E6.F2.H2]`, #39;
 * AC-14, AC-20(b); ledger R3-001).
 *
 * AC-14's only *user-visible* behaviour is that a colour-capable terminal
 * sees a coloured digest and a coloured full view. Everything else about the
 * palette — the roles, the identity, the strippability — is proved by the
 * pure renderer suites against injected palettes. What none of them could
 * prove is the wiring: that `tui-flow.ts` passes the real palette rather
 * than the plain one at each of its three call sites. Before this file the
 * whole suite was indifferent to that choice, so AC-14 could have been
 * broken in production without a single test noticing.
 *
 * **Mechanism.** `vi.mock("../colors.js", …)` replaces the module the flow
 * imports with a *marking* palette, so every string the flow decorated
 * arrives here carrying a visible token. The mocked `PLAIN_PALETTE` stays
 * the identity, which is what makes the mutation check sharp: swapping a
 * single `TUI_PALETTE` argument in `tui-flow.ts` for `PLAIN_PALETTE` removes
 * the tokens from exactly one call site's output and turns exactly one case
 * below red (M13, run once per site).
 *
 * **Why its own file.** `vi.mock` is hoisted file-wide, never block-scoped —
 * the hazard `engines/opencode/__test__/opencode-adapter.test.ts:495-497`
 * documents. Living in `full-view.test.ts` it would silently replace the
 * palettes that file's own `TUI_PALETTE`-versus-`PLAIN_PALETTE` comparisons
 * depend on, neutering the block AC-20(a) exists to repair. One file, one
 * mock, no reach.
 *
 * **Why the markers are declared inside the factory** rather than reusing
 * `MARKED` from `tui-test-doubles.ts`: a `vi.mock` factory is hoisted above
 * the imports and runs while `../tui-flow.js` is still being evaluated,
 * before `./tui-test-doubles.js` has been. It must be self-contained. The
 * tokens are deliberately distinct from `MARKED`'s so that a token appearing
 * in flow output can only have come through the mocked `TUI_PALETTE`.
 *
 * `tui-flow.ts` is the only module in `src/` that imports `colors.js` for a
 * value (`render.ts` takes the palette as an argument and imports only the
 * type), so this mock reaches the wiring and nothing else.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  PersistRunRequest,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type { RunReviewResult } from "../../../../core/run/index.js";
import type { PromptOutcome } from "../tui-deps.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
} from "./tui-test-doubles.js";

vi.mock("../colors.js", () => ({
  TUI_PALETTE: {
    good: (text: string) => `<wired-good>${text}</wired-good>`,
    warn: (text: string) => `<wired-warn>${text}</wired-warn>`,
    bad: (text: string) => `<wired-bad>${text}</wired-bad>`,
    muted: (text: string) => `<wired-muted>${text}</wired-muted>`,
  },
  PLAIN_PALETTE: {
    good: (text: string) => text,
    warn: (text: string) => text,
    bad: (text: string) => text,
    muted: (text: string) => text,
  },
}));

/** Undoes the mocked `TUI_PALETTE`, so the plain half stays assertable. */
function stripWiredMarks(line: string): string {
  return line.replace(/<\/?wired-(?:good|warn|bad|muted)>/g, "");
}

/** True when a line carries any marker only the mocked palette could add. */
function isWired(line: string): boolean {
  return line !== stripWiredMarks(line);
}

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

/** One recognized blocker, so the full view has something to tint. */
const MARKDOWN = [
  "# Review",
  "[SEV: blocker] calc.js:6-8 — `divide` drops its zero guard",
  "VERDICT: request-changes",
].join("\n");

const BLOCKER_LINE =
  "[SEV: blocker] calc.js:6-8 — `divide` drops its zero guard";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

const record: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  verdict: "approve",
  engine: "claude-code",
  engineOutput: MARKDOWN,
};

const PERSIST_FAILURE = new Error("Failed to persist run at /runs/owner__repo");

interface WiringHarness {
  run(): Promise<number>;
  /** Every captured stdout line, markers intact. */
  stdout(): readonly string[];
}

/**
 * A completed `ok` run carrying engine output, with the four pre-run answers
 * scripted. Local by construction: the point is to observe raw stdout, so it
 * must not reuse a harness that strips anything on the way out.
 */
function harness(options: {
  readonly answers?: ReadonlyArray<PromptOutcome<boolean>>;
  readonly persistRunFails?: boolean;
}): WiringHarness {
  const persistRunRequests: PersistRunRequest[] = [];

  const result: RunReviewResult = {
    state: "ok",
    verdict: "approve",
    cleanup: { attempted: true, removed: true, reason: "policy-always" },
    engineName: "claude-code",
    engineOutput: MARKDOWN,
  };

  const deps = createTuiTestDeps({
    prompter: createScriptedPrompter([
      answer("owner/repo"),
      answer("feature"),
      answer("pr-review"),
      answer(true),
      ...(options.answers ?? []),
    ]),
    loadContext: () => Promise.resolve({ config, repos }),
    now: () => 1_700_000_000_000,
    useCases: {
      listRepos: () => Promise.resolve({ repos }),
      listBranches: (request) =>
        Promise.resolve({
          alias: request.alias,
          branches: [{ name: "feature", kind: "local" as const }],
        }),
      listHarnessTypes: () => Promise.resolve(["pr-review"]),
      runReview: () => Promise.resolve(result),
      persistRun: (request) => {
        persistRunRequests.push(request);

        return options.persistRunFails === true
          ? Promise.reject(PERSIST_FAILURE)
          : Promise.resolve({ runDir: RUN_DIR, record });
      },
    },
  });

  return {
    run: () => createTui(deps).run(),
    stdout: () => deps.io.out,
  };
}

describe("the flow passes the real palette to every renderer (AC-14, AC-20(b))", () => {
  it("decorates the persisted digest — tui-flow.ts call site 1 of 3", async () => {
    const h = harness({ answers: [answer(false)] });

    const code = await h.run();

    expect(code).toBe(0);
    const stateLine = h
      .stdout()
      .find((line) => line.startsWith("Review result:"));
    // Present: the real palette reached `formatResultDigest` on the persisted
    // branch — the `ok` state carries the `good` role's marker.
    expect(stateLine).toBe("Review result: <wired-good>ok</wired-good>");
    // Paired positive: the fact itself is still plain text underneath, so the
    // assertion above cannot be satisfied by the line having been replaced.
    expect(stripWiredMarks(stateLine ?? "")).toBe("Review result: ok");
  });

  it("decorates the persist-failure digest — tui-flow.ts call site 2 of 3", async () => {
    const h = harness({ answers: [answer(false)], persistRunFails: true });

    const code = await h.run();

    expect(code).toBe(1);
    const stateLine = h
      .stdout()
      .find((line) => line.startsWith("Review result:"));
    // Present: the branch where nothing was written to disk still gets the
    // real palette — it is a separate call site and was separately untested.
    expect(stateLine).toBe("Review result: <wired-good>ok</wired-good>");
    expect(stripWiredMarks(stateLine ?? "")).toBe("Review result: ok");
    // The run directory line proves this really is the unpersisted branch.
    expect(h.stdout()).toContain("Run directory: <wired-muted>-</wired-muted>");
  });

  it("decorates the accepted full view — tui-flow.ts call site 3 of 3", async () => {
    const h = harness({ answers: [answer(true)] });

    const code = await h.run();

    expect(code).toBe(0);
    // The full view is the tail: one emitted line per markdown line.
    const fullView = h.stdout().slice(-3);
    // Present: the recognized blocker is tinted with the `bad` role, which
    // only the real palette supplies — and it is the LAST block printed, so
    // this is `offerFullView`'s emission, not the digest's findings section.
    expect(fullView[1]).toBe(`<wired-bad>${BLOCKER_LINE}</wired-bad>`);
    // Paired positive: the markdown itself is intact under the decoration,
    // including the lines no severity tinted.
    expect(fullView.map(stripWiredMarks)).toEqual(MARKDOWN.split("\n"));
    // And the untinted lines really are untinted, so the marker above is a
    // per-severity decision rather than a blanket wrap.
    expect(isWired(fullView[0] ?? "")).toBe(false);
    expect(isWired(fullView[2] ?? "")).toBe(false);
  });
});
