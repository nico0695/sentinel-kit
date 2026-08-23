import { describe, expect, it } from "vitest";
import { toRunStorageKey } from "../run-storage-key.js";

describe("toRunStorageKey", () => {
  it("maps an `owner/repo` alias to a single path segment", () => {
    expect(toRunStorageKey("owner/repo")).toBe("owner__repo");
  });

  it("leaves an alias with no path separator unchanged", () => {
    expect(toRunStorageKey("sentinel-kit")).toBe("sentinel-kit");
  });

  it("is idempotent — f(f(x)) === f(x)", () => {
    for (const alias of [
      "owner/repo",
      "sentinel-kit",
      "owner\\repo",
      "group/sub/repo",
    ]) {
      const once = toRunStorageKey(alias);
      expect(toRunStorageKey(once)).toBe(once);
    }
  });

  it("normalises backslashes too, since the schema rejects both separators", () => {
    expect(toRunStorageKey("owner\\repo")).toBe("owner__repo");
  });

  it("normalises every separator of a multi-segment alias", () => {
    expect(toRunStorageKey("group/sub/repo")).toBe("group__sub__repo");
  });

  it("leaves an empty string unchanged", () => {
    expect(toRunStorageKey("")).toBe("");
  });
});
