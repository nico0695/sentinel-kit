/**
 * `createExecProcessRunner` test: drives the shared `ProcessRunner`
 * contract suite against the real execa-backed adapter, then adds the
 * real-child assertions ST-4 owns — cases only a genuinely spawned process
 * can prove (reaping, byte-exact capture, cwd, no-shell, real spawn
 * failures, one overflow-then-hang corroboration). Everything the contract
 * suite and the unit-tested classifier already cover is deliberately not
 * repeated here (plan.md's stated split).
 */
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessSpawnError } from "../../../../core/run/index.js";
import { createExecProcessRunner } from "../process-runner-exec.js";
import { runProcessRunnerContract } from "./ProcessRunner.contract.js";

runProcessRunnerContract(() => createExecProcessRunner());

/**
 * Polls a predicate briefly instead of asserting once, to absorb OS-level
 * reap timing without weakening the assertion's intent (spec.md AC-1's
 * validation hint).
 */
async function waitUntil(
  predicate: () => boolean,
  { attempts = 20, delayMs = 50 } = {},
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function isProcessDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

describe("real-child: reaping proof (AC-1, load-bearing)", () => {
  it("kills a SIGTERM-trapping child with SIGKILL and the pid is genuinely dead afterwards", async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: [
        "-e",
        'process.stdout.write(process.pid + "\\n"); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
      ],
      cwd: process.cwd(),
      timeoutMs: 300,
    });

    expect(result.signal).toBe("SIGKILL");
    expect(result.timedOut).toBe(true);

    const pid = Number.parseInt(result.stdout.split("\n")[0] ?? "", 10);
    expect(Number.isNaN(pid)).toBe(false);

    let dead = false;
    await waitUntil(() => {
      dead = isProcessDead(pid);
      return dead;
    });
    expect(dead).toBe(true);
  }, 10_000);
});

describe("real-child: timeout flag (AC-2, AC-3)", () => {
  it("resolves timedOut: false with exitCode: 0 for a child finishing within budget", async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("resolves timedOut: true for a child that hangs past timeoutMs", async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000);"],
      cwd: process.cwd(),
      timeoutMs: 300,
    });

    expect(result.timedOut).toBe(true);
  }, 10_000);
});

describe("real-child: byte-exact stdout (AC-4)", () => {
  it('captures "a\\n\\n" exactly, including the trailing newline', async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", 'process.stdout.write("a\\n\\n")'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.stdout).toBe("a\n\n");
  });
});

describe("real-child: stream separation (AC-5)", () => {
  it("captures stdout and stderr independently, each containing only its own content", async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: [
        "-e",
        'process.stdout.write("STDOUT_MARKER"); process.stderr.write("STDERR_MARKER");',
      ],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.stdout).toContain("STDOUT_MARKER");
    expect(result.stdout).not.toContain("STDERR_MARKER");
    expect(result.stderr).toContain("STDERR_MARKER");
    expect(result.stderr).not.toContain("STDOUT_MARKER");
  });
});

describe("real-child: cwd honored (AC-11)", () => {
  it("runs the child in the requested absolute cwd", async () => {
    const dir = mkdtempSync(join(tmpdir(), "process-runner-cwd-"));
    const realDir = realpathSync(dir);

    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd: realDir,
      timeoutMs: 5000,
    });

    expect(realpathSync(result.stdout)).toBe(realDir);
  });
});

describe("real-child: no shell (AC-12)", () => {
  it("passes an arg with shell metacharacters verbatim and executes nothing from it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "process-runner-noshell-"));
    const markerPath = join(dir, "pwned-marker.txt");
    const maliciousArg = `; touch ${markerPath}`;

    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
        maliciousArg,
      ],
      cwd: dir,
      timeoutMs: 5000,
    });

    const receivedArgs = JSON.parse(result.stdout) as string[];
    expect(receivedArgs).toEqual([maliciousArg]);
    expect(() => realpathSync(markerPath)).toThrow();
  });
});

describe("real-child: spawn failures (AC-14)", () => {
  it("rejects with ProcessSpawnError (cause populated) for a non-executable file (EACCES)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "process-runner-eacces-"));
    const filePath = join(dir, "not-executable");
    writeFileSync(filePath, "#!/bin/sh\necho hi\n");
    chmodSync(filePath, 0o600);

    const runner = createExecProcessRunner();
    const rejection = runner.run({
      command: filePath,
      args: [],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    await expect(rejection).rejects.toBeInstanceOf(ProcessSpawnError);
    await expect(rejection).rejects.toMatchObject({
      cause: expect.anything(),
    });

    let thrown: unknown;
    try {
      await rejection;
    } catch (error) {
      thrown = error;
    }
    expect((thrown as ProcessSpawnError).cause).toMatchObject({
      command: filePath,
      args: [],
      cwd: process.cwd(),
    });
    expect((thrown as ProcessSpawnError).message).toContain(filePath);
  });

  it("rejects with ProcessSpawnError for a cwd that does not exist on disk", async () => {
    const missingDir = join(
      tmpdir(),
      "process-runner-missing-cwd-8f3c2a-does-not-exist",
    );

    const runner = createExecProcessRunner();
    const rejection = runner.run({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      cwd: missingDir,
      timeoutMs: 5000,
    });

    await expect(rejection).rejects.toBeInstanceOf(ProcessSpawnError);

    let thrown: unknown;
    try {
      await rejection;
    } catch (error) {
      thrown = error;
    }
    expect((thrown as ProcessSpawnError).cause).toMatchObject({
      command: process.execPath,
      cwd: missingDir,
    });
  });
});

describe("real-child: minimal allowlisted environment (AC-22(a), design.md Amendment 1)", () => {
  it("excludes a marker env var while including the explicit PATH/HOME allowlist", async () => {
    const runner = createExecProcessRunner();
    const markerName = "SENTINEL_PROBE_SECRET";
    process.env[markerName] = "should-not-leak-to-child";
    try {
      const result = await runner.run({
        command: process.execPath,
        args: ["-e", "process.stdout.write(JSON.stringify(process.env))"],
        cwd: process.cwd(),
        timeoutMs: 5000,
        inheritEnv: false,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
        },
      });

      const childEnv = JSON.parse(result.stdout) as Record<string, string>;
      expect(childEnv[markerName]).toBeUndefined();
      expect(childEnv.PATH).toBe(process.env.PATH ?? "");
      expect(childEnv.HOME).toBe(process.env.HOME ?? "");
    } finally {
      delete process.env[markerName];
    }
  });
});

describe("real-child: overflow-then-hang corroboration (AC-17)", () => {
  it("reports timedOut: true and a truncation flag when a child floods output and then hangs", async () => {
    const runner = createExecProcessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: [
        "-e",
        'process.stdout.on("error", () => {}); while (true) { process.stdout.write("x".repeat(1024)); }',
      ],
      cwd: process.cwd(),
      timeoutMs: 300,
      maxOutputChars: 4096,
    });

    expect(result.timedOut).toBe(true);
    expect(result.stdoutTruncated || result.stderrTruncated).toBe(true);
  }, 10_000);
});
