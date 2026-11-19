import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import { makeFormat } from "../ui/format";
import { messages } from "./messages";
import { formatUsdThousand } from "./money";

const intl = createIntl({ locale: "ko", messages }, createIntlCache());

describe("money", () => {
  it("formats thousand USD with Korean scales", () => {
    expect(formatUsdThousand(intl, 750_000)).toBe("7.5억 달러");
    expect(formatUsdThousand(intl, 1_200_000)).toBe("12억 달러");
    expect(formatUsdThousand(intl, 1_800_000_000)).toBe("1.8조 달러");
    expect(formatUsdThousand(intl, 2_500)).toBe("250만 달러");
    expect(formatUsdThousand(intl, 5)).toBe("5천 달러");
    expect(formatUsdThousand(intl, 0)).toBe("0천 달러");
    expect(formatUsdThousand(intl, -50_000)).toBe("-5,000만 달러");
  });

  it("formats ratios, ranges and dates", () => {
    const f = makeFormat(intl);
    expect(f.pct(1_250)).toBe("12.5%");
    expect(f.signedPct(-320)).toBe("-3.2%");
    expect(f.multiple(7_200)).toBe("7.2x");
    expect(f.figure([120_000, 120_000])).toBe("1.2억 달러");
    expect(f.figure([100_000, 150_000])).toBe("1억 달러 ~ 1.5억 달러");
    expect(f.signedMoney(2_500)).toBe("+250만 달러");
    expect(f.shortFigure([100_000, 150_000])).toBe("1억–1.5억");
    expect(f.shortMoney(49_000)).toBe("4,900만");
    expect(f.date({ year: 2024, month: 3 })).toBe("2024년 3월");
    expect(f.shortDate({ year: 2024, month: 3 })).toBe("24.03");
  });
});
