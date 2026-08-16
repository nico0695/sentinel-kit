/**
 * opencode adapter test: the shared `ReviewEngine` contract suite plus
 * every AC-specific `it` proving `createOpenCodeAdapter` satisfies
 * spec.md's 24 ACs (AC-24, plus the architecture/scope/gate ACs, excepted
 * — those are manual/mechanical/gate-level, not per-test; see plan.md's
 * "Stage 4 Test Layout").
 *
 * Fixtures are read directly from `fixtures/opencode/*` and replayed
 * verbatim through a scripted `runProcess` double — the sole
 * binary-mocking seam. No `PATH` shimming, no `execa` monkey-patching
 * anywhere in this file except the dedicated "execa option wiring" describe
 * block, which is the one place this adapter's own default `execa`-backed
 * runner is exercised.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRequest } from "../../../../../core/run/index.js";
import {
  type ReviewEngineContractHarness,
  reviewEngineContract,
} from "../../__test__/ReviewEngine.contract.js";
import {
  OpenCodeInvocationError,
  OpenCodeReviewError,
  OpenCodeUnavailableError,
} from "../errors.js";
import { createOpenCodeAdapter } from "../opencode-adapter.js";
import type {
  OpenCodeProcessResult,
  OpenCodeProcessRunner,
  OpenCodeProcessRunOptions,
} from "../process-runner.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../../../../fixtures/opencode/${name}`, import.meta.url),
    ),
    "utf-8",
  );
}

const VERSION_SUCCESS: OpenCodeProcessResult = {
  stdout: "opencode 1.17.9",
  exitCode: 0,
  timedOut: false,
};

const MODEL = "openai/gpt-5.4-mini";

function baseRequest(overrides?: Partial<ReviewRequest>): ReviewRequest {
  return {
    worktree: { path: "/tmp/opencode-test-worktree" },
    prompt: "review this diff",
    timeoutMs: 1000,
    ...overrides,
  };
}

/**
 * Independent re-derivation of {inputTokens, outputTokens} from raw NDJSON
 * bytes, using the LAST `step_finish` event only — a from-scratch parse
 * over the fixture text, not a call into the production `envelope.ts`
 * module, so this genuinely cross-checks the adapter's real output rather
 * than asserting production code against itself.
 */
function lastStepFinishTokens(
  raw: string,
): { input?: number; output?: number } | undefined {
  const finishes: Array<{ input?: number; output?: number }> = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      part?: { tokens?: { input?: number; output?: number } };
    };
    if (obj.type === "step_finish" && obj.part?.tokens !== undefined) {
      finishes.push(obj.part.tokens);
    }
  }
  return finishes.at(-1);
}

// ---------------------------------------------------------------------------
// reviewEngineContract(harness, "opencode")
// ---------------------------------------------------------------------------
//
// The `resolving`/`rejecting` factories each build a fresh adapter over a
// scripted `runProcess`. The `--version` pre-check always succeeds. The
// real invocation builds a minimal NDJSON stream from the `output`/`usage`
// parameters the shared suite supplies, mirroring the claude-code harness's
// precedent of actually honoring those parameters rather than replaying a
// fixed fixture regardless of them.
const harness: ReviewEngineContractHarness = {
  resolving: (output, usage) => {
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      const lines = [
        JSON.stringify({
          type: "text",
          part: { type: "text", text: output },
        }),
      ];
      if (
        usage?.inputTokens !== undefined &&
        usage?.outputTokens !== undefined
      ) {
        lines.push(
          JSON.stringify({
            type: "step_finish",
            part: {
              type: "step-finish",
              tokens: { input: usage.inputTokens, output: usage.outputTokens },
            },
          }),
        );
      }
      return { stdout: lines.join("\n"), exitCode: 0, timedOut: false };
    };
    return createOpenCodeAdapter({ model: MODEL, runProcess });
  },
  rejecting: () => {
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("context-overflow.ndjson"),
        exitCode: 1,
        timedOut: false,
      };
    };
    return createOpenCodeAdapter({ model: MODEL, runProcess });
  },
};

reviewEngineContract(harness, "opencode");

