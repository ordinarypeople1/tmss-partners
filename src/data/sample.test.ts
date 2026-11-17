import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = JSON.parse(readFileSync("src/data/fixtures/sample-companies.json", "utf8"));
const page = JSON.parse(readFileSync("public/sample-page.json", "utf8"));

function clientSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "fixtures" || entry === "pkg") {
        continue;
      }
      files.push(...clientSources(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("sample content", () => {
  it("keeps closed books in the generator fixture", () => {
    expect(fixture.placeholder_parameters).toBe(true);
    expect(fixture.fitted_to_real_filings).toBe(false);
    expect(fixture.companies.length).toBeGreaterThan(0);
    for (const company of fixture.companies) {
      expect(company.identity.fictional).toBe(true);
      expect(company.identity.ticker).toBeNull();
      for (const quarter of company.quarters) {
        const { balance, income, cashflow } = quarter;
        expect(balance.total_assets).toBe(balance.total_liabilities + balance.total_equity);
        expect(balance.cash).toBe(cashflow.closing_cash);
        expect(income.ebitda).toBe(income.gross_profit - income.sga);
        expect(quarter).not.toHaveProperty("share_price");
      }
    }
  });

  it("publishes one card page and leaves quarter history out of it", () => {
    expect(page.schema).toBe("company_card_page");
    expect(page.unit).toBe("krw_million");
    expect(page.page_size).toBe(20);
    expect(page.cards.length).toBeLessThanOrEqual(page.page_size);
    expect(page.cards.length).toBe(fixture.companies.length);
    const first = fixture.companies[0];
    const latest = first.quarters[first.quarters.length - 1];
    expect(page.cards[0].id).toBe(first.id);
    expect(page.cards[0].ebitda).toBe(latest.income.ebitda);
    expect(page.cards[0].model_multiple_millis).toBe(Math.round(latest.model_multiple * 1000));
    expect(page.cards[0]).not.toHaveProperty("quarters");
  });

  it("does not import the full fixture into the client", () => {
    const roots = ["src/ui", "src/data", "src/sim", "src/i18n"];
    for (const file of roots.flatMap((root) => clientSources(root))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("sample-companies");
      expect(text, file).not.toContain("fixtures/");
    }
  });
});
