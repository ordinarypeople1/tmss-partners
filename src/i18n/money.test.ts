import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import ko from "./locales/ko.json";
import { formatKrwMillion, formatUsdFromKrwMillion, formatUsdThousand } from "./money";

const intl = createIntl({ locale: "ko", messages: ko }, createIntlCache());

describe("money", () => {
  it("formats million KRW with Korean scales", () => {
    expect(formatKrwMillion(intl, 2_549)).toBe("25.5억 원");
    expect(formatKrwMillion(intl, 18_353)).toBe("183.5억 원");
    expect(formatKrwMillion(intl, 50)).toBe("50백만 원");
    expect(formatKrwMillion(intl, 1_500_000)).toBe("1.5조 원");
    expect(formatKrwMillion(intl, -2_549)).toBe("-25.5억 원");
  });

  it("formats a year without a thousands separator", () => {
    expect(
      intl.formatMessage({ id: "company.meta" }, { year: 2012, employees: 345 }),
    ).toBe("설립 2012 · 직원 345명");
  });

  it("formats USD from million KRW at an explicit placeholder rate", () => {
    const formatted = formatUsdFromKrwMillion(intl, 19_390, 1_400);
    expect(formatted).toContain("13,850,000");
  });

  it("formats thousand USD with Korean scales", () => {
    expect(formatUsdThousand(intl, 750_000)).toBe("7.5억 달러");
    expect(formatUsdThousand(intl, 1_200_000)).toBe("12억 달러");
    expect(formatUsdThousand(intl, 1_800_000_000)).toBe("1.8조 달러");
    expect(formatUsdThousand(intl, 2_500)).toBe("250만 달러");
    expect(formatUsdThousand(intl, 5)).toBe("5천 달러");
    expect(formatUsdThousand(intl, 0)).toBe("0천 달러");
    expect(formatUsdThousand(intl, -50_000)).toBe("-5,000만 달러");
  });
});
