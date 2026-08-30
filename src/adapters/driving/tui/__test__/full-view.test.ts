/**
 * The opt-in full view: the one post-run prompt and everything it may not do
 * (`[E6.F2.H2]`, #39; AC-8, AC-9, AC-10, AC-12, AC-13, AC-14).
 *
 * The prompt is the first interaction this flow has ever placed *after* a
 * real run, so the suite is organised around what it must leave alone:
 *
 * - **It asks once, or not at all.** Non-blank engine output gets exactly one
 *   `confirm`; yes prints the markdown verbatim, no and cancel print nothing
 *   further (AC-8). Absent or blank output asks nothing — proved
 *   structurally, by scripting exactly the four pre-run answers so a fifth
 *   prompt would exhaust the script and throw (AC-9).
 * - **It cannot move the exit code.** The 3×2 matrix below runs
 *   accept / decline / cancel against both the persisted and the
 *   persist-failure branch: the code stays 0 and 1 respectively, and the
 *   digest already on screen is byte-identical in all six (AC-10).
 * - **It hides nothing.** A 500-line output is emitted in full, with no
 *   pager, no truncation marker and no second prompt (AC-13).
 *
 * The palette block at the end proves AC-14's "colour is decoration only"
 * against the deterministic `MARKED` palette, not against the ambient
 * `TUI_PALETTE` (AC-20, ledger R3-002). The earlier version asserted that
 * the *real* palette decorates and that stripping undoes it, and claimed to
 * be env-independent; it was the opposite. With `CI` and `FORCE_COLOR`
 * unset — the mandated local `npm test` gate — `picocolors` binds all four
 * roles to the global `String`, so every one of those assertions reduced to
 * `x === x` and would have passed just as well against `PLAIN_PALETTE`. The
 * rewritten cases decorate unconditionally and therefore mean the same thing
 * under `NO_COLOR=1` and `FORCE_COLOR=1`. Exactly one case still names the
 * real palette, and it is labelled as the env-dependent one.
 */

import { describe, expect, it } from "vitest";
import type {
  PersistRunRequest,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type { RunReviewResult } from "../../../../core/run/index.js";
import { PLAIN_PALETTE, TUI_PALETTE } from "../colors.js";
import { formatFullView, formatResultDigest } from "../render.js";
import type { PromptOutcome } from "../tui-deps.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  cancel,
  createScriptedPrompter,
  createTuiTestDeps,
  MARKED,
  stripAnsi,
  stripMarks,
} from "./tui-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

/** The one post-run prompt this story adds. */
const FULL_VIEW_PROMPT = "Show the full review output?";

/**
 * A review the engine wrote: prose, a recognized blocker, a list-prefixed
 * minor, a blank line and a verdict line. Enough shapes that "verbatim" is a
 * real claim — the blank line and the leading `- ` both survive.
 */
const MARKDOWN = [
  "# Review",
  "",
  "## Findings",
  "[SEV: blocker] calc.js:6-8 — `divide` drops its zero guard",
  "- [SEV: minor] naming is inconsistent",
  "",
  "VERDICT: request-changes",
].join("\n");

const MARKDOWN_LINES = MARKDOWN.split("\n");

/** One code point as a string — keeps the hostile input typo-proof. */
function cp(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

/**
 * AC-18's neutralised set N, restated independently of the module under test
 * so that widening or narrowing `engine-text.ts`' own class fails a case here
 * instead of agreeing with itself. Used only for the negative half of an
 * assertion, never on its own.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: this class is the independent restatement of the contract's control-byte set — matching those bytes is what the assertion is for.
const IN_N = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

const baseRecord: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  verdict: "request-changes",
  engine: "claude-code",
};

interface FullViewHarnessOptions {
  /** The engine's markdown, on both the result and the record. */
  readonly engineOutput?: string;
  /** Answers scripted AFTER the four pre-run ones. */
  readonly answers?: ReadonlyArray<PromptOutcome<boolean>>;
  readonly persistRunFails?: boolean;
}