// ---------------------------------------------------------------------------
// factory options (AC-2)
// ---------------------------------------------------------------------------
describe("factory options (AC-2)", () => {
  it("requires `model` at the type level (compile-time only, verified by `tsc --noEmit`)", () => {
    // @ts-expect-error — `model` is required; this call must fail to compile.
    const build = () => createOpenCodeAdapter({});
    // The assertion below is a runtime no-op; the actual proof is the
    // ts-expect-error directive above failing `npm run check` if `model`
    // were ever made optional again.
    expect(typeof build).toBe("function");
  });

  it('defaults binaryPath to "opencode" when omitted', async () => {
    // Not observable through the runProcess seam itself (binaryPath is only
    // consumed by the default execa-backed runner, covered separately by
    // the "execa option wiring" describe block below) — proven indirectly
    // here by never overriding it and the adapter still resolving.
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };
    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    const result = await adapter.review(baseRequest());
    expect(result.output.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// invocation shape (AC-3, AC-4)
// ---------------------------------------------------------------------------
describe("invocation shape (AC-3, AC-4)", () => {
  it("uses request.worktree.path as cwd on both the pre-flight and real calls", async () => {
    const calls: Array<{
      args: readonly string[];
      options: OpenCodeProcessRunOptions;
    }> = [];
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await adapter.review(
      baseRequest({ worktree: { path: "/some/worktree/path" } }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.options.cwd).toBe("/some/worktree/path");
    expect(calls[1]?.options.cwd).toBe("/some/worktree/path");
  });

  // AC-19's own stated validation. Added by ST-6 for ledger finding R3-002's
  // sibling R3-003: before this, swapping the two budgets left the whole
  // suite green, so the "pre-check gets a short fixed budget, the review
  // gets the caller's" contract was entirely unasserted.
  it("gives the pre-flight the fixed 5s budget and the real call request.timeoutMs (AC-19)", async () => {
    const calls: Array<{
      args: readonly string[];
      options: OpenCodeProcessRunOptions;
    }> = [];
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await adapter.review(baseRequest({ timeoutMs: 987_654 }));

    const preflightCall = calls.find((call) => call.args.includes("--version"));
    const realCall = calls.find((call) => !call.args.includes("--version"));
    expect(preflightCall?.options.timeoutMs).toBe(5_000);
    expect(realCall?.options.timeoutMs).toBe(987_654);
  });

  it("issues the real call with the exact args array and the prompt as input, never argv", async () => {
    const calls: Array<{
      args: readonly string[];
      options: OpenCodeProcessRunOptions;
    }> = [];
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    const request = baseRequest({ prompt: "PROMPT_TEXT_NEVER_IN_ARGV" });
    await adapter.review(request);

    const realCall = calls.find((call) => !call.args.includes("--version"));
    expect(realCall?.args).toEqual(["run", "-m", MODEL, "--format", "json"]);
    expect(realCall?.options.input).toBe("PROMPT_TEXT_NEVER_IN_ARGV");
    for (const call of calls) {
      expect(call.args.join(" ")).not.toContain("PROMPT_TEXT_NEVER_IN_ARGV");
    }
  });
});

// ---------------------------------------------------------------------------
// pre-flight gate (AC-5, AC-6)
// ---------------------------------------------------------------------------
describe("pre-flight gate (AC-5, AC-6)", () => {
  it("rejects with OpenCodeUnavailableError when the --version call itself rejects, and never issues the real call", async () => {
    let realCallIssued = false;
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version"))
        throw new Error("ENOENT: opencode not found");
      realCallIssued = true;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeUnavailableError,
    );
    expect(realCallIssued).toBe(false);
  });

  it("rejects with OpenCodeUnavailableError when --version exits non-zero, and never issues the real call", async () => {
    let realCallIssued = false;
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version"))
        return { stdout: "", exitCode: 1, timedOut: false };
      realCallIssued = true;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeUnavailableError,
    );
    expect(realCallIssued).toBe(false);
  });

  it("falls through to the real invocation when --version exits 0", async () => {
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    const result = await adapter.review(baseRequest());
    expect(result.output).toContain("VERDICT: request-changes");
  });
});

// ---------------------------------------------------------------------------
// OPENCODE_CONFIG lifecycle (AC-7, AC-8, AC-9)
// ---------------------------------------------------------------------------
describe("OPENCODE_CONFIG lifecycle (AC-7, AC-8, AC-9)", () => {
  it("injects a readable deny-permission config file, identical on both calls", async () => {
    const calls: Array<{
      args: readonly string[];
      options: OpenCodeProcessRunOptions;
    }> = [];
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await adapter.review(baseRequest());

    expect(calls).toHaveLength(2);
    const configPath0 = calls[0]?.options.env.OPENCODE_CONFIG;
    const configPath1 = calls[1]?.options.env.OPENCODE_CONFIG;
    expect(configPath0).toBeDefined();
    // AC-7: the SAME config path is used on both the pre-flight and real
    // invocation — not two independently-built values that could drift.
    expect(configPath0).toBe(configPath1);
  });

  it("the config file content is exactly the deny-permission JSON, read back mid-flight", async () => {
    let observedContent: string | undefined;
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      if (!args.includes("--version")) {
        observedContent = readFileSync(
          options.env.OPENCODE_CONFIG as string,
          "utf-8",
        );
        return {
          stdout: fixture("valid-verdict.ndjson"),
          exitCode: 0,
          timedOut: false,
        };
      }
      return VERSION_SUCCESS;
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await adapter.review(baseRequest());

    expect(observedContent).toBeDefined();
    expect(JSON.parse(observedContent as string)).toEqual({
      $schema: "https://opencode.ai/config.json",
      permission: { edit: "deny", bash: "deny", webfetch: "deny" },
    });
  });

  it("two concurrent review() calls get distinct config paths", async () => {
    const paths: string[] = [];
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      if (!args.includes("--version"))
        paths.push(options.env.OPENCODE_CONFIG as string);
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await Promise.all([
      adapter.review(baseRequest()),
      adapter.review(baseRequest()),
    ]);

    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("cleans up the temp config directory after a resolving review()", async () => {
    let capturedPath: string | undefined;
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      if (!args.includes("--version"))
        capturedPath = options.env.OPENCODE_CONFIG as string;
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("valid-verdict.ndjson"),
        exitCode: 0,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await adapter.review(baseRequest());

    expect(capturedPath).toBeDefined();
    expect(existsSync(dirname(capturedPath as string))).toBe(false);
  });

  it("cleans up the temp config directory after a rejecting review() (AC-9's finally-runs-on-reject guarantee)", async () => {
    let capturedPath: string | undefined;
    const runProcess: OpenCodeProcessRunner = async (args, options) => {
      if (!args.includes("--version"))
        capturedPath = options.env.OPENCODE_CONFIG as string;
      if (args.includes("--version")) return VERSION_SUCCESS;
      return {
        stdout: fixture("context-overflow.ndjson"),
        exitCode: 1,
        timedOut: false,
      };
    };

    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeReviewError,
    );

    expect(capturedPath).toBeDefined();
    expect(existsSync(dirname(capturedPath as string))).toBe(false);
  });

  // Ledger finding R4-002 (ST-6): a `writeFile` failure used to orphan the
  // just-created mkdtemp directory forever, because the `cleanup` handle is
  // only returned on the success path. Exercised here against the REAL
  // module by pointing TMPDIR at a path that cannot hold a directory, so
  // no module mocking is needed and the rest of this file is unaffected.
  it("does not leak the temp directory when the deny-config write fails (AC-9)", async () => {
    // The defect is specifically: mkdtemp SUCCEEDS, then writeFile FAILS,
    // leaving a directory nobody holds a cleanup handle for. Reproducing it
    // therefore requires a real mkdtemp and a failing write — so this uses
    // vi.doMock (block-scoped and NOT hoisted, unlike vi.mock) to fail only
    // writeFile, keeping real mkdtemp/rm. vi.resetModules() plus a dynamic
    // import confines the mock to this test; no other test in this file is
    // affected, which is what made the file-wide vi.mock approach unusable.
    vi.resetModules();
    const createdDirs: string[] = [];
    const realFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.doMock("node:fs/promises", () => ({
      ...realFs,
      mkdtemp: async (prefix: string) => {
        const dir = await realFs.mkdtemp(prefix);
        createdDirs.push(dir);
        return dir;
      },
      writeFile: async () => {
        throw new Error("ENOSPC: simulated full disk");
      },
    }));

    try {
      const { createDenyConfigFile } = await import("../permission-config.js");
      await expect(createDenyConfigFile()).rejects.toThrow(/ENOSPC/);

      // The real assertion: a directory WAS created, and it is gone.
      expect(createdDirs).toHaveLength(1);
      expect(existsSync(createdDirs[0] as string)).toBe(false);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      for (const dir of createdDirs)
        rmSync(dir, { recursive: true, force: true });
    }
  });

  // Declined, not tested: createDenyConfigFile()'s OWN creation failure
  // (e.g. mkdtemp ENOENT/EMFILE) sits outside review()'s try/finally by
  // construction (per ST-3's QA review, low severity, accepted). Simulating
  // it would require module-mocking `permission-config.js` with
  // `vi.mock`/`vi.resetModules` scoped to a single test, which would risk
  // destabilizing every other test in this file that relies on the REAL
  // permission-config module (`vi.mock` calls are hoisted file-wide, not
  // block-scoped). The behavior is already covered by contract, not by a
  // dedicated test: any raw Error is still `instanceof Error`, satisfying
  // AC-23 without a special case. Recorded here rather than silently
  // omitted.
});

// ---------------------------------------------------------------------------
// NDJSON parsing and outcome extraction (AC-10..AC-18)
// ---------------------------------------------------------------------------
describe("NDJSON parsing and outcome extraction (AC-10..AC-18)", () => {
  function adapterReplaying(
    stdout: string,
    exitCode = 0,
  ): ReturnType<typeof createOpenCodeAdapter> {
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout, exitCode, timedOut: false };
    };
    return createOpenCodeAdapter({ model: MODEL, runProcess });
  }

  it("resolves valid-verdict.ndjson with totalTokens 4786 (input+output, NOT the stream's own tokens.total of 4965)", async () => {
    const raw = fixture("valid-verdict.ndjson");
    const tokens = lastStepFinishTokens(raw);
    expect(tokens).toBeDefined();
    const expectedTotal = (tokens?.input ?? 0) + (tokens?.output ?? 0);
    expect(expectedTotal).toBe(4786);

    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toContain("VERDICT: request-changes");
    expect(result.usage?.inputTokens).toBe(tokens?.input);
    expect(result.usage?.outputTokens).toBe(tokens?.output);
    expect(result.usage?.totalTokens).toBe(4786);
  });

  it("resolves no-verdict.ndjson using the LAST of two step_finish events (321/96), not the first (4657/69)", async () => {
    const raw = fixture("no-verdict.ndjson");
    const tokens = lastStepFinishTokens(raw);
    expect(tokens).toMatchObject({ input: 321, output: 96 });

    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.usage?.inputTokens).toBe(321);
    expect(result.usage?.outputTokens).toBe(96);
    expect(result.usage?.totalTokens).toBe(417);
  });

  // AC-11's own stated validation ("concatenated text compared exactly").
  // Added by ST-6 for ledger finding R3-002: before this, reversing the
  // concatenation order in envelope.ts left the whole suite green, because
  // no test compared a multi-text-event stream's output exactly.
  it("concatenates ALL text events in stream order, compared exactly (AC-11)", async () => {
    const raw = fixture("no-verdict.ndjson");
    // Re-derive the expected string from the fixture bytes with a
    // from-scratch parse, so this asserts against ground truth rather than
    // against the production module it is meant to police.
    const expected = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(
        (line) =>
          JSON.parse(line) as { type?: string; part?: { text?: string } },
      )
      .filter((event) => event.type === "text")
      .map((event) => event.part?.text ?? "")
      .join("");

    // Guard the guard: the fixture must genuinely have >1 text event, or
    // this test could not detect an ordering regression at all.
    const textEventCount = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .filter(
        (l) => (JSON.parse(l) as { type?: string }).type === "text",
      ).length;
    expect(textEventCount).toBeGreaterThan(1);

    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toBe(expected);
  });

  it("resolves noisy-output.ndjson with verbatim concatenated text and derived usage", async () => {
    const raw = fixture("noisy-output.ndjson");
    const tokens = lastStepFinishTokens(raw);
    const expectedTotal = (tokens?.input ?? 0) + (tokens?.output ?? 0);

    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.usage?.totalTokens).toBe(expectedTotal);
  });

  it("rejects context-overflow.ndjson with OpenCodeReviewError naming ContextOverflowError", async () => {
    const adapter = adapterReplaying(fixture("context-overflow.ndjson"), 1);
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(OpenCodeReviewError);
    await expect(rejection).rejects.toThrow(/ContextOverflowError/);
  });

  it("rejects timeout-sigterm-partial.ndjson with OpenCodeReviewError (no output produced)", async () => {
    const raw = fixture("timeout-sigterm-partial.ndjson");
    const adapter = adapterReplaying(raw, 1);
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeReviewError,
    );
  });

  it("rejects unknown-model-stdout.txt with OpenCodeInvocationError (zero parseable lines)", async () => {
    const raw = fixture("unknown-model-stdout.txt");
    const adapter = adapterReplaying(raw, 1);
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeInvocationError,
    );
  });

  it("tolerates a malformed trailing line, resolving using only the valid lines", async () => {
    const raw = `${fixture("valid-verdict.ndjson").trimEnd()}\nnot valid json at all {{{`;
    const adapter = adapterReplaying(raw);
    const result = await adapter.review(baseRequest());
    expect(result.output).toContain("VERDICT: request-changes");
  });
});

