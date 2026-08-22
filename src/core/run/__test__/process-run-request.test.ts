/**
 * `validateProcessRunRequest` pre-flight suite (spec.md AC-13).
 *
 * Table-driven rejection cases plus one passing case. Also proves design.md
 * D-2's deliberate split: a relative `cwd` does NOT reject at this layer —
 * absoluteness is the adapter's job, not core's.
 */

import { describe, expect, it } from "vitest";
import type { ProcessRunRequest } from "../ports/process-runner.js";
import { validateProcessRunRequest } from "../process-run-request.js";
import { InvalidProcessRequestError, RunError } from "../run-errors.js";

const validRequest: ProcessRunRequest = {
  command: "npm",
  args: ["test"],
  cwd: "/tmp/some-worktree",
  timeoutMs: 30_000,
};

describe("validateProcessRunRequest", () => {
  describe("rejection cases (AC-13)", () => {
    const cases: Array<{ name: string; request: ProcessRunRequest }> = [
      {
        name: "empty command",
        request: { ...validRequest, command: "" },
      },
      {
        name: "blank command",
        request: { ...validRequest, command: "   " },
      },
      {
        name: "empty cwd",
        request: { ...validRequest, cwd: "" },
      },
      {
        name: "timeoutMs zero",
        request: { ...validRequest, timeoutMs: 0 },
      },
      {
        name: "timeoutMs negative",
        request: { ...validRequest, timeoutMs: -1 },
      },
      {
        name: "timeoutMs non-finite (NaN)",
        request: { ...validRequest, timeoutMs: Number.NaN },
      },
      {
        name: "timeoutMs non-finite (Infinity)",
        request: { ...validRequest, timeoutMs: Number.POSITIVE_INFINITY },
      },
      {
        name: "maxOutputChars zero",
        request: { ...validRequest, maxOutputChars: 0 },
      },
      {
        name: "maxOutputChars negative",
        request: { ...validRequest, maxOutputChars: -1 },
      },
      {
        name: "maxOutputChars non-finite",
        request: { ...validRequest, maxOutputChars: Number.NaN },
      },
    ];

    it.each(cases)("rejects: $name", ({ request }) => {
      expect(() => validateProcessRunRequest(request)).toThrow(
        InvalidProcessRequestError,
      );
      try {
        validateProcessRunRequest(request);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidProcessRequestError);
        expect(error).toBeInstanceOf(RunError);
      }
    });
  });

  it("does not throw for a well-formed request", () => {
    expect(() => validateProcessRunRequest(validRequest)).not.toThrow();
  });

  it("does not throw for a well-formed request with maxOutputChars present", () => {
    expect(() =>
      validateProcessRunRequest({ ...validRequest, maxOutputChars: 1024 }),
    ).not.toThrow();
  });

  it("does NOT reject a relative cwd (D-2: absoluteness is the adapter's job)", () => {
    expect(() =>
      validateProcessRunRequest({ ...validRequest, cwd: "relative/path" }),
    ).not.toThrow();
  });
});
