import { describe, expect, it } from "vitest";
import { joinBase } from "./publicPath";

describe("joinBase", () => {
  it("prefixes a public file with the site base", () => {
    expect(joinBase("/", "sample-page.json")).toBe("/sample-page.json");
    expect(joinBase("/tmss-partners/", "sample-page.json")).toBe(
      "/tmss-partners/sample-page.json",
    );
    expect(joinBase("/tmss-partners", "/icons/icon-192.png")).toBe(
      "/tmss-partners/icons/icon-192.png",
    );
  });
});