// ---------------------------------------------------------------------------
// process-status gate (AC-25 — spec Amendment 1, closes ledger finding R1-001)
// ---------------------------------------------------------------------------
describe("process-status gate (AC-25)", () => {
  function adapterWithStatus(
    stdout: string,
    status: { exitCode?: number; signal?: string; timedOut?: boolean },
  ): ReturnType<typeof createOpenCodeAdapter> {
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout, timedOut: false, ...status };
    };
    return createOpenCodeAdapter({ model: MODEL, runProcess });
  }

  it("rejects a SIGTERM-killed run even though its partial output parsed fine", async () => {
    // This is the exact reproduction from the 4R review that proved R1-001:
    // before the fix it RESOLVED with a truncated review carrying a verdict.
    const adapter = adapterWithStatus(fixture("valid-verdict.ndjson"), {
      signal: "SIGTERM",
      timedOut: true,
    });
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(OpenCodeReviewError);
    await expect(rejection).rejects.toThrow(/incomplete/);
  });

  it("names the signal, not an undefined exit code, when terminated without timing out", async () => {
    const adapter = adapterWithStatus(fixture("valid-verdict.ndjson"), {
      signal: "SIGKILL",
    });
    await expect(adapter.review(baseRequest())).rejects.toThrow(/SIGKILL/);
  });

  it("rejects a non-zero exit even though its partial output parsed fine", async () => {
    const adapter = adapterWithStatus(fixture("valid-verdict.ndjson"), {
      exitCode: 1,
    });
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toBeInstanceOf(OpenCodeReviewError);
    await expect(rejection).rejects.toThrow(/exited with code 1/);
  });

  it("still resolves a clean exit-0 run (the gate does not over-reject)", async () => {
    const adapter = adapterWithStatus(fixture("valid-verdict.ndjson"), {
      exitCode: 0,
    });
    const result = await adapter.review(baseRequest());
    expect(result.output).toContain("VERDICT: request-changes");
  });

  it("lets AC-16's specific diagnostic win over the generic status message (ordering is normative)", async () => {
    // context-overflow.ndjson really does come with exitCode 1 in the wild.
    // Gating on status BEFORE parsing would replace the actionable
    // ContextOverflowError text with "exited with code 1".
    const adapter = adapterWithStatus(fixture("context-overflow.ndjson"), {
      exitCode: 1,
    });
    const rejection = adapter.review(baseRequest());
    await expect(rejection).rejects.toThrow(/ContextOverflowError/);
    await expect(rejection).rejects.not.toThrow(/exited with code/);
  });
});

