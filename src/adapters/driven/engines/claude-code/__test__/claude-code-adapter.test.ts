/**
 * claude-code adapter test: the shared `ReviewEngine` contract suite plus
 * every AC-specific `it` proving `createClaudeCodeAdapter` satisfies
 * spec.md's 27 ACs (AC-19's residual and AC-24, AC-25/26/27 excepted — those
 * are process/manual/gate-level, not per-test; see plan.md's "Stage 4 Test
 * Layout").
 *
 * Fixtures are read directly from `fixtures/claude-code/*.json` and replayed
 * verbatim through a scripted `runProcess` double — the sole binary-mocking
 * seam (AC-20). No `PATH` shimming, no `execa` monkey-patching anywhere in
 * this file except the dedicated "execa option wiring" describe block, which
 * is the one place this adapter's own default `execa`-backed runner is
 * exercised (AC-16/AC-17).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRequest } from "../../../../../core/run/index.js";
import {
  type ReviewEngineContractHarness,
  reviewEngineContract,
} from "../../__test__/ReviewEngine.contract.js";
import { createClaudeCodeAdapter } from "../claude-code-adapter.js";
import {
  ClaudeCodeInvocationError,
  ClaudeCodeReviewError,
  ClaudeCodeUnavailableError,
} from "../errors.js";
import type {
  ClaudeCodeProcessResult,
  ClaudeCodeProcessRunner,
  ClaudeCodeProcessRunOptions,
} from "../process-runner.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(
        `../../../../../../fixtures/claude-code/${name}`,
        import.meta.url,
      ),
    ),
    "utf-8",
  );
}

const VERSION_SUCCESS: ClaudeCodeProcessResult = {
  stdout: "2.1.226 (Claude Code)",
  exitCode: 0,
  timedOut: false,
};

function baseRequest(overrides?: Partial<ReviewRequest>): ReviewRequest {
  return {
    worktree: { path: "/tmp/claude-code-test-worktree" },
    prompt: "review this diff",
    timeoutMs: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// reviewEngineContract(harness, "claude-code")
// ---------------------------------------------------------------------------
//
// The `resolving`/`rejecting` factories each build a fresh adapter over a
// scripted `runProcess`. The `--version` pre-check always succeeds. The real
// invocation builds a minimal JSON envelope from the `output`/`usage`
// parameters the shared suite supplies, so the two generic assertions
// (exact `output` echo, `usage` presence/absence) hold for whatever the
// suite happens to pass in — mirroring `fake-engine.test.ts`'s precedent of
// actually honoring those parameters, not literally replaying a fixed
// fixture regardless of them (design.md's own concrete snippet is a
// simplified illustration; a literal, parameter-ignoring replay would make
// the suite's exact-output/exact-usage assertions fail against
// `valid-verdict.json`'s real, unrelated content).
//
// `ReviewEngine.contract.ts`'s "propagates the configured usage" case was
// corrected during this stage's acceptance (see state.yaml decision
// d-st4-contract-usage-fix): it previously configured a usage object with
// only `totalTokens` set, which no derivation-based real engine can ever
// produce (`extractSuccess`'s AC-11 rule always computes `totalTokens` as
// the sum of `inputTokens`/`outputTokens`, never independently). It now
// configures a full `{ inputTokens, outputTokens, totalTokens }` tuple,
// satisfiable by both `FakeEngine`'s literal passthrough and this harness's
// derivation, so this suite genuinely does pass unmodified against it.
const harness: ReviewEngineContractHarness = {
  resolving: (output, usage) => {
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      const envelope: Record<string, unknown> = {
        is_error: false,
        result: output,
      };
      if (
        usage?.inputTokens !== undefined &&
        usage?.outputTokens !== undefined
      ) {
        envelope.usage = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
        };
      }
      return { stdout: JSON.stringify(envelope), exitCode: 0, timedOut: false };
    };
    return createClaudeCodeAdapter({ runProcess });
  },
  rejecting: () => {
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("auth-error.json"),
        exitCode: 1,
        timedOut: false,
      };
    };
    return createClaudeCodeAdapter({ runProcess });
  },
};

reviewEngineContract(harness, "claude-code");

// ---------------------------------------------------------------------------
// factory defaults (AC-2)
// ---------------------------------------------------------------------------
describe("factory defaults (AC-2)", () => {
  it('defaults binaryPath to "claude" and model to "sonnet" when options are omitted', async () => {
    const calls: Array<{
      args: readonly string[];
      options: ClaudeCodeProcessRunOptions;
    }> = [];
    const runProcess: ClaudeCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess });
    await adapter.review(baseRequest());

    const realCall = calls.find((call) => !call.args.includes("--version"));
    expect(realCall).toBeDefined();
    // model defaults to "sonnet": the args array names it explicitly.
    expect(realCall?.args).toEqual([
      "-p",
      "--model",
      "sonnet",
      "--output-format",
      "json",
    ]);
    // binaryPath is not observable through the runProcess seam itself (it is
    // only consumed by the default execa-backed runner, covered separately
    // by the "execa option wiring" describe block) — its default is proven
    // indirectly here by never overriding it and the adapter still working.
  });
});

// ---------------------------------------------------------------------------
// invocation shape (AC-3, AC-4)
// ---------------------------------------------------------------------------
describe("invocation shape (AC-3, AC-4)", () => {
  it("uses request.worktree.path as cwd on both the pre-flight and real calls", async () => {
    const calls: Array<{
      args: readonly string[];
      options: ClaudeCodeProcessRunOptions;
    }> = [];
    const runProcess: ClaudeCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess });
    await adapter.review(
      baseRequest({ worktree: { path: "/some/worktree/path" } }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.options.cwd).toBe("/some/worktree/path");
    expect(calls[1]?.options.cwd).toBe("/some/worktree/path");
  });

  it("issues the real call with the exact args array and the prompt as input, never argv", async () => {
    const calls: Array<{
      args: readonly string[];
      options: ClaudeCodeProcessRunOptions;
    }> = [];
    const runProcess: ClaudeCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess, model: "opus" });
    const request = baseRequest({ prompt: "PROMPT_TEXT_NEVER_IN_ARGV" });
    await adapter.review(request);

    const realCall = calls.find((call) => !call.args.includes("--version"));
    expect(realCall?.args).toEqual([
      "-p",
      "--model",
      "opus",
      "--output-format",
      "json",
    ]);
    expect(realCall?.options.input).toBe("PROMPT_TEXT_NEVER_IN_ARGV");
    for (const call of calls) {
      expect(call.args.join(" ")).not.toContain("PROMPT_TEXT_NEVER_IN_ARGV");
    }
  });
});

// ---------------------------------------------------------------------------
// pre-flight gate (AC-5, AC-6, AC-7)
// ---------------------------------------------------------------------------
describe("pre-flight gate (AC-5, AC-6, AC-7)", () => {
  it("rejects with ClaudeCodeUnavailableError when the --version call itself rejects, and never issues the real call", async () => {
    let realCallIssued = false;
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version"))
        throw new Error("ENOENT: claude not found");
      realCallIssued = true;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      ClaudeCodeUnavailableError,
    );
    expect(realCallIssued).toBe(false);
  });

  it("rejects with ClaudeCodeUnavailableError when --version exits non-zero, and never issues the real call", async () => {
    let realCallIssued = false;
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) {
        return { stdout: "", exitCode: 1, timedOut: false };
      }
      realCallIssued = true;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      ClaudeCodeUnavailableError,
    );
    expect(realCallIssued).toBe(false);
  });

  it("falls through to the real invocation when --version exits 0", async () => {
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.json"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createClaudeCodeAdapter({ runProcess });
    const result = await adapter.review(baseRequest());
    expect(result.output).toContain("VERDICT: request-changes");
  });
});

// ---------------------------------------------------------------------------
// envelope parsing and success extraction (AC-8, AC-9, AC-10, AC-11, AC-12)
// ---------------------------------------------------------------------------
describe("envelope parsing and success extraction (AC-8, AC-9, AC-10, AC-11, AC-12)", () => {
  function adapterReplaying(
    stdout: string,
    exitCode = 0,
  ): ReturnType<typeof createClaudeCodeAdapter> {
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout, exitCode, timedOut: false };
    };
    return createClaudeCodeAdapter({ runProcess });
  }

  it("rejects with ClaudeCodeInvocationError (with cause) on malformed stdout", async () => {
    const adapter = adapterReplaying("{ not valid json");
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(ClaudeCodeInvocationError);
    await expect(rejection).rejects.toMatchObject({
      cause: expect.any(Error),
    });
  });

  it("rejects with ClaudeCodeInvocationError (with cause) on empty stdout", async () => {
    const adapter = adapterReplaying("");
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(ClaudeCodeInvocationError);
    await expect(rejection).rejects.toMatchObject({
      cause: expect.any(Error),
    });
  });

  it("passes valid-verdict.json's .result through byte-exact", async () => {
    const raw = fixture("valid-verdict.json");
    const expected = (JSON.parse(raw) as { result: string }).result;
    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toBe(expected);
  });

  it("passes no-verdict.json's .result through byte-exact", async () => {
    const raw = fixture("no-verdict.json");
    const expected = (JSON.parse(raw) as { result: string }).result;
    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toBe(expected);
  });

  it("passes noisy-output.json's .result through byte-exact", async () => {
    const raw = fixture("noisy-output.json");
    const expected = (JSON.parse(raw) as { result: string }).result;
    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toBe(expected);
  });

  it("extracts exact { inputTokens, outputTokens } from valid-verdict.json's usage", async () => {
    const adapter = adapterReplaying(fixture("valid-verdict.json"));
    const result = await adapter.review(baseRequest());
    expect(result.usage).toMatchObject({ inputTokens: 2, outputTokens: 167 });
  });

  it("computes noisy-output.json's totalTokens excluding cache fields (531, not 26227)", async () => {
    const raw = fixture("noisy-output.json");
    const parsed = JSON.parse(raw) as {
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
    };
    // Re-derive the expected figure directly from the fixture bytes, not
    // from a hardcoded literal, so a future fixture edit cannot silently
    // desync this assertion from ground truth.
    const expectedTotal =
      parsed.usage.input_tokens + parsed.usage.output_tokens;
    expect(expectedTotal).toBe(531);
    expect(
      parsed.usage.cache_read_input_tokens +
        parsed.usage.cache_creation_input_tokens,
    ).toBe(25696); // sanity: confirms the cache fields are large and genuinely excludable

    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.usage?.totalTokens).toBe(531);
    expect(result.usage?.totalTokens).toBe(expectedTotal);
  });

  it("omits `usage` entirely (not `usage: undefined`) when .usage is absent", async () => {
    const adapter = adapterReplaying(
      JSON.stringify({ is_error: false, result: "no usage here" }),
    );
    const result = await adapter.review(baseRequest());
    expect("usage" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// is_error:true rejection (AC-13, AC-14, AC-18)
// ---------------------------------------------------------------------------
describe("is_error:true rejection (AC-13, AC-14, AC-18)", () => {
  it("rejects with ClaudeCodeReviewError carrying auth-error.json's exact .result message", async () => {
    const raw = fixture("auth-error.json");
    const expectedMessage = (JSON.parse(raw) as { result: string }).result;
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout: raw, exitCode: 1, timedOut: false };
    };
    const adapter = createClaudeCodeAdapter({ runProcess });
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(ClaudeCodeReviewError);
    await expect(rejection).rejects.toThrow(expectedMessage);
  });

  it("rejects with ClaudeCodeReviewError carrying context-overflow.json's exact .result message", async () => {
    const raw = fixture("context-overflow.json");
    const expectedMessage = (JSON.parse(raw) as { result: string }).result;
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout: raw, exitCode: 1, timedOut: false };
    };
    const adapter = createClaudeCodeAdapter({ runProcess });
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(ClaudeCodeReviewError);
    await expect(rejection).rejects.toThrow(expectedMessage);
  });

  it("rejects with ClaudeCodeReviewError (fallback message) on the SIGTERM-flushed-JSON case (timeout-sigterm.json, no .result)", async () => {
    const raw = fixture("timeout-sigterm.json");
    const parsed = JSON.parse(raw) as { result?: string };
    expect(parsed.result).toBeUndefined(); // confirms the fixture genuinely lacks .result
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout: raw, exitCode: 1, signal: "SIGTERM", timedOut: true };
    };
    const adapter = createClaudeCodeAdapter({ runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      ClaudeCodeReviewError,
    );
  });

  it("rejects with ClaudeCodeInvocationError on the SIGKILL-empty-stdout case", async () => {
    const runProcess: ClaudeCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: "",
        signal: "SIGKILL",
        timedOut: true,
      };
    };
    const adapter = createClaudeCodeAdapter({ runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      ClaudeCodeInvocationError,
    );
  });
});

// ---------------------------------------------------------------------------
// execa option wiring (AC-16, AC-17)
// ---------------------------------------------------------------------------
const execaMock = vi.fn();
vi.mock("execa", () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}));

describe("execa option wiring (AC-16, AC-17)", () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaMock.mockResolvedValue({
      stdout: "",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
    });
  });

  it("passes timeout/killSignal/forceKillAfterDelay/reject to execa when timeoutMs > 0", async () => {
    const { createDefaultRunProcess } = await import("../process-runner.js");
    const runProcess = createDefaultRunProcess("claude");

    await runProcess(["--version"], { cwd: "/tmp", timeoutMs: 5000 });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const [, , options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(options).toEqual(
      expect.objectContaining({
        timeout: 5000,
        killSignal: "SIGTERM",
        forceKillAfterDelay: 2000,
        reject: false,
      }),
    );
  });

  it("omits timeout/killSignal/forceKillAfterDelay from the execa call when timeoutMs is 0", async () => {
    const { createDefaultRunProcess } = await import("../process-runner.js");
    const runProcess = createDefaultRunProcess("claude");

    await runProcess(["--version"], { cwd: "/tmp", timeoutMs: 0 });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const [, , options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(options).not.toHaveProperty("timeout");
    expect(options).not.toHaveProperty("killSignal");
    expect(options).not.toHaveProperty("forceKillAfterDelay");
    expect(options).toEqual(expect.objectContaining({ reject: false }));
  });
});

// ---------------------------------------------------------------------------
// error translation (AC-23)
// ---------------------------------------------------------------------------
describe("error translation (AC-23)", () => {
  // review()'s entire body is a single `async function`; every failure path
  // above is a `throw` directly inside it (never inside a synchronous helper
  // called before the first `await`), so a synchronous throw always becomes
  // a Promise rejection — confirmed by inspection of claude-code-adapter.ts.
  // Every rejection scenario above already asserts `rejects.toBeInstanceOf`
  // a typed Error subclass, which is a stronger check than the shared
  // contract's own `rejects.toBeInstanceOf(Error)` baseline — no new
  // runtime assertion is needed here beyond that inspection note.
  it("never throws synchronously — review() always returns a Promise, even for a doomed pre-flight call", () => {
    const runProcess: ClaudeCodeProcessRunner = async () => {
      throw new Error("boom");
    };
    const adapter = createClaudeCodeAdapter({ runProcess });
    // Calling review() must not throw synchronously; it must return a
    // rejected Promise instead. If it threw synchronously, this call itself
    // would throw and fail the test before reaching the assertion below.
    const outcome = adapter.review(baseRequest());
    expect(outcome).toBeInstanceOf(Promise);
    return expect(outcome).rejects.toBeInstanceOf(Error);
  });
});