interface FullViewHarness {
  readonly deps: ReturnType<typeof createTuiTestDeps>;
  readonly persistRunRequests: PersistRunRequest[];
  run(): Promise<number>;
  /** Every captured stdout line, ANSI stripped (AC-14). */
  stdout(): readonly string[];
}

const PERSIST_FAILURE = new Error("Failed to persist run at /runs/owner__repo");

/**
 * A completed `ok` run that reached the result step, with the four pre-run
 * answers already scripted. `exactOptionalPropertyTypes` is on, so the
 * markdown is spread conditionally rather than set to `undefined`.
 */
function harness(options: FullViewHarnessOptions = {}): FullViewHarness {
  const persistRunRequests: PersistRunRequest[] = [];

  const result: RunReviewResult = {
    state: "ok",
    verdict: "request-changes",
    cleanup: { attempted: true, removed: true, reason: "policy-always" },
    engineName: "claude-code",
    ...(options.engineOutput !== undefined
      ? { engineOutput: options.engineOutput }
      : {}),
  };

  const record: RunRecord = {
    ...baseRecord,
    ...(options.engineOutput !== undefined
      ? { engineOutput: options.engineOutput }
      : {}),
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
    deps,
    persistRunRequests,
    run: () => createTui(deps).run(),
    stdout: () => deps.io.out.map(stripAnsi),
  };
}

/** What the digest renders for this harness, on each branch. */
function expectedDigest(options: {
  readonly persisted: boolean;
  readonly engineOutput?: string;
}): readonly string[] {
  return formatResultDigest(
    {
      state: "ok",
      verdict: "request-changes",
      ...(options.engineOutput !== undefined
        ? { engineOutput: options.engineOutput }
        : {}),
      ...(options.persisted ? { runDir: RUN_DIR } : {}),
    },
    PLAIN_PALETTE,
  );
}

describe("the post-run full-view prompt (AC-8)", () => {
  it("asks exactly one confirm, after the digest, and prints the markdown on yes", async () => {
    const h = harness({
      engineOutput: MARKDOWN,
      answers: [answer(true)],
    });

    const code = await h.run();

    expect(code).toBe(0);
    // Five prompts: the four pre-run ones and this story's single addition.
    expect(h.deps.prompter.prompts).toHaveLength(5);
    expect(h.deps.prompter.prompts.at(-1)).toEqual({
      kind: "confirm",
      message: FULL_VIEW_PROMPT,
    });
    // The digest first, then the full view — the prompt cannot have been
    // asked before the outcome was on screen.
    const tail = [
      ...expectedDigest({ persisted: true, engineOutput: MARKDOWN }),
      ...MARKDOWN_LINES,
    ];
    expect(h.stdout().slice(-tail.length)).toEqual(tail);
  });

  it("prints nothing further when the full view is declined", async () => {
    const h = harness({
      engineOutput: MARKDOWN,
      answers: [answer(false)],
    });

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.deps.prompter.prompts).toHaveLength(5);
    // The digest is the LAST thing on stdout: anything printed after it
    // would displace this tail.
    const digest = expectedDigest({ persisted: true, engineOutput: MARKDOWN });
    expect(h.stdout().slice(-digest.length)).toEqual(digest);
    expect(h.stdout()).not.toContain("VERDICT: request-changes");
  });

  it("prints nothing further when the prompt is cancelled", async () => {
    const h = harness({ engineOutput: MARKDOWN, answers: [cancel()] });

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.deps.prompter.prompts).toHaveLength(5);
    const digest = expectedDigest({ persisted: true, engineOutput: MARKDOWN });
    expect(h.stdout().slice(-digest.length)).toEqual(digest);
    expect(h.stdout()).not.toContain("VERDICT: request-changes");
  });

  it("offers the full view on the persist-failure branch too, from the run in memory", async () => {
    // Spec A6: the branch where the markdown exists nowhere on disk — no
    // `result.md` was written, so withholding it here would be the worst
    // place to withhold it.
    const h = harness({
      engineOutput: MARKDOWN,
      answers: [answer(true)],
      persistRunFails: true,
    });

    const code = await h.run();

    expect(code).toBe(1);
    expect(h.deps.prompter.prompts).toHaveLength(5);
    expect(h.stdout().slice(-MARKDOWN_LINES.length)).toEqual(MARKDOWN_LINES);
    // …and the two H1 diagnostics are still the whole of stderr.
    expect(h.deps.io.err).toHaveLength(2);
  });
});

