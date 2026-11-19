import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLANNED_LOCALES, SOURCE_LOCALE } from "./config";
import ko from "./locales/ko.json";

const REQUIRED = [
  "app.house",
  "app.title",
  "app.era",
  "map.label",
  "map.note",
  "map.zoomIn",
  "map.zoomOut",
  "company.empty",
  "company.loading",
  "company.loadError",
  "company.meta",
  "fact.revenue",
  "fact.ebitda",
  "fact.multiple",
  "fact.multipleValue",
  "fact.modelEv",
  "fact.netDebt",
  "fact.modelEquity",
  "fact.pending",
  "fact.error",
  "card.disclaimer",
  "pin.factory",
  "pin.warehouse",
  "pin.select",
  "sector.food_manufacturing",
  "sector.industrial_components",
  "sector.cold_chain_logistics",
  "money.krw.jo",
  "money.krw.eok",
  "money.krw.million",
  "money.usd.jo",
  "money.usd.eok",
  "money.usd.man",
  "money.usd.thousand",
  "clock.label",
  "clock.date",
  "clock.advance",
  "clock.restart",
  "clock.loading",
  "clock.error",
  "clock.policyRate",
  "clock.rateValue",
  "clock.uncalled",
  "clock.investmentPeriod",
  "clock.monthsLeft",
  "event.month_closed",
  "event.quarter_closed",
  "event.policy_rate_changed",
  "event.investment_period_ended",
  "event.fund_term_ended",
] as const;

describe("ko catalog", () => {
  it("is the only locale file", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "locales");
    expect(readdirSync(dir).filter((name) => name.endsWith(".json"))).toEqual(["ko.json"]);
    expect(SOURCE_LOCALE).toBe("ko");
    expect(PLANNED_LOCALES).toEqual(["en", "ja", "zh-Hans", "zh-Hant"]);
  });

  it("has a non-empty Korean string for every id the hello world uses", () => {
    for (const id of REQUIRED) {
      const message = ko[id];
      expect(message, id).toBeTruthy();
      expect(message.trim(), id).not.toBe("");
    }
  });

  it("keeps years ungrouped", () => {
    expect(ko["company.meta"]).toContain("group-off");
    expect(ko["card.disclaimer"]).toContain("group-off");
    expect(ko["clock.date"]).toContain("group-off");
  });
});
