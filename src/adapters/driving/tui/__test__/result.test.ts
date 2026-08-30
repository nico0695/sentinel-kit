/**
 * The result step, its persistence contract and the pure renderers
 * (`[E6.F2.H2]`, #39; AC-1..AC-7, AC-12, AC-14, AC-15).
 *
 * Three contracts under guard:
 *
 * - **The digest IS the result step's output.** The tail of `stdout` is
 *   asserted against this story's contract — state, verdict (an explicit
 *   "none" line when nothing was parsed), failure, findings, run paths —
 *   through `stripAnsi`, so the same strings hold whether the ambient colour
 *   decision is on or off (AC-1..AC-7, AC-14).
 * - **AC-15, the supersession.** `[E6.F2.H1]` AC-7 pinned a literal
 *   `State:` / `Verdict:` / `Run directory:` tail precisely to stop H2's
 *   surface from slipping in early. That purpose is now served: the four
 *   literal-tail assertions are rewritten against the digest contract, and
 *   the renderer that produced that block — together with its three unit
 *   cases — is deleted rather than deprecated. What must NOT be swept away
 *   with them is H1's AC-8 coverage, preserved below unchanged.
 * - **AC-8, preserved.** `persistRun` runs exactly once per completed run
 *   whatever the terminal state; when it throws, the outcome is still shown
 *   with `-` for the run directory, a no-history diagnostic lands on
 *   `stderr`, and the exit code is non-zero. A completed AND persisted run
 *   exits 0 regardless of terminal state (design §Interfaces, recorded
 *   A-level decision).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  PersistRunRequest,
  RunFailureRecord,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
  TerminalState,
} from "../../../../core/run/index.js";
import { PLAIN_PALETTE, TUI_PALETTE } from "../colors.js";
import {
  formatFullView,
  formatResultDigest,
  type TuiResultDigest,
} from "../render.js";
import type { PromptOutcome } from "../tui-deps.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
  MARKED,
  stripAnsi,
  stripMarks,
} from "./tui-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

/**
 * A real `git worktree add` rejection against a bad ref, measured — three
 * physical lines with a blank one in the middle. `git-cli.ts` wraps it,
 * `run-review.ts` returns it as a *failure* rather than throwing, and
 * `persist-run.ts` copies it into `record.failure.message` verbatim, so this
 * is what the digest is handed on an ordinary path (D9, AC-6).
 */
const MULTILINE_GIT_FAILURE = [
  "Command failed with exit code 128: git worktree add /tmp/wt definitely-not-a-ref",
  "",
  "fatal: invalid reference: definitely-not-a-ref",
].join("\n");

/** {@link MULTILINE_GIT_FAILURE} as the single line the digest must render. */
const COLLAPSED_GIT_FAILURE =
  "Command failed with exit code 128: git worktree add /tmp/wt definitely-not-a-ref fatal: invalid reference: definitely-not-a-ref";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

const okResult: RunReviewResult = {
  state: "ok",
  verdict: "approve",
  cleanup: { attempted: true, removed: true, reason: "policy-always" },
  engineName: "claude-code",
};

const okRecord: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  verdict: "approve",
  engine: "claude-code",
};

/** Drops the optional key rather than setting it to `undefined`. */
function withoutVerdict(record: RunRecord): RunRecord {
  const { verdict: _verdict, ...rest } = record;
  return rest;
}

interface ResultHarness {
  readonly deps: ReturnType<typeof createTuiTestDeps>;
  readonly runReviewRequests: RunReviewRequest[];
  readonly persistRunRequests: PersistRunRequest[];
  /**
   * How many prompts had been asked when `persistRun` was called, one entry
   * per call — the ordering evidence AC-11 needs.
   */
  readonly promptsAtPersist: number[];
  run(): Promise<number>;
}

function harness(
  options: {
    readonly result?: RunReviewResult;
    readonly record?: RunRecord;
    readonly persistRunFails?: unknown;
    /** Scripted AFTER the four pre-run answers (`[E6.F2.H2]` AC-11). */
    readonly extraAnswers?: ReadonlyArray<PromptOutcome<boolean>>;
  } = {},
): ResultHarness {
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];
  const promptsAtPersist: number[] = [];

  const prompter = createScriptedPrompter([
    answer("owner/repo"),
    answer("feature"),
    answer("pr-review"),
    answer(true),
    ...(options.extraAnswers ?? []),
  ]);

  const deps = createTuiTestDeps({
    prompter,
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
      runReview: (request) => {
        runReviewRequests.push(request);
        return Promise.resolve(options.result ?? okResult);
      },
      persistRun: (request) => {
        persistRunRequests.push(request);
        promptsAtPersist.push(prompter.prompts.length);
        if (options.persistRunFails !== undefined) {
          return Promise.reject(options.persistRunFails);
        }
        return Promise.resolve({
          runDir: RUN_DIR,
          record: options.record ?? okRecord,
        });
      },
    },
  });

  return {
    deps,
    runReviewRequests,
    persistRunRequests,
    promptsAtPersist,
    run: () => createTui(deps).run(),
  };
}

