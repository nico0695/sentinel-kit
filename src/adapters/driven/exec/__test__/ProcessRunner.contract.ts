/**
 * Shared, adapter-agnostic `ProcessRunner` contract suite (spec.md's sixth
 * contract suite, alongside `ReviewEngine`/`GitPort`/`ConfigStore`/
 * `HarnessLoader`/`RunStore`).
 *
 * Parameterized over a factory so every `ProcessRunner` implementation
 * reuses it verbatim. Imports ONLY vitest + core port types and core error
 * classes — never any concrete adapter (`execa` included), so a future
 * non-execa implementation could run this suite unchanged.
 *
 * Deliberately thin (plan.md's Validation Strategy): it asserts only what's
 * observable through the port alone — resolve-not-reject on a non-zero
 * exit, typed rejections, basic capture shape. The execa-specific proof
 * (option-bag wiring, reaping, byte-exact capture, cwd, no-shell) lives in
 * `classify-execa-result.test.ts` (ST-2) and `process-runner-exec.test.ts`
 * (ST-4), not here.
 */
import { describe, expect, it } from "vitest";
import {
  InvalidProcessRequestError,
  type ProcessRunner,
  ProcessSpawnError,
} from "../../../../core/run/index.js";

export function runProcessRunnerContract(
  createRunner: () => ProcessRunner,
): void {
  describe("ProcessRunner contract", () => {
    it("resolves (does not reject) for a child that exits non-zero (AC-10)", async () => {
      const runner = createRunner();
      const result = await runner.run({
        command: process.execPath,
        args: ["-e", "process.exit(1)"],
        cwd: process.cwd(),
        timeoutMs: 5000,
      });
      expect(result.exitCode).toBe(1);
    });

    it("rejects with InvalidProcessRequestError for a malformed request (AC-13)", async () => {
      const runner = createRunner();
      await expect(
        runner.run({
          command: "",
          args: [],
          cwd: process.cwd(),
          timeoutMs: 5000,
        }),
      ).rejects.toBeInstanceOf(InvalidProcessRequestError);
    });

    it("rejects with ProcessSpawnError for a binary that cannot possibly exist (AC-14)", async () => {
      const runner = createRunner();
      await expect(
        runner.run({
          command: "sentinel-kit-nonexistent-binary-8f3c2a",
          args: [],
          cwd: process.cwd(),
          timeoutMs: 5000,
        }),
      ).rejects.toBeInstanceOf(ProcessSpawnError);
    });

    it("captures a child's stdout content (basic capture shape)", async () => {
      const runner = createRunner();
      const result = await runner.run({
        command: process.execPath,
        args: ["-e", "process.stdout.write('hello from child')"],
        cwd: process.cwd(),
        timeoutMs: 5000,
      });
      expect(result.stdout).toContain("hello from child");
    });

    it("rejects with InvalidProcessRequestError when inheritEnv is false and env is omitted (Amendment 1, A-3/A-7)", async () => {
      const runner = createRunner();
      await expect(
        runner.run({
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: process.cwd(),
          timeoutMs: 5000,
          inheritEnv: false,
        }),
      ).rejects.toBeInstanceOf(InvalidProcessRequestError);
    });

    it("the child receives none of the calling process's environment beyond an explicit allowlist when inheritEnv is false (Amendment 1, A-7)", async () => {
      const runner = createRunner();
      const markerName = "SENTINEL_CONTRACT_PROBE_MARKER";
      process.env[markerName] = "should-not-reach-child";
      try {
        const result = await runner.run({
          command: process.execPath,
          args: ["-e", "process.stdout.write(JSON.stringify(process.env))"],
          cwd: process.cwd(),
          timeoutMs: 5000,
          inheritEnv: false,
          env: { PATH: process.env.PATH ?? "" },
        });
        const childEnv = JSON.parse(result.stdout) as Record<string, string>;
        expect(childEnv[markerName]).toBeUndefined();
        expect(childEnv.PATH).toBe(process.env.PATH ?? "");
      } finally {
        delete process.env[markerName];
      }
    });
  });
}
