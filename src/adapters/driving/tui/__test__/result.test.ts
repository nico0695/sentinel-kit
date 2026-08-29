/**
 * The minimal result step and persistence (AC-7, AC-8, AC-12).
 *
 * Two contracts under guard:
 *
 * - **AC-7 / H1-H2 boundary**: the result block is exactly state, verdict
 *   when present, and run directory — asserted as the literal tail of
 *   `stdout`, so no markdown or severity rendering can slip in unnoticed.
 * - **AC-8**: `persistRun` runs exactly once per completed run whatever the
 *   terminal state; when it throws, the outcome is still shown with `-` for
 *   the run directory, a no-history diagnostic lands on `stderr`, and the
 *   exit code is non-zero. A completed AND persisted run exits 0 regardless
 *   of terminal state (design §Interfaces, recorded A-level decision).
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
import { PLAIN_PALETTE, type TuiPalette } from "../colors.js";
import {
  formatFullView,
  formatResultDigest,
  formatTuiResult,
  type TuiResultDigest,
} from "../render.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
} from "./tui-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

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
  run(): Promise<number>;
}

function harness(
  options: {
    readonly result?: RunReviewResult;
    readonly record?: RunRecord;
    readonly persistRunFails?: unknown;
  } = {},
): ResultHarness {
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];

  const deps = createTuiTestDeps({
    prompter: createScriptedPrompter([
      answer("owner/repo"),
      answer("feature"),
      answer("pr-review"),
      answer(true),
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
      runReview: (request) => {
        runReviewRequests.push(request);
        return Promise.resolve(options.result ?? okResult);
      },
      persistRun: (request) => {
        persistRunRequests.push(request);
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
    run: () => createTui(deps).run(),
  };
}

describe("formatTuiResult (AC-7)", () => {
  it("renders state, verdict and run directory when all are present", () => {
    expect(formatTuiResult("ok", "approve", RUN_DIR)).toEqual([
      "State: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
  });

  it("omits the verdict line when no verdict exists", () => {
    expect(formatTuiResult("timeout", undefined, RUN_DIR)).toEqual([
      "State: timeout",
      `Run directory: ${RUN_DIR}`,
    ]);
  });

  it("renders `-` rather than fabricating a run directory", () => {
    expect(formatTuiResult("ok", "approve")).toEqual([
      "State: ok",
      "Verdict: approve",
      "Run directory: -",
    ]);
  });
});

describe("result step per terminal state (AC-7, AC-8)", () => {
  const failedStates: readonly TerminalState[] = [
    "ambiguous",
    "engine-error",
    "timeout",
    "validation-failed",
  ];

  it("renders the minimal block and exits 0 for a persisted ok run", async () => {
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    // The literal tail of stdout IS the minimal block — nothing rendered
    // after it, no markdown, no severities (H1/H2 boundary).
    expect(h.deps.io.out.slice(-3)).toEqual([
      "State: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
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
      expect(h.deps.io.out.slice(-2)).toEqual([
        `State: ${state}`,
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
});

describe("persistence failure (AC-8, D13 mirror)", () => {
  const writeFailed = new Error("Failed to persist run at /runs/owner__repo");

  it("still shows the outcome, with `-` for the run directory", async () => {
    const h = harness({ persistRunFails: writeFailed });

    await h.run();

    expect(h.deps.io.out.slice(-3)).toEqual([
      "State: ok",
      "Verdict: approve",
      "Run directory: -",
    ]);
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
    expect(h.deps.io.out.slice(-2)).toEqual([
      "State: engine-error",
      "Run directory: -",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  `[E6.F2.H2]` (#39) — the pure digest and full-view renderers       */
/*                                                                     */
/*  Nothing below drives the flow: these are string-in / strings-out    */
/*  functions, given `PLAIN_PALETTE` so the assertions compare exact    */
/*  strings and can never inherit the ambient, `CI`-dependent colour    */
/*  decision (AC-14). The flow half of these ACs lands with the call    */
/*  sites; the four literal-tail assertions above still pin H1's        */
/*  surface until then.                                                */
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

/**
 * Role markers instead of ANSI. A palette whose output is readable makes two
 * things assertable that `PLAIN_PALETTE` cannot: that the renderer really
 * uses the palette it is given (otherwise every plain assertion here would
 * pass vacuously), and that stripping the decoration reproduces the plain
 * render exactly — "colour is decoration only", as an equality.
 */
const MARKED: TuiPalette = {
  good: (text) => `<good>${text}</good>`,
  warn: (text) => `<warn>${text}</warn>`,
  bad: (text) => `<bad>${text}</bad>`,
  muted: (text) => `<muted>${text}</muted>`,
};

/** Undoes {@link MARKED}. */
function stripMarks(line: string): string {
  return line.replace(/<\/?(?:good|warn|bad|muted)>/g, "");
}

/** The `result` text of the real claude-code fixture: 1 major, 1 minor. */
function fixtureMarkdown(): string {
  const raw = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../fixtures/claude-code/valid-verdict.json",
        import.meta.url,
      ),
    ),
    "utf-8",
  );

  return (JSON.parse(raw) as { readonly result: string }).result;
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
    const lines = formatResultDigest(
      {
        state: "engine-error",
        failure: { stage: "engine", message: "spawn failed" },
        engineOutput: "[SEV: nit] n",
        runDir: RUN_DIR,
      },
      PLAIN_PALETTE,
    );

    expect(lines.some((line) => line.includes("\n"))).toBe(false);
    expect(lines.some((line) => line.includes(" at "))).toBe(false);
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

  it("keeps carriage returns intact on CRLF output", () => {
    expect(formatFullView("a\r\nb", PLAIN_PALETTE)).toEqual(["a\r", "b"]);
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