describe("nothing to show, nothing asked (AC-9)", () => {
  it("asks no post-run prompt when the completed run carries no engine output", async () => {
    // Scripted with exactly the four pre-run answers: a fifth prompt would
    // exhaust the script and throw, so the absence is structural.
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    expect(h.deps.prompter.prompts).toHaveLength(4);
    expect(h.deps.prompter.prompts.at(-1)?.message).toBe("Run this review?");
    expect(h.deps.io.err).toEqual([]);
  });

  it.each(["", " ", "   \n\t\n  ", "\n"])(
    "asks no post-run prompt for blank engine output %j",
    async (engineOutput) => {
      const h = harness({ engineOutput });

      const code = await h.run();

      expect(code).toBe(0);
      expect(h.deps.prompter.prompts).toHaveLength(4);
    },
  );

  it("asks nothing on the persist-failure branch either when there is no output", async () => {
    const h = harness({ persistRunFails: true });

    const code = await h.run();

    expect(code).toBe(1);
    expect(h.deps.prompter.prompts).toHaveLength(4);
  });

  it("still points at result.md for a defined but empty engine output", async () => {
    // Spec A9, deliberate and load-bearing asymmetry: the prompt promises
    // content, so it needs non-blank markdown; the path line promises a
    // file, and `run-store-fs` writes `result.md` for any defined value.
    // Each condition mirrors what it promises.
    const h = harness({ engineOutput: "" });

    await h.run();

    expect(h.stdout().at(-1)).toBe(`Full review: ${RUN_DIR}/result.md`);
    expect(h.deps.prompter.prompts).toHaveLength(4);
  });
});

describe("the answer cannot change the outcome (AC-10)", () => {
  const answers: ReadonlyArray<{
    readonly label: string;
    readonly outcome: PromptOutcome<boolean>;
  }> = [
    { label: "accepted", outcome: answer(true) },
    { label: "declined", outcome: answer(false) },
    { label: "cancelled", outcome: cancel() },
  ];

  const branches: ReadonlyArray<{
    readonly branchLabel: string;
    readonly persistRunFails: boolean;
    readonly code: number;
  }> = [
    { branchLabel: "persisted", persistRunFails: false, code: 0 },
    { branchLabel: "persist-failure", persistRunFails: true, code: 1 },
  ];

  const matrix = branches.flatMap((branch) =>
    answers.map((answered) => ({ ...branch, ...answered })),
  );

  it.each(matrix)(
    "exits $code on the $branchLabel path with the full view $label",
    async ({ outcome, persistRunFails, code, label }) => {
      const h = harness({
        engineOutput: MARKDOWN,
        answers: [outcome],
        persistRunFails,
      });

      // The exit code is a function of (completed, persisted) and nothing
      // else — the prompt is asked in all six cells and never consulted.
      expect(await h.run()).toBe(code);
      expect(h.persistRunRequests).toHaveLength(1);
      expect(h.deps.prompter.prompts).toHaveLength(5);

      // …and the digest already rendered is identical across the three
      // answers: only what follows it differs.
      const digest = expectedDigest({
        persisted: !persistRunFails,
        engineOutput: MARKDOWN,
      });
      const printed = h.stdout();
      const end =
        label === "accepted"
          ? printed.length - MARKDOWN_LINES.length
          : printed.length;
      expect(printed.slice(end - digest.length, end)).toEqual(digest);
    },
  );
});

