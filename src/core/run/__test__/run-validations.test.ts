/**
 * `runValidations` behavioural suite (spec.md `[E5.F1.H2]`, #32).
 *
 * Imports only `run-validations.js` and this module's own local fake — no
 * harness or git fixture (AC-18). Covers the tokenizer/rejection set
 * (AC-6..AC-8), sequential execution and per-script timeout (AC-2, AC-4),
 * the three never-abort runtime paths (AC-11..AC-13), the byte-exact
 * evidence format and line window (AC-14, AC-15), and prompt determinism
 * (AC-21).
 */

import { describe, expect, it } from "vitest";
import {
  InvalidValidationDeclarationError,
  ProcessSpawnError,
  RunError,
} from "../run-errors.js";
import {
  runValidations,
  tokenizeDeclaration,
  validateValidationDeclarations,
} from "../run-validations.js";
import {
  createFakeProcessRunner,
  type FakeProcessOutcome,
  okResult,
} from "./fake-process-runner.js";

const CWD = "/sentinel/worktrees/w-1";

// Wrapped in one outer describe so `vitest -t "run-validations"` (this
// stage's validation command) selects the whole suite.
describe("run-validations", () => {
  describe("tokenizeDeclaration (AC-6, AC-7, AC-8)", () => {
    it("splits on runs of space and tab, first token is command", () => {
      expect(tokenizeDeclaration("npm  run   lint")).toEqual({
        command: "npm",
        args: ["run", "lint"],
      });
    });

    it("ignores leading/trailing whitespace", () => {
      expect(tokenizeDeclaration(" npm test ")).toEqual({
        command: "npm",
        args: ["test"],
      });
    });

    it("splits on a mix of tabs and spaces", () => {
      expect(tokenizeDeclaration("npm\trun\t lint")).toEqual({
        command: "npm",
        args: ["run", "lint"],
      });
    });

    it("a single-token declaration has empty args", () => {
      expect(tokenizeDeclaration("lint")).toEqual({
        command: "lint",
        args: [],
      });
    });

    describe("rejection set — one case per pinned character (AC-7)", () => {
      const rejectedChars = [
        "|",
        "&",
        ";",
        "<",
        ">",
        "$",
        "`",
        "(",
        ")",
        "{",
        "}",
        "[",
        "]",
        "*",
        "?",
        "!",
        "~",
        "#",
        "\\",
        "'",
        '"',
      ];

      it.each(rejectedChars)("rejects entries containing %j", (char) => {
        const entry = `npm test${char}`;
        expect(() => tokenizeDeclaration(entry)).toThrow(
          InvalidValidationDeclarationError,
        );
        try {
          tokenizeDeclaration(entry);
          expect.unreachable();
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidValidationDeclarationError);
          expect(error).toBeInstanceOf(RunError);
          expect((error as Error).message).toContain(char);
          expect((error as Error).message).toContain(entry);
        }
      });

      it("rejects a control character (newline) inside an entry, not as a line separator", () => {
        expect(() => tokenizeDeclaration("npm\ntest")).toThrow(
          InvalidValidationDeclarationError,
        );
      });

      it("rejects a control character other than tab (NUL, U+0000)", () => {
        expect(() => tokenizeDeclaration("npm\x00test")).toThrow(
          InvalidValidationDeclarationError,
        );
      });

      it("rejects DEL (U+007F)", () => {
        expect(() => tokenizeDeclaration("npm\x7ftest")).toThrow(
          InvalidValidationDeclarationError,
        );
      });

      it("does not reject a tab (a separator, not a rejection — R2-8)", () => {
        expect(() => tokenizeDeclaration("npm\ttest")).not.toThrow();
      });

      it("does not reject a space (outside the control range — R2-8)", () => {
        expect(() => tokenizeDeclaration("npm test")).not.toThrow();
      });

      it("names the codepoint of a control character in the message", () => {
        try {
          tokenizeDeclaration("npm\x01test");
          expect.unreachable();
        } catch (error) {
          expect((error as Error).message).toContain("U+0001");
        }
      });

      describe("accept cases — characters deliberately NOT in the set", () => {
        const acceptedChars = ["-", "=", ".", "/", ":", ",", "+", "@", "%"];

        it.each(acceptedChars)("accepts entries containing %j", (char) => {
          expect(() =>
            tokenizeDeclaration(`npm run --foo${char}bar`),
          ).not.toThrow();
        });

        it("accepts a real-world flag entry (--foo=bar shape)", () => {
          expect(tokenizeDeclaration("npm run lint --foo=bar")).toEqual({
            command: "npm",
            args: ["run", "lint", "--foo=bar"],
          });
        });
      });
    });

    describe("empty / zero-token rejection (AC-8)", () => {
      it.each(["", "   ", "\t", " \t "])("rejects %j", (entry) => {
        expect(() => tokenizeDeclaration(entry)).toThrow(
          InvalidValidationDeclarationError,
        );
      });
    });
  });

  describe("validateValidationDeclarations (AC-8, AC-10)", () => {
    it("does not throw for an all-valid list", () => {
      expect(() =>
        validateValidationDeclarations(["npm run lint", "npm test"]),
      ).not.toThrow();
    });

    it("throws for a bad entry anywhere in the list, not only at index 0", () => {
      expect(() =>
        validateValidationDeclarations(["npm run lint", "npm test 2>&1", "ok"]),
      ).toThrow(InvalidValidationDeclarationError);
    });

    it("does not throw for an empty list", () => {
      expect(() => validateValidationDeclarations([])).not.toThrow();
    });
  });

  describe("runValidations", () => {
    it("throws before any run() call when a declaration is malformed anywhere in the list (AC-8, AC-10)", async () => {
      const fake = createFakeProcessRunner([
        { kind: "resolve", result: okResult() },
      ]);

      await expect(
        runValidations(
          { declarations: ["npm test", "bad 2>&1"], cwd: CWD },
          { processRunner: fake },
        ),
      ).rejects.toThrow(InvalidValidationDeclarationError);
      expect(fake.calls).toHaveLength(0);
    });

    describe("sequential execution, order, cwd (AC-2, AC-3)", () => {
      it("runs entries sequentially in declaration order; result index matches declared index", async () => {
        const outcomes: FakeProcessOutcome[] = [
          { kind: "resolve", result: okResult({ stdout: "first" }) },
          { kind: "resolve", result: okResult({ stdout: "second" }) },
        ];
        const fake = createFakeProcessRunner(outcomes);

        const result = await runValidations(
          { declarations: ["npm run lint", "npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(fake.calls).toHaveLength(2);
        expect(fake.calls[0]).toMatchObject({
          command: "npm",
          args: ["run", "lint"],
        });
        expect(fake.calls[1]).toMatchObject({ command: "npm", args: ["test"] });
        expect(result[0]).toContain("first");
        expect(result[1]).toContain("second");
      });

      it("every request's cwd is the caller-supplied cwd", async () => {
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult() },
          { kind: "resolve", result: okResult() },
        ]);

        await runValidations(
          { declarations: ["npm run lint", "npm test"], cwd: CWD },
          { processRunner: fake },
        );

        for (const call of fake.calls) {
          expect(call.cwd).toBe(CWD);
        }
      });

      it("a concurrent (Promise.all-shaped) second call fails the fake's own overlap guard", async () => {
        // The fake throws if run() #2 starts before run() #1 settles — proving
        // non-overlap without a timing race (design.md D-7).
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult() },
          { kind: "resolve", result: okResult() },
        ]);

        await expect(
          Promise.all([
            fake.run({ command: "npm", args: [], cwd: CWD, timeoutMs: 1000 }),
            fake.run({ command: "npm", args: [], cwd: CWD, timeoutMs: 1000 }),
          ]),
        ).rejects.toThrow(/still pending/);
      });
    });

    describe("per-script timeout (AC-4)", () => {
      it("uses request.timeoutMs when supplied", async () => {
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult() },
        ]);

        await runValidations(
          { declarations: ["npm test"], cwd: CWD, timeoutMs: 5000 },
          { processRunner: fake },
        );

        expect(fake.calls[0]?.timeoutMs).toBe(5000);
      });

      it("defaults to DEFAULT_VALIDATION_TIMEOUT_MS (120_000) when omitted", async () => {
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult() },
        ]);

        await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(fake.calls[0]?.timeoutMs).toBe(120_000);
      });
    });

    describe("minimal allowlisted environment (AC-22(b), design.md Amendment 1)", () => {
      it("every constructed request carries inheritEnv: false and the PATH/HOME allowlist", async () => {
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult() },
          { kind: "resolve", result: okResult() },
        ]);

        await runValidations(
          { declarations: ["npm run lint", "npm test"], cwd: CWD },
          { processRunner: fake },
        );

        const expectedEnv: Record<string, string> = {};
        if (process.env.PATH !== undefined) expectedEnv.PATH = process.env.PATH;
        if (process.env.HOME !== undefined) expectedEnv.HOME = process.env.HOME;

        expect(fake.calls).toHaveLength(2);
        for (const call of fake.calls) {
          expect(call.inheritEnv).toBe(false);
          expect(call.env).toEqual(expectedEnv);
        }
      });
    });

    describe("never-abort runtime paths (AC-11, AC-12, AC-13)", () => {
      it("a non-zero exit resolves normally and records the exit code (AC-11)", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({ exitCode: 1, stdout: "1 failing" }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toContain("exit=1");
        expect(result[0]).toContain("1 failing");
      });

      it("a ProcessSpawnError on one entry is caught, recorded, and execution continues (AC-12)", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "reject",
            error: new ProcessSpawnError(
              "process failed to spawn: nope (ENOENT)",
            ),
          },
          { kind: "resolve", result: okResult({ stdout: "ok" }) },
        ]);

        const result = await runValidations(
          { declarations: ["nope", "npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(fake.calls).toHaveLength(2);
        expect(result).toHaveLength(2);
        expect(result[0]).toContain("spawn-failed");
        expect(result[0]).toContain("process failed to spawn: nope (ENOENT)");
        expect(result[1]).toContain("ok");
      });

      it("any other throwable from run() propagates (R2-1) — not caught, not recorded", async () => {
        const fake = createFakeProcessRunner([
          { kind: "reject", error: new Error("boom") },
        ]);

        await expect(
          runValidations(
            { declarations: ["npm test"], cwd: CWD },
            { processRunner: fake },
          ),
        ).rejects.toThrow("boom");
      });

      it("a timeout is recorded as evidence, including partial output, and execution continues (AC-13)", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({
              timedOut: true,
              signal: "SIGKILL",
              stdout: "started…",
            }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toContain("timedOut=true");
        expect(result[0]).toContain("started…");
      });
    });

    describe("evidence format — exact string assertions (AC-14)", () => {
      it("normal path: exact format, stream body already ending in \\n (no blank line inserted)", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({
              exitCode: 0,
              stdout: "line1\nline2\n",
              stderr: "",
            }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toBe(
          "$ npm test\n" +
            "exit=0 signal=- timedOut=false truncated=false\n" +
            "--- stdout ---\n" +
            "line1\nline2\n" +
            "--- stderr ---\n" +
            "(empty)\n",
        );
      });

      it("normal path: stream body NOT ending in \\n gets exactly one \\n appended", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({ exitCode: 0, stdout: "no newline", stderr: "" }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toBe(
          "$ npm test\n" +
            "exit=0 signal=- timedOut=false truncated=false\n" +
            "--- stdout ---\n" +
            "no newline\n" +
            "--- stderr ---\n" +
            "(empty)\n",
        );
      });

      it("spawn-failure path: exact format", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "reject",
            error: new ProcessSpawnError(
              "process failed to spawn: nope (ENOENT)",
            ),
          },
        ]);

        const result = await runValidations(
          { declarations: ["nope"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toBe(
          "$ nope\n" +
            "spawn-failed\n" +
            "--- error ---\n" +
            "process failed to spawn: nope (ENOENT)\n",
        );
      });

      it("exit code absent (killed by signal) renders '-' for exit", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: {
              stdout: "",
              stderr: "",
              signal: "SIGKILL",
              timedOut: false,
              stdoutTruncated: false,
              stderrTruncated: false,
            },
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toContain("exit=- signal=SIGKILL");
      });

      it("result.length always equals declarations.length for a mixed success/spawn-fail/timeout batch", async () => {
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult({ exitCode: 0 }) },
          {
            kind: "reject",
            error: new ProcessSpawnError("process failed to spawn: x"),
          },
          { kind: "resolve", result: okResult({ timedOut: true }) },
        ]);

        const result = await runValidations(
          { declarations: ["a", "b", "c"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result).toHaveLength(3);
      });

      it("truncated=true when a capture flag was set, even with no line-window elision", async () => {
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({ stdout: "cut off", stdoutTruncated: true }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toContain("truncated=true");
      });
    });

    describe("D6 line window (AC-15)", () => {
      function linesOf(n: number, trailingNewline: boolean): string {
        const body = Array.from({ length: n }, (_, i) => `line${i + 1}`).join(
          "\n",
        );
        return trailingNewline ? `${body}\n` : body;
      }

      it("a 300-line stdout is windowed to 100 + marker(N=100) + 100, stderr byte-identical", async () => {
        const stdout = linesOf(300, false);
        const stderr = "err1\nerr2\nerr3";
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult({ stdout, stderr }) },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        const element = result[0] as string;
        expect(element).toContain("... [100 lines elided by sentinel] ...");
        expect(element).toContain("truncated=true");

        // Extract the windowed stdout section and count lines.
        const stdoutSection = element
          .split("--- stdout ---\n")[1]
          ?.split("--- stderr ---\n")[0] as string;
        const stdoutLines = stdoutSection.replace(/\n$/, "").split("\n");
        expect(stdoutLines).toHaveLength(201); // 100 head + 1 marker + 100 tail
        expect(stdoutLines[0]).toBe("line1");
        expect(stdoutLines[99]).toBe("line100");
        expect(stdoutLines[100]).toBe("... [100 lines elided by sentinel] ...");
        expect(stdoutLines[101]).toBe("line201");
        expect(stdoutLines[200]).toBe("line300");

        // stderr is under the limit: byte-identical, terminated with one \n.
        expect(element.endsWith(`--- stderr ---\n${stderr}\n`)).toBe(true);
      });

      it("a 250-line stream (over the 200-line combined limit) is windowed", async () => {
        const stdout = linesOf(250, false);
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult({ stdout, stderr: "" }) },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        expect(result[0]).toContain("... [50 lines elided by sentinel] ...");
      });

      it("a 200-line stream WITH a trailing newline is untouched (boundary: 201 split segments, 200 lines)", async () => {
        const stdout = linesOf(200, true);
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult({ stdout, stderr: "" }) },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        const element = result[0] as string;
        expect(element).not.toContain("elided by sentinel");
        expect(element).toContain("truncated=false");
        expect(element.endsWith("--- stderr ---\n(empty)\n")).toBe(true);
        // stdout body preserved byte-for-byte including its own trailing \n.
        expect(element).toContain(`--- stdout ---\n${stdout}--- stderr ---\n`);
      });

      it("a retained line over 2,000 chars is cut with the literal suffix", async () => {
        const longLine = "x".repeat(2500);
        const fake = createFakeProcessRunner([
          {
            kind: "resolve",
            result: okResult({ stdout: longLine, stderr: "" }),
          },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        const element = result[0] as string;
        const expectedCut = `${"x".repeat(2000)} ... [line truncated]`;
        expect(element).toContain(expectedCut);
        expect(element).not.toContain(longLine);
      });

      it("one stream exceeding a limit never alters the other", async () => {
        const stdout = linesOf(300, false);
        const stderr = "short and fine";
        const fake = createFakeProcessRunner([
          { kind: "resolve", result: okResult({ stdout, stderr }) },
        ]);

        const result = await runValidations(
          { declarations: ["npm test"], cwd: CWD },
          { processRunner: fake },
        );

        const element = result[0] as string;
        expect(element.endsWith(`--- stderr ---\n${stderr}\n`)).toBe(true);
      });
    });

    describe("determinism (AC-21)", () => {
      it("running twice over identical fakes yields byte-identical elements", async () => {
        const buildFake = () =>
          createFakeProcessRunner([
            {
              kind: "resolve",
              result: okResult({ exitCode: 0, stdout: "hello\n" }),
            },
            {
              kind: "reject",
              error: new ProcessSpawnError("process failed to spawn: x"),
            },
          ]);

        const request = {
          declarations: ["npm test", "nope"],
          cwd: CWD,
        } as const;

        const resultA = await runValidations(request, {
          processRunner: buildFake(),
        });
        const resultB = await runValidations(request, {
          processRunner: buildFake(),
        });

        expect(resultA).toEqual(resultB);
        // No wall-clock duration, timestamp, pid, or hostname anywhere.
        expect(resultA.join("\n")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      });
    });

    it("standalone: does not require runReview, GitPort, an engine, or a harness", async () => {
      // The only imports in this file are run-validations.js and the local
      // fake — proven structurally by this file's own import list (AC-18).
      const fake = createFakeProcessRunner([
        { kind: "resolve", result: okResult() },
      ]);
      const result = await runValidations(
        { declarations: ["npm test"], cwd: CWD },
        { processRunner: fake },
      );
      expect(result).toHaveLength(1);
    });
  });
});
