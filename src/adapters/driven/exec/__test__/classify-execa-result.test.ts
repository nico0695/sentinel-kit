import { describe, expect, it } from "vitest";
import { ProcessSpawnError, RunError } from "../../../../core/run/index.js";
import {
  classifyExecaResult,
  type ExecaLikeResult,
} from "../classify-execa-result.js";

const BUDGET = 1024;
const TIMEOUT_MS = 5000;

describe("classifyExecaResult", () => {
  it("classifies a clean exit (AC-8)", () => {
    const result: ExecaLikeResult = {
      stdout: "hello\n",
      stderr: "",
      exitCode: 0,
      isMaxBuffer: false,
    };

    expect(classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10)).toEqual({
      stdout: "hello\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  });

  it("resolves (does not throw) a non-zero exit (AC-10, AC-16)", () => {
    // ExecaLikeResult has no `failed`-shaped field at all — a classifier
    // that tried to branch on one would not compile. This proves the "is
    // this a failure" question is answered purely by exitCode/signal
    // presence, never by an execa-style `failed` flag.
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "boom",
      exitCode: 1,
      isMaxBuffer: false,
    };

    const classified = classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);

    expect(classified.exitCode).toBe(1);
    expect(classified.timedOut).toBe(false);
  });

  it("classifies signal-termination with no exit code (AC-9)", () => {
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "",
      signal: "SIGKILL",
      isMaxBuffer: false,
    };

    const classified = classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);

    expect(classified.signal).toBe("SIGKILL");
    // exactOptionalPropertyTypes-aware: absent key, not `=== undefined`.
    expect("exitCode" in classified).toBe(false);
  });

  it("throws ProcessSpawnError when the process never ran (ENOENT) (AC-14)", () => {
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "",
      isMaxBuffer: false,
      code: "ENOENT",
    };

    let thrown: unknown;
    try {
      classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProcessSpawnError);
    expect(thrown).toBeInstanceOf(RunError);
    expect((thrown as ProcessSpawnError).cause).toBe(result);
  });

  it("throws ProcessSpawnError when the process never ran (EACCES) (AC-14)", () => {
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "",
      isMaxBuffer: false,
      code: "EACCES",
    };

    expect(() => classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10)).toThrow(
      ProcessSpawnError,
    );
  });

  it("throws ProcessSpawnError for a never-ran process with no `code` at all (AC-14)", () => {
    // The rule is field-based (exitCode/signal absence), not code-based —
    // this must still throw even without a `code` to name.
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "",
      isMaxBuffer: false,
    };

    expect(() => classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10)).toThrow(
      ProcessSpawnError,
    );
  });

  it("flags only stdout truncated when only stdout overflowed (AC-6, AC-7)", () => {
    const result: ExecaLikeResult = {
      stdout: "x".repeat(BUDGET),
      stderr: "short",
      exitCode: 0,
      isMaxBuffer: true,
    };

    const classified = classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);

    expect(classified.stdoutTruncated).toBe(true);
    expect(classified.stderrTruncated).toBe(false);
  });

  it("flags only stderr truncated when only stderr overflowed (AC-6, AC-7)", () => {
    const result: ExecaLikeResult = {
      stdout: "short",
      stderr: "x".repeat(BUDGET),
      exitCode: 0,
      isMaxBuffer: true,
    };

    const classified = classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);

    expect(classified.stdoutTruncated).toBe(false);
    expect(classified.stderrTruncated).toBe(true);
  });

  it("flags both streams truncated when both overflowed (AC-6, AC-7)", () => {
    const result: ExecaLikeResult = {
      stdout: "x".repeat(BUDGET),
      stderr: "y".repeat(BUDGET),
      exitCode: 0,
      isMaxBuffer: true,
    };

    const classified = classifyExecaResult(result, BUDGET, TIMEOUT_MS, 10);

    expect(classified.stdoutTruncated).toBe(true);
    expect(classified.stderrTruncated).toBe(true);
  });

  it("classifies overflow-then-hang as timed out, not masked by truncation (AC-17)", () => {
    const result: ExecaLikeResult = {
      stdout: "x".repeat(BUDGET),
      stderr: "",
      signal: "SIGTERM",
      isMaxBuffer: true,
    };

    const classified = classifyExecaResult(
      result,
      BUDGET,
      TIMEOUT_MS,
      TIMEOUT_MS + 50,
    );

    expect(classified.timedOut).toBe(true);
    expect(classified.stdoutTruncated).toBe(true);
  });

  it("does not report a false-positive timeout when a signal lands before the budget elapses", () => {
    const result: ExecaLikeResult = {
      stdout: "",
      stderr: "",
      signal: "SIGKILL",
      isMaxBuffer: false,
    };

    const classified = classifyExecaResult(
      result,
      BUDGET,
      TIMEOUT_MS,
      TIMEOUT_MS - 100,
    );

    expect(classified.timedOut).toBe(false);
  });
});