describe("the full view is the engine's own markdown (AC-12)", () => {
  it("reproduces the source lines exactly once the colour is stripped", async () => {
    const h = harness({ engineOutput: MARKDOWN, answers: [answer(true)] });

    await h.run();

    // Exactly as many lines follow the digest as the source has: no
    // heading, no separator, no footer, no line numbers, no truncation
    // marker — anything added would push the digest out of this slice.
    const digest = expectedDigest({ persisted: true, engineOutput: MARKDOWN });
    expect(h.stdout().slice(-(digest.length + MARKDOWN_LINES.length))).toEqual([
      ...digest,
      ...MARKDOWN_LINES,
    ]);
  });

  it("emits it through the same renderer the pure tests pin", async () => {
    const h = harness({ engineOutput: MARKDOWN, answers: [answer(true)] });

    await h.run();

    expect(h.stdout().slice(-MARKDOWN_LINES.length)).toEqual(
      formatFullView(MARKDOWN, PLAIN_PALETTE),
    );
  });
});

describe("no pager and no truncation (AC-13)", () => {
  const LONG_OUTPUT_LINES = Array.from(
    { length: 500 },
    (_unused, index) => `[SEV: nit] finding ${index + 1}`,
  );

  it("emits a 500-line output in full, with no marker and no further prompt", async () => {
    const h = harness({
      engineOutput: LONG_OUTPUT_LINES.join("\n"),
      answers: [answer(true)],
    });

    const code = await h.run();

    expect(code).toBe(0);
    const emitted = h.stdout().slice(-LONG_OUTPUT_LINES.length);
    expect(emitted).toHaveLength(500);
    expect(emitted).toEqual(LONG_OUTPUT_LINES);
    // The last source line really is the last thing printed — a truncation
    // marker or a footer would sit after it.
    expect(h.stdout().at(-1)).toBe("[SEV: nit] finding 500");
    // One prompt for the full view, and no sixth prompt to page it.
    expect(h.deps.prompter.prompts).toHaveLength(5);
  });

  it("emits all 500 lines when one of them carries a control sequence", async () => {
    // Amendment 1 (AC-13, AC-12(a)): neutralisation must never become
    // truncation. It changes bytes INSIDE a line, never the presence, count
    // or order of lines, and it applies no length cap — so a pathological
    // line is emitted whole rather than cut.
    const forged = `[SEV: nit] finding 7${cp(0x1b)}[2Kforged`;
    const lines = LONG_OUTPUT_LINES.map((line, index) =>
      index === 6 ? forged : line,
    );
    const h = harness({
      engineOutput: lines.join("\n"),
      answers: [answer(true)],
    });

    const code = await h.run();

    expect(code).toBe(0);
    const emitted = h.stdout().slice(-lines.length);
    expect(emitted).toHaveLength(500);
    // Present: the injected line is still there, in its own position, whole
    // and readable — escaped rather than dropped or shortened.
    expect(emitted[6]).toBe("[SEV: nit] finding 7\\x1b[2Kforged");
    expect(emitted[5]).toBe("[SEV: nit] finding 6");
    expect(emitted[7]).toBe("[SEV: nit] finding 8");
    // Absent: nothing executable, and still no marker after the last line.
    expect(emitted.some((line) => IN_N.test(line))).toBe(false);
    expect(h.stdout().at(-1)).toBe("[SEV: nit] finding 500");
    expect(h.deps.prompter.prompts).toHaveLength(5);
  });
});

