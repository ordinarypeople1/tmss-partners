import { describe, expect, it } from "vitest";
import { joinBase, publicUrl } from "./publicPath";

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

  it("resolves a relative base against the page", () => {
    expect(publicUrl("./", "geo/world.json", "https://example.test/a/b/index.html")).toBe(
      "https://example.test/a/b/geo/world.json",
    );
    expect(publicUrl("/", "geo/world.json", "https://example.test/a/")).toBe("https://example.test/geo/world.json");
  });
});
