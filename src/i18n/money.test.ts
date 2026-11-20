import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import { makeFormat } from "../ui/format";
import { catalogs, messages } from "./messages";
import { formatUsdThousand } from "./money";

const intl = createIntl({ locale: "ko", messages }, createIntlCache());

describe("money", () => {
  it("formats thousand USD as K, M, B and T", () => {
    expect(formatUsdThousand(intl, 750_000)).toBe("$750M");
    expect(formatUsdThousand(intl, 1_200_000)).toBe("$1.2B");
    expect(formatUsdThousand(intl, 1_800_000_000)).toBe("$1.8T");
    expect(formatUsdThousand(intl, 2_500)).toBe("$2.5M");
    expect(formatUsdThousand(intl, 5)).toBe("$5K");
    expect(formatUsdThousand(intl, 0)).toBe("$0");
    expect(formatUsdThousand(intl, -50_000)).toBe("-$50M");
  });

  it("formats ratios, ranges and dates", () => {
    const f = makeFormat(intl);
    expect(f.pct(1_250)).toBe("12.5%");
    expect(f.signedPct(-320)).toBe("-3.2%");
    expect(f.multiple(7_200)).toBe("7.2x");
    expect(f.figure([120_000, 120_000])).toBe("$120M");
    expect(f.figure([100_000, 150_000])).toBe("$100M ~ $150M");
    expect(f.signedMoney(2_500)).toBe("+$2.5M");
    expect(f.shortFigure([100_000, 150_000])).toBe("100M–150M");
    expect(f.shortMoney(49_000)).toBe("49M");
    expect(f.date({ year: 2024, month: 3 })).toBe("2024년 3월");
    expect(f.shortDate({ year: 2024, month: 3 })).toBe("24.03");
  });

  it("writes the same amount in every locale", () => {
    for (const locale of ["en", "ja", "zh-Hans"] as const) {
      const other = createIntl({ locale, messages: catalogs[locale] }, createIntlCache());
      expect(formatUsdThousand(other, 750_000), locale).toBe("$750M");
      expect(formatUsdThousand(other, 1_200_000), locale).toBe("$1.2B");
    }
    const en = createIntl({ locale: "en", messages: catalogs.en }, createIntlCache());
    expect(makeFormat(en).date({ year: 2024, month: 3 })).toBe("2024-03");
  });
});
