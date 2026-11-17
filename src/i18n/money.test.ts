import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vitest";
import ko from "./locales/ko.json";
import { formatKrwMillion, formatUsdFromKrwMillion } from "./money";

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
});
