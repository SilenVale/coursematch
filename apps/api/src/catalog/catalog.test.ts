import { describe, expect, it } from "vitest";
import { catalogCourseHint } from "./catalog-hint.js";
import { normalizeCatalogName } from "./normalize.js";

describe("normalizeCatalogName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeCatalogName("  软件工程  ")).toBe("软件工程");
    expect(normalizeCatalogName("数据  结构")).toBe("数据 结构");
  });
});

describe("catalogCourseHint", () => {
  it("explains existing catalog course", () => {
    expect(catalogCourseHint("软件工程", true)).toContain("教务目录里已有");
  });

  it("explains new catalog course on confirm", () => {
    expect(catalogCourseHint("软件工程", false)).toContain("尚未在教务目录");
  });
});
