import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/main/cli.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: false,
});
