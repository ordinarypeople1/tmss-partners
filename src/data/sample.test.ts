import { describe, expect, it } from "vitest";
import { enterpriseValue } from "../sim/valuation";
import { sampleContent } from "./sample";

describe("sample content", () => {
  it("is a fictional placeholder set with closed books", () => {
    expect(sampleContent.placeholder_parameters).toBe(true);
    expect(sampleContent.fitted_to_real_filings).toBe(false);
    expect(sampleContent.companies.length).toBeGreaterThan(0);

    for (const company of sampleContent.companies) {
      expect(company.identity.fictional).toBe(true);
      expect(company.identity.ticker).toBeNull();
      for (const quarter of company.quarters) {
        const { balance, income, cashflow } = quarter;
        expect(balance.total_assets).toBe(balance.total_liabilities + balance.total_equity);
        expect(balance.cash).toBe(cashflow.closing_cash);
        expect(income.ebitda).toBe(income.gross_profit - income.sga);
        expect(enterpriseValue(income.ebitda, quarter.model_multiple)).toBe(
          Math.round(income.ebitda * quarter.model_multiple),
        );
      }
    }
  });
});
