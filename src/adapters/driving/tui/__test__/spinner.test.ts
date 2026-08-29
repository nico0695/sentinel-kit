/**
 * Regression suite for the owned TUI spinner (`[E6.F2.H1]` fix round 1,
 * ledger findings R1-001/R1-002).
 *
 * Clack's `spinner().start()` called `block()` from `@clack/core`, which
 * (a) put stdin in raw mode with a keypress handler whose cancel branch
 * (Ctrl+C / Escape) was a bare `process.exit(0)`, and (b) registered five
 * process listeners (`SIGINT`, `SIGTERM`, `exit`, `uncaughtExceptionMonitor`,
 * `unhandledRejection`) whose SIGINT/SIGTERM path swallowed the first
 * externally delivered termination signal. Under an active spinner (branch
 * fetch, or the up-to-10-minute engine run) that orphaned the execa engine
 * child, skipped `runReview`'s in-process worktree cleanup and `persistRun`,
 * and reported success.
 *
 * The owned spinner must therefore be provably inert outside its sink:
 *
 * 1. zero process signal/lifecycle listeners across start/stop — red against
 *    the clack-backed spinner, which registered all five unconditionally;
 * 2. zero stdin involvement — `block()` added its `keypress` listener even in
 *    a non-TTY process, so this is red pre-fix too. (A `setRawMode` spy is
 *    deliberately NOT the proof: clack guarded it with `isTTY`, so it would
 *    be vacuously green in CI.)
 * 3. rendering goes through the injected sink only: frames while running,
 *    the final text on `stop`, and nothing after `stop` (interval cleared).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createClackPrompter } from "../clack-prompter.js";

/** The five events clack's spinner used to listen on (R1-001/R1-002). */
const PROCESS_EVENTS = [
  "SIGINT",
  "SIGTERM",
  "exit",
  "uncaughtExceptionMonitor",
  "unhandledRejection",
] as const;

function processListenerCounts(): Record<string, number> {
  return Object.fromEntries(
    PROCESS_EVENTS.map((event) => [event, process.listenerCount(event)]),
  );
}

function stdinListenerCounts(): Record<string, number> {
  return {
    keypress: process.stdin.listenerCount("keypress"),
    data: process.stdin.listenerCount("data"),
  };
}

interface CapturingSink {
  readonly chunks: string[];
  write(chunk: string): void;
}

/** A spinner output sink that keeps every chunk instead of writing it. */
function createCapturingSink(): CapturingSink {
  const chunks: string[] = [];
  return {
    chunks,
    write: (chunk: string) => {
      chunks.push(chunk);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("owned spinner: process isolation (R1-001, R1-002)", () => {
  it("registers no process signal or lifecycle listeners across start/stop", () => {
    const sink = createCapturingSink();
    const before = processListenerCounts();

    const spinner = createClackPrompter({ spinnerOutput: sink }).spinner();
    spinner.start("Working");
    expect(processListenerCounts()).toEqual(before);

    spinner.stop("Done");
    expect(processListenerCounts()).toEqual(before);
  });

  it("never touches stdin (no keypress or data listeners)", () => {
    const sink = createCapturingSink();
    const before = stdinListenerCounts();

    const spinner = createClackPrompter({ spinnerOutput: sink }).spinner();
    spinner.start("Working");
    expect(stdinListenerCounts()).toEqual(before);

    spinner.stop();
    expect(stdinListenerCounts()).toEqual(before);
  });
});

describe("owned spinner: rendering contract", () => {
  it("writes an immediate frame on start and further frames on the interval", () => {
    vi.useFakeTimers();
    const sink = createCapturingSink();
    const spinner = createClackPrompter({ spinnerOutput: sink }).spinner();

    spinner.start("Running review");
    expect(sink.chunks.length).toBe(1);
    expect(sink.chunks[0]).toContain("Running review");

    vi.advanceTimersByTime(500);
    expect(sink.chunks.length).toBeGreaterThan(1);
    for (const chunk of sink.chunks) {
      expect(chunk).toContain("Running review");
    }

    spinner.stop("Review finished");
  });

  it("writes the final text on stop and nothing afterwards", () => {
    vi.useFakeTimers();
    const sink = createCapturingSink();
    const spinner = createClackPrompter({ spinnerOutput: sink }).spinner();

    spinner.start("Fetching branches");
    vi.advanceTimersByTime(200);
    spinner.stop("Branches fetched");

    const last = sink.chunks.at(-1);
    expect(last).toContain("Branches fetched");
    expect(last?.endsWith("\n")).toBe(true);

    const settled = sink.chunks.length;
    vi.advanceTimersByTime(2_000);
    expect(sink.chunks.length).toBe(settled);
  });

  it("stop without text only clears the line and stops the frames", () => {
    vi.useFakeTimers();
    const sink = createCapturingSink();
    const spinner = createClackPrompter({ spinnerOutput: sink }).spinner();

    spinner.start("Working");
    spinner.stop();

    const settled = sink.chunks.length;
    vi.advanceTimersByTime(2_000);
    expect(sink.chunks.length).toBe(settled);
  });
});
