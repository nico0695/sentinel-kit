/**
 * Shared, adapter-agnostic `ConfigStore` contract suite.
 *
 * Parameterized over a harness so every `ConfigStore` implementation
 * reuses it verbatim. Imports ONLY vitest + core port types and error
 * classes — never any concrete adapter.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConfigError,
  ConfigReadError,
  type ConfigStore,
  ConfigValidationError,
  ConfigWriteError,
  type GlobalConfig,
  type RepoRegistry,
} from "../../../../core/repos/index.js";

export interface ConfigFixture {
  readonly basePath: string;
}

export interface ConfigStoreContractHarness {
  readonly build: (basePath: string) => ConfigStore;
  readonly setupFixture: () => Promise<ConfigFixture>;
  readonly teardownFixture: (fixture: ConfigFixture) => Promise<void>;
  readonly corruptFixture: (
    fixture: ConfigFixture,
    filename: string,
    content: string,
  ) => Promise<void>;
}

export function configStoreContract(
  harness: ConfigStoreContractHarness,
  label?: string,
): void {
  describe(`ConfigStore contract${label ? `: ${label}` : ""}`, () => {
    let store: ConfigStore;
    let fixture: ConfigFixture;

    beforeEach(async () => {
      fixture = await harness.setupFixture();
      store = harness.build(fixture.basePath);
    });

    afterEach(async () => {
      await harness.teardownFixture(fixture);
    });

    it("missing config.yaml returns GlobalConfig with defaults", async () => {
      const config = await store.readConfig();
      expect(config.defaultEngine).toBe("claude-code");
      expect(config.defaultBaseBranch).toBe("main");
      expect(config.diffLimits).toBeUndefined();
    });

    it("missing repos.yaml returns empty registry", async () => {
      const repos = await store.readRepos();
      expect(repos).toEqual({});
    });

    it("writeConfig then readConfig roundtrips", async () => {
      const config: GlobalConfig = {
        defaultEngine: "opencode",
        defaultBaseBranch: "develop",
        diffLimits: { maxLines: 500, maxTokens: 8000 },
      };
      await store.writeConfig(config);
      const read = await store.readConfig();
      expect(read).toEqual(config);
    });

    it("writeRepos then readRepos roundtrips", async () => {
      const repos: RepoRegistry = {
        myapp: {
          url: "https://github.com/user/myapp.git",
          localPath: "/tmp/myapp",
          baseBranch: "main",
        },
        lib: {
          url: "https://github.com/user/lib.git",
        },
      };
      await store.writeRepos(repos);
      const read = await store.readRepos();
      expect(read).toEqual(repos);
    });

    it("invalid engine value produces ConfigValidationError with field path", async () => {
      const bad = {
        defaultEngine: "invalid-engine",
        defaultBaseBranch: "main",
      };
      await expect(
        store.writeConfig(bad as unknown as GlobalConfig),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ConfigValidationError);
        expect(err).toBeInstanceOf(ConfigError);
        const ve = err as ConfigValidationError;
        expect(ve.fields.length).toBeGreaterThan(0);
        expect(ve.fields.some((f) => f.path.includes("defaultEngine"))).toBe(
          true,
        );
        return true;
      });
    });

    it("all errors extend ConfigError", async () => {
      const bad = {
        defaultEngine: "nope",
        defaultBaseBranch: "main",
      };
      try {
        await store.writeConfig(bad as unknown as GlobalConfig);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
      }
    });

    it("corrupt YAML produces ConfigReadError with cause", async () => {
      await harness.corruptFixture(
        fixture,
        "repos.yaml",
        "{{{{invalid yaml: [}}}}",
      );

      await expect(store.readRepos()).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ConfigReadError);
        expect(err).toBeInstanceOf(ConfigError);
        const re = err as ConfigReadError;
        expect(re.cause).toBeDefined();
        return true;
      });
    });

    it("I/O write failure produces ConfigWriteError with cause", async () => {
      const broken = harness.build("/nonexistent/deeply/nested/path");
      await expect(
        broken.writeConfig({
          defaultEngine: "claude-code",
          defaultBaseBranch: "main",
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ConfigWriteError);
        expect(err).toBeInstanceOf(ConfigError);
        const we = err as ConfigWriteError;
        expect(we.cause).toBeDefined();
        return true;
      });
    });
  });
}
