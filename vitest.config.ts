import { defineConfig } from "vitest/config";

/**
 * First vitest config (setup §5.4): three projects mirroring the test taxonomy
 * — `core` (unit / in-memory fakes), `adapters` (contract suites), `e2e`
 * (smoke). Includes are non-overlapping; only `adapters` matches files today
 * (E0.F2.H2). Empty `core`/`e2e` do not fail `vitest run` because ≥1 test file
 * exists across the aggregate run.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["src/core/**/__test__/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "adapters",
          environment: "node",
          include: [
            "src/adapters/**/__test__/**/*.test.ts",
            "src/main/**/__test__/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["e2e/**/*.test.ts"],
        },
      },
    ],
  },
});