describe("colour is decoration, whatever the terminal decided (AC-14, AC-20)", () => {
  const ROLES = ["good", "warn", "bad", "muted"] as const;

  // What this block proves, and what it deliberately does not.
  //
  // "Colour is decoration only" has two halves: the renderer really uses the
  // palette it is handed, and removing the decoration loses nothing. Both
  // halves need a palette that decorates. `TUI_PALETTE` is not one under the
  // mandated local gate: `picocolors` decides once at load time and, with
  // `CI` and `FORCE_COLOR` unset, binds `good`/`warn`/`bad`/`muted` to the
  // global `String`, so `TUI_PALETTE.good("x") === "x"` and the whole block
  // used to assert nothing (R3-002). `MARKED` decorates in every
  // environment, so these cases carry the same weight locally and in CI.
  //
  // Each case therefore pairs a POSITIVE assertion — this exact decorated
  // string is present — with the round-trip. The positive half is what a
  // mutation to `PLAIN_PALETTE` turns red (M12); the round-trip alone would
  // survive it, which is precisely how the old block passed on the defect.
  //
  // The last case is the exception and says so: it is the env-dependent one,
  // meaningful only where colour is actually on.

  it.each(ROLES)(
    "the marking palette's %s role decorates, and stripping undoes it",
    (role) => {
      const decorated = MARKED[role]("sentinel");

      // Present: decoration really happened, with this exact shape.
      expect(decorated).toBe(`<${role}>sentinel</${role}>`);
      // Absent: nothing of it survives the strip, and nothing else is lost.
      expect(stripMarks(decorated)).toBe("sentinel");
    },
  );

  it.each(ROLES)("the plain palette's %s role is the identity", (role) => {
    expect(PLAIN_PALETTE[role]("sentinel")).toBe("sentinel");
  });

  it("removes SGR sequences rather than merely returning its input", () => {
    // Without this, the two assertions above would both hold for a
    // `stripAnsi` that did nothing at all.
    expect(stripAnsi("\u001b[31mred\u001b[39m")).toBe("red");
    expect(stripAnsi("\u001b[1m\u001b[32mbold green\u001b[39m\u001b[22m")).toBe(
      "bold green",
    );
  });

  it("renders the digest identically once the decoration is stripped", () => {
    const digest = {
      state: "engine-error",
      failure: { stage: "parse", message: "no verdict found" },
      engineOutput: MARKDOWN,
      runDir: RUN_DIR,
    } as const;

    const decorated = formatResultDigest(digest, MARKED);

    // Present: the renderer used the palette it was given, on the facts
    // AC-14 names — the state, the failure line, and the listed blocker.
    expect(decorated[0]).toBe("Review result: <bad>engine-error</bad>");
    expect(decorated[2]).toBe("Failure: <bad>parse — no verdict found</bad>");
    expect(
      decorated.some((line) => line.includes("<bad>[blocker]</bad>")),
    ).toBe(true);
    // Absent: once the decoration is removed, nothing distinguishes it from
    // the plain render — every fact colour carried is still plain text.
    expect(decorated.map(stripMarks)).toEqual(
      formatResultDigest(digest, PLAIN_PALETTE),
    );
  });

  it("renders the full view identically once the decoration is stripped", () => {
    const decorated = formatFullView(MARKDOWN, MARKED);

    // Present: the recognized findings are tinted by severity — blocker as
    // `bad`, minor as `muted` — and the whole source line is decorated.
    expect(decorated[3]).toBe(`<bad>${MARKDOWN_LINES[3]}</bad>`);
    expect(decorated[4]).toBe(`<muted>${MARKDOWN_LINES[4]}</muted>`);
    // Absent: no decoration survives the strip, and the source lines come
    // back byte for byte — including the prose lines nothing tinted.
    expect(decorated.map(stripMarks)).toEqual(MARKDOWN_LINES);
  });

  it("keeps the real palette strippable — the ENV-DEPENDENT case", () => {
    // Deliberately kept, deliberately labelled. This is the one case whose
    // strength depends on the ambient decision: where colour is off it is a
    // no-op comparison, and where it is on (`FORCE_COLOR=1`, or any run that
    // sets `CI`) it is the real check that `stripAnsi` removes exactly what
    // `TUI_PALETTE` added and no more. It is what makes the AC-14 dual run
    // meaningful; it is NOT what proves decoration, which is the deterministic
    // work above.
    const digest = {
      state: "engine-error",
      failure: { stage: "parse", message: "no verdict found" },
      engineOutput: MARKDOWN,
      runDir: RUN_DIR,
    } as const;

    expect(formatResultDigest(digest, TUI_PALETTE).map(stripAnsi)).toEqual(
      formatResultDigest(digest, PLAIN_PALETTE),
    );
    expect(formatFullView(MARKDOWN, TUI_PALETTE).map(stripAnsi)).toEqual(
      MARKDOWN_LINES,
    );
  });
});