describe("result step per terminal state (AC-1, AC-7, AC-8)", () => {
  const failedStates: readonly TerminalState[] = [
    "ambiguous",
    "engine-error",
    "timeout",
    "validation-failed",
  ];

  it("renders the digest and exits 0 for a persisted ok run", async () => {
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    // AC-15, rewrite 1 of 4 (was H1's literal `State:` tail): the tail of
    // stdout is the digest of the record that was persisted, compared
    // through `stripAnsi` so it holds under NO_COLOR=1 and FORCE_COLOR=1
    // alike (AC-14).
    expect(h.deps.io.out.slice(-3).map(stripAnsi)).toEqual([
      "Review result: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
    // …and it is that digest rather than a look-alike: the very strings the
    // pure renderer produces for the same record.
    expect(h.deps.io.out.slice(-3).map(stripAnsi)).toEqual(
      formatResultDigest(
        { state: "ok", verdict: "approve", runDir: RUN_DIR },
        PLAIN_PALETTE,
      ),
    );
    expect(h.persistRunRequests).toHaveLength(1);
    expect(h.deps.io.err).toEqual([]);
  });

  it.each(failedStates)(
    "persists once and still exits 0 for a completed %s run",
    async (state) => {
      const h = harness({
        result: { state, cleanup: { attempted: false } },
        record: { ...withoutVerdict(okRecord), state },
      });

      const code = await h.run();

      // Recorded design decision: gate semantics are the CLI's scripting
      // contract; a completed, persisted interactive run exits 0.
      expect(code).toBe(0);
      expect(h.persistRunRequests).toHaveLength(1);
      // AC-15, rewrite 2 of 4: H1 silently omitted the verdict line for a
      // verdictless run; the digest says so in words instead (AC-1), so the
      // tail is three lines rather than two.
      expect(h.deps.io.out.slice(-3).map(stripAnsi)).toEqual([
        `Review result: ${state}`,
        "Verdict: none — no verdict was parsed for this run.",
        `Run directory: ${RUN_DIR}`,
      ]);
    },
  );

  it("hands persistRun the run it just completed, exactly once", async () => {
    const h = harness();

    await h.run();

    expect(h.persistRunRequests).toHaveLength(1);
    const persisted = h.persistRunRequests[0] as PersistRunRequest;
    expect(persisted.repoName).toBe("owner/repo");
    expect(persisted.startedAtEpochMs).toBe(1_700_000_000_000);
    expect(persisted.request).toBe(h.runReviewRequests[0]);
    expect(persisted.result).toBe(okResult);
  });

  it("asks about the full view strictly after persistRun settled (AC-11)", async () => {
    const engineOutput = "[SEV: blocker] calc.js:6 — no guard";
    const h = harness({
      result: { ...okResult, engineOutput },
      record: { ...okRecord, engineOutput },
      extraAnswers: [answer(false)],
    });

    const code = await h.run();

    expect(code).toBe(0);
    // Exactly FOUR prompts had been asked when the run was recorded — the
    // pre-run ones. The full-view prompt is the fifth and comes after, so it
    // can never decide whether the run was written; and `persistRun` still
    // ran exactly once (one entry).
    expect(h.promptsAtPersist).toEqual([4]);
    expect(h.deps.prompter.prompts).toHaveLength(5);
    expect(h.persistRunRequests).toHaveLength(1);
  });
});

describe("persistence failure (AC-8, D13 mirror)", () => {
  const writeFailed = new Error("Failed to persist run at /runs/owner__repo");

  it("still shows the outcome, with `-` for the run directory", async () => {
    const h = harness({ persistRunFails: writeFailed });

    await h.run();

    // AC-15, rewrite 3 of 4: same digest contract, `-` for the directory
    // that was never written — and no pointer at a `result.md` that does not
    // exist either (AC-7).
    expect(h.deps.io.out.slice(-3).map(stripAnsi)).toEqual([
      "Review result: ok",
      "Verdict: approve",
      "Run directory: -",
    ]);
    expect(
      h.deps.io.out.some((line) => stripAnsi(line).startsWith("Full review:")),
    ).toBe(false);
  });

  it("emits the no-history diagnostic and the failure, and exits non-zero", async () => {
    const h = harness({ persistRunFails: writeFailed });

    const code = await h.run();

    expect(code).toBe(1);
    expect(h.deps.io.err).toHaveLength(2);
    expect(h.deps.io.err[0]).toContain("could not be persisted");
    expect(h.deps.io.err[1]).toBe(writeFailed.message);
  });

  it("attempted persistence exactly once — no retry, no second run", async () => {
    const h = harness({ persistRunFails: writeFailed });

    await h.run();

    expect(h.persistRunRequests).toHaveLength(1);
    expect(h.runReviewRequests).toHaveLength(1);
  });

  it("shows a failed run's outcome too when its record could not be written", async () => {
    const h = harness({
      persistRunFails: writeFailed,
      result: { state: "engine-error", cleanup: { attempted: false } },
    });

    const code = await h.run();

    expect(code).toBe(1);
    // AC-15, rewrite 4 of 4 — inside a preserved AC-8 case: the title and
    // the exit-code assertion are H1's, only the rendered tail is this
    // story's.
    expect(h.deps.io.out.slice(-3).map(stripAnsi)).toEqual([
      "Review result: engine-error",
      "Verdict: none — no verdict was parsed for this run.",
      "Run directory: -",
    ]);
  });
});

describe("the flow builds the digest from what it persisted (AC-5, AC-6, AC-7)", () => {
  it("renders the record's findings section and the result.md pointer", async () => {
    const h = harness({
      record: {
        ...okRecord,
        verdict: "request-changes",
        engineOutput: "[SEV: blocker] calc.js:6 — no guard\n[SEV: nit] naming",
      },
      // The record carries markdown, so the flow now offers the full view
      // (AC-8). Declined here: this case is about the digest, and a decline
      // prints nothing further, so its tail assertion is unaffected.
      extraAnswers: [answer(false)],
    });

    const code = await h.run();

    // AC-5: the markdown-keyed sections reach stdout for an `ok` run exactly
    // as they would for any other state — the flow branches on the record's
    // `engineOutput`, never on its state.
    expect(code).toBe(0);
    expect(h.deps.io.out.slice(-6).map(stripAnsi)).toEqual([
      "Review result: ok",
      "Verdict: request-changes",
      "Findings: 1 blocker, 1 nit",
      "  [blocker] calc.js:6 — no guard",
      `Run directory: ${RUN_DIR}`,
      `Full review: ${RUN_DIR}/result.md`,
    ]);
  });

  it("collapses a multi-line failure message from the persisted record", async () => {
    const h = harness({
      record: {
        ...withoutVerdict(okRecord),
        state: "engine-error",
        failure: { stage: "worktree", message: MULTILINE_GIT_FAILURE },
      },
      result: { state: "engine-error", cleanup: { attempted: false } },
    });

    const code = await h.run();

    // D9 end to end on the persisted path: `persist-run.ts` copies the
    // message verbatim, so the digest's own reduction is the only thing
    // keeping one failure on one line.
    expect(code).toBe(0);
    expect(h.deps.io.out.slice(-4).map(stripAnsi)).toEqual([
      "Review result: engine-error",
      "Verdict: none — no verdict was parsed for this run.",
      `Failure: worktree — ${COLLAPSED_GIT_FAILURE}`,
      `Run directory: ${RUN_DIR}`,
    ]);
    expect(h.deps.io.out.some((line) => line.includes("\n"))).toBe(false);
  });

  it("reduces the raw failure to one line when the run could not be persisted", async () => {
    const h = harness({
      persistRunFails: new Error("Failed to persist run at /runs/owner__repo"),
      result: {
        state: "engine-error",
        failure: { stage: "worktree", error: new Error(MULTILINE_GIT_FAILURE) },
        cleanup: { attempted: false },
      },
    });

    const code = await h.run();

    // The persist-failure branch holds a raw throwable, not a record, so it
    // normalises with `formatTuiErrorLine` before handing the digest AC-6's
    // `{ stage, message }` shape.
    expect(code).toBe(1);
    expect(h.deps.io.out.slice(-4).map(stripAnsi)).toEqual([
      "Review result: engine-error",
      "Verdict: none — no verdict was parsed for this run.",
      `Failure: worktree — ${COLLAPSED_GIT_FAILURE}`,
      "Run directory: -",
    ]);
    expect(h.deps.io.err).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  `[E6.F2.H2]` (#39) — the pure digest and full-view renderers       */
/*                                                                     */
/*  Nothing below drives the flow: these are string-in / strings-out    */
/*  functions, given `PLAIN_PALETTE` so the assertions compare exact    */
/*  strings and can never inherit the ambient, `CI`-dependent colour    */
/*  decision (AC-14). The flow half of these ACs is asserted above,     */
/*  through `stripAnsi`, now that both call sites render the digest.    */
/* ------------------------------------------------------------------ */

/** The five states, so "keyed on the data, never on the state" is exhaustive. */
const TERMINAL_STATES: readonly TerminalState[] = [
  "ok",
  "ambiguous",
  "engine-error",
  "timeout",
  "validation-failed",
];

/** A parse-stage fault: the path that carries `engineOutput` AND `failure`. */
const parseFailure: RunFailureRecord = {
  stage: "parse",
  message: "no verdict found in the engine output",
};

/** The `result` text of one captured `claude-code` fixture. */
function fixtureResult(file: string): string {
  const raw = readFileSync(
    fileURLToPath(
      new URL(`../../../../../fixtures/claude-code/${file}`, import.meta.url),
    ),
    "utf-8",
  );

  return (JSON.parse(raw) as { readonly result: string }).result;
}

/** The real fixture the suite's happy path uses: 1 major, 1 minor. */
function fixtureMarkdown(): string {
  return fixtureResult("valid-verdict.json");
}

/**
 * A real captured review that ignores the `[SEV: …]` convention entirely —
 * prose headings and numbered sections, no marker anywhere. Among the
 * captured `claude-code` fixtures this shape is the COMMON one, which is why
 * AC-4's degradation path is asserted against it and not only against a
 * hand-written string.
 */
function noisyFixtureMarkdown(): string {
  return fixtureResult("noisy-output.json");
}

/** The fixture's line at `severity`, minus its marker. */
function fixtureFindingText(severity: string): string {
  const marker = `[SEV: ${severity}] `;
  const line =
    fixtureMarkdown()
      .split("\n")
      .find((candidate) => candidate.startsWith(marker)) ?? "";

  return line.slice(marker.length);
}

describe("formatResultDigest — state and verdict (AC-1)", () => {
  it("renders the state and the verdict on their own labelled lines", () => {
    expect(
      formatResultDigest(
        { state: "ok", verdict: "approve", runDir: RUN_DIR },
        PLAIN_PALETTE,
      ),
    ).toEqual([
      "Review result: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
  });

  it.each(["approve", "request-changes", "comment"] as const)(
    "labels the %s verdict of an ok run",
    (verdict) => {
      expect(
        formatResultDigest({ state: "ok", verdict }, PLAIN_PALETTE),
      ).toContain(`Verdict: ${verdict}`);
    },
  );

  it("says no verdict was parsed rather than silently omitting the line", () => {
    expect(formatResultDigest({ state: "ambiguous" }, PLAIN_PALETTE)).toEqual([
      "Review result: ambiguous",
      "Verdict: none — no verdict was parsed for this run.",
      "Run directory: -",
    ]);
  });

  it.each(TERMINAL_STATES)(
    "keeps exactly one verdict line for a verdictless %s run",
    (state) => {
      const lines = formatResultDigest({ state }, PLAIN_PALETTE);

      expect(lines[0]).toBe(`Review result: ${state}`);
      expect(lines.filter((line) => line.startsWith("Verdict: "))).toEqual([
        "Verdict: none — no verdict was parsed for this run.",
      ]);
    },
  );
});

describe("formatResultDigest — findings (AC-2)", () => {
  it("lists the real fixture's major verbatim and only counts its minor", () => {
    const major = fixtureFindingText("major");
    const minor = fixtureFindingText("minor");
    const lines = formatResultDigest(
      {
        state: "ok",
        verdict: "request-changes",
        engineOutput: fixtureMarkdown(),
      },
      PLAIN_PALETTE,
    );

    // The `calc.js:6-8` range and the em-dash separator survive untouched.
    expect(major.startsWith("calc.js:6-8 — ")).toBe(true);
    expect(lines).toContain("Findings: 1 major, 1 minor");
    expect(lines).toContain(`  [major]   ${major}`);
    expect(lines.some((line) => line.includes(minor))).toBe(false);
  });

  it("groups every blocker before every major, whatever the source order", () => {
    const markdown = [
      "[SEV: major] m1",
      "[SEV: blocker] b1",
      "[SEV: nit] n1",
      "[SEV: major] m2",
      "[SEV: blocker] b2",
    ].join("\n");

    expect(
      formatResultDigest(
        { state: "ok", engineOutput: markdown },
        PLAIN_PALETTE,
      ),
    ).toEqual([
      "Review result: ok",
      "Verdict: none — no verdict was parsed for this run.",
      "Findings: 2 blocker, 2 major, 1 nit",
      "  [blocker] b1",
      "  [blocker] b2",
      "  [major]   m1",
      "  [major]   m2",
      "Run directory: -",
    ]);
  });

  it("counts minor and nit findings without listing any of them", () => {
    const markdown = ["[SEV: minor] m", "[SEV: nit] n1", "[SEV: nit] n2"].join(
      "\n",
    );
    const lines = formatResultDigest(
      { state: "ok", engineOutput: markdown },
      PLAIN_PALETTE,
    );

    expect(lines).toContain("Findings: 1 minor, 2 nit");
    expect(lines.filter((line) => line.startsWith("  ["))).toEqual([]);
  });

  it("pads the severity labels so the listed findings form a column", () => {
    const listed = formatResultDigest(
      { state: "ok", engineOutput: "[SEV: blocker] b\n[SEV: major] m" },
      PLAIN_PALETTE,
    ).filter((line) => line.startsWith("  ["));

    expect(listed).toEqual(["  [blocker] b", "  [major]   m"]);
    // Both texts are one character, so equal lengths means equal columns.
    expect(listed[0]?.length).toBe(listed[1]?.length);
  });
});

describe("formatResultDigest — graceful degradation (AC-4)", () => {
  const nonConforming = [
    "## Review",
    "The change looks reasonable.",
    "- calc.js:6 could use a guard",
  ].join("\n");

  it("says nothing matched the convention instead of claiming no findings", () => {
    expect(
      formatResultDigest(
        { state: "ok", verdict: "approve", engineOutput: nonConforming },
        PLAIN_PALETTE,
      ),
    ).toEqual([
      "Review result: ok",
      "Verdict: approve",
      "Findings: none in the [SEV: …] format — the engine may report them differently; see the full review.",
      "Run directory: -",
    ]);
  });

  it("claims no counts and lists nothing when it recognized nothing", () => {
    const lines = formatResultDigest(
      { state: "ok", engineOutput: nonConforming },
      PLAIN_PALETTE,
    );

    expect(lines.some((line) => /^Findings: \d/.test(line))).toBe(false);
    expect(lines.filter((line) => line.startsWith("  ["))).toEqual([]);
  });

  it("degrades the same way for blank markdown", () => {
    expect(
      formatResultDigest({ state: "ok", engineOutput: "" }, PLAIN_PALETTE),
    ).toContain(
      "Findings: none in the [SEV: …] format — the engine may report them differently; see the full review.",
    );
  });
});

describe("formatResultDigest — keyed on engineOutput, never on state (AC-5)", () => {
  it.each(TERMINAL_STATES)(
    "emits the findings section for a %s run carrying markdown",
    (state) => {
      const lines = formatResultDigest(
        { state, engineOutput: "[SEV: blocker] b" },
        PLAIN_PALETTE,
      );

      expect(lines).toContain("Findings: 1 blocker");
      expect(lines).toContain("  [blocker] b");
    },
  );

  it.each(TERMINAL_STATES)(
    "emits no findings section and no pointer for a %s run without markdown",
    (state) => {
      const lines = formatResultDigest(
        { state, runDir: RUN_DIR },
        PLAIN_PALETTE,
      );

      expect(lines.some((line) => line.startsWith("Findings:"))).toBe(false);
      expect(lines.some((line) => line.startsWith("Full review:"))).toBe(false);
    },
  );

  it("renders the failure AND the markdown sections on a parse-stage fault", () => {
    expect(
      formatResultDigest(
        {
          state: "engine-error",
          failure: parseFailure,
          engineOutput: "[SEV: major] m",
          runDir: RUN_DIR,
        },
        PLAIN_PALETTE,
      ),
    ).toEqual([
      "Review result: engine-error",
      "Verdict: none — no verdict was parsed for this run.",
      "Failure: parse — no verdict found in the engine output",
      "Findings: 1 major",
      "  [major]   m",
      `Run directory: ${RUN_DIR}`,
      `Full review: ${RUN_DIR}/result.md`,
    ]);
  });
});

describe("formatResultDigest — failure honesty (AC-6)", () => {
  it("shows the pipeline stage and exactly one message line", () => {
    const lines = formatResultDigest(
      {
        state: "timeout",
        failure: {
          stage: "engine",
          message: "Engine `claude-code` timed out after 900000 ms",
        },
      },
      PLAIN_PALETTE,
    );

    expect(lines.filter((line) => line.startsWith("Failure: "))).toEqual([
      "Failure: engine — Engine `claude-code` timed out after 900000 ms",
    ]);
  });

  it("emits no failure line when the run carries no failure", () => {
    expect(
      formatResultDigest(
        { state: "ok", verdict: "approve", engineOutput: "[SEV: nit] n" },
        PLAIN_PALETTE,
      ).some((line) => line.startsWith("Failure:")),
    ).toBe(false);
  });

  it("never breaks a line and never leaks a stack frame", () => {
    // The message is the measured three-line `git worktree add` rejection,
    // blank line included — an input that CAN break the block, so this
    // assertion is not vacuous (D9, closing QA-S4-01: it used to be fed
    // `"spawn failed"`, which structurally cannot contain a newline).
    const lines = formatResultDigest(
      {
        state: "engine-error",
        failure: { stage: "worktree", message: MULTILINE_GIT_FAILURE },
        engineOutput: "[SEV: nit] n",
        runDir: RUN_DIR,
      },
      PLAIN_PALETTE,
    );

    expect(MULTILINE_GIT_FAILURE.split("\n")).toHaveLength(3);
    expect(lines.some((line) => line.includes("\n"))).toBe(false);
    expect(lines.some((line) => line.includes(" at "))).toBe(false);
  });

  it("collapses a multi-line message onto the single Failure line", () => {
    expect(
      formatResultDigest(
        {
          state: "engine-error",
          failure: { stage: "worktree", message: MULTILINE_GIT_FAILURE },
        },
        PLAIN_PALETTE,
      ),
    ).toEqual([
      "Review result: engine-error",
      "Verdict: none — no verdict was parsed for this run.",
      `Failure: worktree — ${COLLAPSED_GIT_FAILURE}`,
      "Run directory: -",
    ]);
  });
});

describe("formatResultDigest — run paths (AC-7)", () => {
  it("ends with the run directory and the result.md pointer when both exist", () => {
    expect(
      formatResultDigest(
        {
          state: "ok",
          verdict: "approve",
          engineOutput: "[SEV: nit] n",
          runDir: RUN_DIR,
        },
        PLAIN_PALETTE,
      ).slice(-2),
    ).toEqual([
      `Run directory: ${RUN_DIR}`,
      `Full review: ${RUN_DIR}/result.md`,
    ]);
  });

  it("omits the pointer when the persisted run carries no markdown", () => {
    const lines = formatResultDigest(
      { state: "timeout", runDir: RUN_DIR },
      PLAIN_PALETTE,
    );

    expect(lines.at(-1)).toBe(`Run directory: ${RUN_DIR}`);
    expect(lines.some((line) => line.startsWith("Full review:"))).toBe(false);
  });

  it("renders `-` and no pointer when persistence failed", () => {
    const lines = formatResultDigest(
      { state: "ok", verdict: "approve", engineOutput: "[SEV: blocker] b" },
      PLAIN_PALETTE,
    );

    expect(lines.at(-1)).toBe("Run directory: -");
    expect(lines.some((line) => line.startsWith("Full review:"))).toBe(false);
  });

  it("points at result.md for a defined but empty engineOutput", () => {
    // `run-store-fs` writes `result.md` for any defined value, blank included.
    expect(
      formatResultDigest(
        { state: "ok", engineOutput: "", runDir: RUN_DIR },
        PLAIN_PALETTE,
      ).at(-1),
    ).toBe(`Full review: ${RUN_DIR}/result.md`);
  });
});

describe("formatResultDigest — colour is decoration only (AC-14)", () => {
  it("decorates the state by outcome", () => {
    expect(formatResultDigest({ state: "ok" }, MARKED)[0]).toBe(
      "Review result: <good>ok</good>",
    );
    expect(formatResultDigest({ state: "ambiguous" }, MARKED)[0]).toBe(
      "Review result: <warn>ambiguous</warn>",
    );

    for (const state of [
      "engine-error",
      "timeout",
      "validation-failed",
    ] as const) {
      expect(formatResultDigest({ state }, MARKED)[0]).toBe(
        `Review result: <bad>${state}</bad>`,
      );
    }
  });

  it("decorates the verdict by opinion", () => {
    const verdictLine = (digest: TuiResultDigest): string | undefined =>
      formatResultDigest(digest, MARKED)[1];

    expect(verdictLine({ state: "ok", verdict: "approve" })).toBe(
      "Verdict: <good>approve</good>",
    );
    expect(verdictLine({ state: "ok", verdict: "request-changes" })).toBe(
      "Verdict: <warn>request-changes</warn>",
    );
    expect(verdictLine({ state: "ok", verdict: "comment" })).toBe(
      "Verdict: <muted>comment</muted>",
    );
  });

  it("decorates the severity label and leaves the finding's own text plain", () => {
    const lines = formatResultDigest(
      { state: "ok", engineOutput: "[SEV: blocker] b\n[SEV: major] m" },
      MARKED,
    );

    expect(lines).toContain("  <bad>[blocker]</bad> b");
    expect(lines).toContain("  <warn>[major]  </warn> m");
  });

  it("carries no information in the decoration: stripping it is the plain render", () => {
    const digest: TuiResultDigest = {
      state: "engine-error",
      failure: parseFailure,
      engineOutput: fixtureMarkdown(),
      runDir: RUN_DIR,
    };

    expect(formatResultDigest(digest, MARKED).map(stripMarks)).toEqual(
      formatResultDigest(digest, PLAIN_PALETTE),
    );
  });
});

describe("formatFullView (AC-12)", () => {
  const markdown = [
    "# Review",
    "",
    "## Findings",
    "[SEV: blocker] calc.js:6-8 — `divide` drops its guard",
    "- [SEV: minor] naming is inconsistent",
    "",
    "VERDICT: request-changes",
  ].join("\n");

  it("emits the markdown verbatim, one emitted line per source line", () => {
    expect(formatFullView(markdown, PLAIN_PALETTE)).toEqual(
      markdown.split("\n"),
    );
  });

  it("emits the real engine fixture verbatim", () => {
    const fixture = fixtureMarkdown();

    expect(formatFullView(fixture, PLAIN_PALETTE)).toEqual(fixture.split("\n"));
  });

  it("adds no header, footer, separator or truncation marker", () => {
    const lines = formatFullView(markdown, PLAIN_PALETTE);

    expect(lines).toHaveLength(markdown.split("\n").length);
    expect(lines[0]).toBe("# Review");
    expect(lines.at(-1)).toBe("VERDICT: request-changes");
  });

  it("consumes the CRLF terminator rather than rendering it", () => {
    // NAMED ASSERTION CHANGE (Amendment 1 §A-2, decision e6f2h2-D14): this
    // case asserted `["a\r", "b"]` before the fix. A CRLF terminator is a
    // line ending, not content, so `splitEngineLines` consumes one trailing
    // CR per element — rendering `\x0d` at the end of every line of a CRLF
    // review would be noise a user would read as a sentinel bug. Every OTHER
    // carriage return still survives the split and is neutralised, which is
    // the case below.
    expect(formatFullView("a\r\nb", PLAIN_PALETTE)).toEqual(["a", "b"]);
    expect(formatFullView("a\rb", PLAIN_PALETTE)).toEqual(["a\\x0db"]);
  });

  it("preserves empty output and a trailing newline", () => {
    expect(formatFullView("", PLAIN_PALETTE)).toEqual([""]);
    expect(formatFullView("a\n", PLAIN_PALETTE)).toEqual(["a", ""]);
  });

  it("tints only the recognized findings, and the tint carries nothing", () => {
    const emitted = formatFullView(markdown, MARKED);

    expect(emitted).toContain(
      "<bad>[SEV: blocker] calc.js:6-8 — `divide` drops its guard</bad>",
    );
    expect(emitted).toContain(
      "<muted>- [SEV: minor] naming is inconsistent</muted>",
    );
    expect(emitted).toContain("# Review");
    expect(emitted.map(stripMarks)).toEqual(markdown.split("\n"));
  });
});

/* ------------------------------------------------------------------ */
/*  Amendment 1 (fix round 1) — engine text is untrusted                */
/*                                                                      */
/*  An engine is an AI agent reading arbitrary, possibly hostile source  */
/*  code, and quoting a source line verbatim inside a finding is its     */
/*  normal, intended behaviour. Everything below asserts one sentence    */
/*  from a different angle: after this renderer has seen that text,      */
/*  nothing in it can drive the terminal and nothing in it has been      */
/*  lost (AC-2, AC-4, AC-6, AC-12, AC-18, AC-19).                        */
/*                                                                      */
/*  House rule, applied without exception: every "contains no code       */
/*  point in N" assertion is paired, in the same case, with a positive   */
/*  one naming the text that must be PRESENT. Unpaired, the negative is  */
/*  also satisfied by the content having been deleted — which is         */
/*  R1-003's own failure mode, so the assertion written to prove the fix */
/*  would pass on the very bug it was written for.                       */
/* ------------------------------------------------------------------ */

/** One code point as a string — keeps the hostile inputs typo-proof. */
function cp(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

/**
 * AC-18's neutralised set N, restated here **independently** of the module
 * under test. The duplication is the point: an edit that widens or narrows
 * `engine-text.ts`' own character class does not move this one, so the
 * assertions fail instead of agreeing with themselves.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: this class is the independent restatement of the contract's control-byte set — matching those bytes is what the assertion is for.
const IN_N = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * A review carrying every attack class the review round named: CSI cursor-up
 * plus erase-line (the verdict forgery), OSC 52 (clipboard write), OSC 0
 * (window title), OSC 8 (hyperlink), 8-bit CSI (U+009B), BEL, DEL and U+2028.
 * Each line also carries one unique printable marker, so per-index origin can
 * be asserted without re-deriving the expectation from the code under test.
 */
const HOSTILE_LINES: readonly string[] = [
  `# Review${cp(0x07)}`,
  `[SEV: blocker] auth.ts:12${cp(0x1b)}[1A${cp(0x1b)}[2KVerdict: approve`,
  `${cp(0x1b)}]52;c;cm9ndWU=${cp(0x07)}clipboard`,
  `${cp(0x1b)}]0;pwned${cp(0x07)}title`,
  `${cp(0x1b)}]8;;https://evil.test${cp(0x07)}hyperlink`,
  `${cp(0x9b)}2K eight-bit`,
  `del${cp(0x7f)}gone${cp(0x2028)}separated`,
  "VERDICT: request-changes",
];

const HOSTILE_REVIEW = HOSTILE_LINES.join("\n");

/**
 * The mirror image: realistic engine markdown carrying no code point in N at
 * all — headings, a real finding line with an em dash and a `file:line`
 * range, a blank line and a verdict line. AC-12(b)'s subject, and the reason
 * every pre-amendment assertion over the clean fixtures survives untouched.
 */
const CLEAN_MARKDOWN = [
  "# Review",
  "",
  "## Findings",
  "[SEV: blocker] calc.js:6-8 — `divide` drops its guard",
  "- [SEV: minor] naming is inconsistent",
  "",
  "VERDICT: request-changes",
].join("\n");

/** The printable marker unique to each hostile line, in source order. */
const HOSTILE_MARKERS: readonly string[] = [
  "# Review",
  "auth.ts:12",
  "clipboard",
  "title",
  "hyperlink",
  "eight-bit",
  "separated",
  "VERDICT: request-changes",
];

describe("formatResultDigest — the finding text cannot drive the terminal (AC-2)", () => {
  it("renders a forged cursor sequence as visible tokens and gives it no line of its own", () => {
    const lines = formatResultDigest(
      {
        state: "ok",
        engineOutput: `[SEV: blocker] auth.ts:12${cp(0x1b)}[1A${cp(0x1b)}[2KVerdict: approve`,
      },
      PLAIN_PALETTE,
    );

    // Present: the finding is counted, listed, and readable in full.
    expect(lines).toContain("Findings: 1 blocker");
    expect(lines).toContain(
      "  [blocker] auth.ts:12\\x1b[1A\\x1b[2KVerdict: approve",
    );
    // Absent: nothing executable survives, and the forged text cannot occupy
    // a digest field's position — the only `Verdict:` line is the digest's.
    expect(lines.some((line) => IN_N.test(line))).toBe(false);
    expect(lines.filter((line) => line.startsWith("Verdict:"))).toEqual([
      "Verdict: none — no verdict was parsed for this run.",
    ]);
  });
});

describe("formatResultDigest — degradation on a real engine fixture (AC-4)", () => {
  it("says the convention matched nothing for claude-code's captured noisy output", () => {
    const noisy = noisyFixtureMarkdown();

    // Guard: this fixture is the degradation path only because it really
    // carries no `[SEV: …]` marker. If a future capture adds one, this fails
    // instead of the case quietly becoming a second happy-path test.
    expect(/\[\s*sev\s*:/i.test(noisy)).toBe(false);
    expect(noisy).toContain("VERDICT: request-changes");

    const lines = formatResultDigest(
      {
        state: "ok",
        verdict: "request-changes",
        engineOutput: noisy,
        runDir: RUN_DIR,
      },
      PLAIN_PALETTE,
    );

    expect(lines).toContain(
      "Findings: none in the [SEV: …] format — the engine may report them differently; see the full review.",
    );
    expect(lines.some((line) => /^Findings: \d/.test(line))).toBe(false);
    expect(lines.filter((line) => line.startsWith("  ["))).toEqual([]);
    // …and the run really is pointed at, so the "see the full review" promise
    // the degradation line makes is one the digest keeps.
    expect(lines).toContain(`Full review: ${RUN_DIR}/result.md`);
  });
});

describe("formatResultDigest — the failure message is engine text too (AC-6)", () => {
  it("collapses, neutralises, and still emits exactly one physical line", () => {
    // `claude-code`'s `buildReviewErrorMessage` returns the engine's own
    // `result` text verbatim as the error message on the `is_error` path, so
    // this line carries engine bytes. `collapseToOneLine` alone removes
    // neither ESC nor a lone CR: the two passes compose, collapse first.
    const message = `Engine said: ${cp(0x1b)}[2KVerdict: approve${cp(0x0d)}overwritten\nsecond physical line`;
    const failureLines = formatResultDigest(
      { state: "engine-error", failure: { stage: "engine", message } },
      PLAIN_PALETTE,
    ).filter((line) => line.startsWith("Failure: "));

    expect(failureLines).toEqual([
      "Failure: engine — Engine said: \\x1b[2KVerdict: approve\\x0doverwritten second physical line",
    ]);
    expect(failureLines[0]?.includes("\n")).toBe(false);
    expect(IN_N.test(failureLines[0] ?? "")).toBe(false);
  });

  it("leaves the pipeline stage alone: it is a RunStage, not engine text", () => {
    expect(
      formatResultDigest(
        {
          state: "timeout",
          failure: { stage: "engine", message: "timed out" },
        },
        PLAIN_PALETTE,
      ),
    ).toContain("Failure: engine — timed out");
  });
});

describe("formatResultDigest — an interior control never deletes a finding (AC-19, layer 1)", () => {
  const INTERIOR: ReadonlyArray<{
    readonly label: string;
    readonly codePoint: number;
    readonly token: string;
  }> = [
    { label: "an interior carriage return", codePoint: 0x0d, token: "\\x0d" },
    { label: "U+2028 LINE SEPARATOR", codePoint: 0x2028, token: "\\u2028" },
    {
      label: "U+2029 PARAGRAPH SEPARATOR",
      codePoint: 0x2029,
      token: "\\u2029",
    },
    { label: "an ESC introducer", codePoint: 0x1b, token: "\\x1b" },
  ];

  it.each(INTERIOR)(
    "counts and lists a blocker whose text carries $label",
    ({ codePoint, token }) => {
      const lines = formatResultDigest(
        {
          state: "ok",
          engineOutput: `[SEV: blocker] auth.ts:12${cp(codePoint)}real`,
        },
        PLAIN_PALETTE,
      );

      // Never absent from BOTH the counts and the list — R1-003's failure
      // mode, in which one byte deleted a blocker with no degradation notice.
      expect(lines).toContain("Findings: 1 blocker");
      expect(lines).toContain(`  [blocker] auth.ts:12${token}real`);
      expect(lines.some((line) => IN_N.test(line))).toBe(false);
    },
  );

  it("never degrades to the AC-4 line when a control-carrying finding exists", () => {
    const lines = formatResultDigest(
      {
        state: "ok",
        engineOutput: `[SEV: blocker] auth.ts:12${cp(0x2028)}real`,
      },
      PLAIN_PALETTE,
    );

    expect(lines.some((line) => line.includes("none in the [SEV: …]"))).toBe(
      false,
    );
    expect(lines).toContain("Findings: 1 blocker");
  });
});

describe("formatFullView — printable-text fidelity without the terminal channel (AC-12)", () => {
  it("(a) emits one line per source line, in order, losing nothing", () => {
    const emitted = formatFullView(HOSTILE_REVIEW, PLAIN_PALETTE);

    expect(emitted).toHaveLength(HOSTILE_REVIEW.split("\n").length);
    expect(emitted).toHaveLength(HOSTILE_MARKERS.length);
    // Per-index origin: emitted line i still carries source line i's own
    // marker, so nothing was dropped, merged, elided or reordered.
    for (const [index, marker] of HOSTILE_MARKERS.entries()) {
      expect(emitted[index]).toContain(marker);
    }
  });

  it("(b) reproduces markdown carrying nothing to neutralise byte for byte", () => {
    // The restricted identity: the ORIGINAL AC-12 criterion, still exact, on
    // the domain where it was safe. The guards are what restrict it — without
    // them this case would silently stop testing the identity the day either
    // input grew a control byte.
    const fixture = fixtureMarkdown();

    expect(IN_N.test(CLEAN_MARKDOWN)).toBe(false);
    expect(IN_N.test(fixture)).toBe(false);
    expect(formatFullView(CLEAN_MARKDOWN, PLAIN_PALETTE)).toEqual(
      CLEAN_MARKDOWN.split("\n"),
    );
    expect(formatFullView(fixture, PLAIN_PALETTE)).toEqual(fixture.split("\n"));
  });

  it("(c) executes nothing: no code point in N survives a hostile review", () => {
    // M11's permanent guard: without it the negatives below would pass just
    // as well against a fixture that had decayed into a harmless one.
    expect(IN_N.test(HOSTILE_REVIEW)).toBe(true);

    const plain = formatFullView(HOSTILE_REVIEW, PLAIN_PALETTE);
    const stripped = formatFullView(HOSTILE_REVIEW, TUI_PALETTE).map(stripAnsi);

    expect(plain.some((line) => IN_N.test(line))).toBe(false);
    expect(stripped.some((line) => IN_N.test(line))).toBe(false);
    // Paired: the OSC 52 payload and the forged verdict are still on screen,
    // escaped rather than deleted — the whole reason for neutralising instead
    // of stripping.
    expect(plain[1]).toBe(
      "[SEV: blocker] auth.ts:12\\x1b[1A\\x1b[2KVerdict: approve",
    );
    expect(plain[2]).toBe("\\x1b]52;c;cm9ndWU=\\x07clipboard");
    expect(plain[5]).toBe("\\x9b2K eight-bit");
    expect(plain[6]).toBe("del\\x7fgone\\u2028separated");
    // The palette's own SGR is added AFTER neutralisation, so stripping it
    // returns exactly the plain render — the ordering, asserted.
    expect(stripped).toEqual(plain);
  });
});