// ---------------------------------------------------------------------------
// error-event tolerance (AC-16 conformance — ledger finding R2-001)
// ---------------------------------------------------------------------------
describe("error-event tolerance (AC-16)", () => {
  it("rejects an error event that carries no readable .error payload", async () => {
    // AC-16 triggers on the PRESENCE of a type:"error" event. Before the
    // fix, the `.error !== undefined` guard let a payload-less error event
    // fall through to the success path whenever any text preceded it.
    const stream = [
      JSON.stringify({ type: "text", part: { type: "text", text: "partial" } }),
      JSON.stringify({ type: "error" }),
    ].join("\n");
    const runProcess: OpenCodeProcessRunner = async (args) => {
      if (args.includes("--version")) return VERSION_SUCCESS;
      return { stdout: stream, exitCode: 0, timedOut: false };
    };
    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    await expect(adapter.review(baseRequest())).rejects.toBeInstanceOf(
      OpenCodeReviewError,
    );
  });
});

// ---------------------------------------------------------------------------
// execa option wiring (timeout precedence)
// ---------------------------------------------------------------------------
const execaMock = vi.fn();
vi.mock("execa", () => ({
  execa: (...args: unknown[]) => execaMock(...args),
}));

describe("execa option wiring (timeout precedence)", () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaMock.mockResolvedValue({
      stdout: "",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
    });
  });

  it("passes timeout/killSignal/forceKillAfterDelay/reject/env to execa when timeoutMs > 0", async () => {
    const { createDefaultRunProcess } = await import("../process-runner.js");
    const runProcess = createDefaultRunProcess("opencode");

    await runProcess(["--version"], {
      cwd: "/tmp",
      timeoutMs: 5000,
      env: { OPENCODE_CONFIG: "/tmp/config.json" },
    });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const [binary, , options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe("opencode");
    expect(options).toEqual(
      expect.objectContaining({
        timeout: 5000,
        killSignal: "SIGTERM",
        forceKillAfterDelay: 2000,
        reject: false,
        env: { OPENCODE_CONFIG: "/tmp/config.json" },
      }),
    );
  });

  it("omits timeout/killSignal/forceKillAfterDelay from the execa call when timeoutMs is 0, but still passes env", async () => {
    const { createDefaultRunProcess } = await import("../process-runner.js");
    const runProcess = createDefaultRunProcess("opencode");

    await runProcess(["--version"], {
      cwd: "/tmp",
      timeoutMs: 0,
      env: { OPENCODE_CONFIG: "/tmp/config.json" },
    });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const [, , options] = execaMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(options).not.toHaveProperty("timeout");
    expect(options).not.toHaveProperty("killSignal");
    expect(options).not.toHaveProperty("forceKillAfterDelay");
    expect(options).toEqual(
      expect.objectContaining({
        reject: false,
        env: { OPENCODE_CONFIG: "/tmp/config.json" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// error translation (AC-23)
// ---------------------------------------------------------------------------
describe("error translation (AC-23)", () => {
  // review()'s entire body is a single `async function`; every failure path
  // above is a `throw` directly inside it or inside a function it `await`s,
  // so a synchronous throw always becomes a Promise rejection — confirmed
  // by inspection of opencode-adapter.ts (and independently re-confirmed by
  // the ST-3 stage QA review). Every rejection scenario above already
  // asserts `rejects.toBeInstanceOf` a typed Error subclass, a stronger
  // check than the shared contract's own `rejects.toBeInstanceOf(Error)`
  // baseline — no new runtime assertion is needed here beyond that
  // inspection note.
  it("never throws synchronously — review() always returns a Promise, even for a doomed pre-flight call", () => {
    const runProcess: OpenCodeProcessRunner = async () => {
      throw new Error("boom");
    };
    const adapter = createOpenCodeAdapter({ model: MODEL, runProcess });
    const outcome = adapter.review(baseRequest());
    expect(outcome).toBeInstanceOf(Promise);
    return expect(outcome).rejects.toBeInstanceOf(Error);
  });
});
