import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import geo from "./geo/admin1.json";

const fixture = JSON.parse(readFileSync("src/data/fixtures/sample-companies.json", "utf8"));
const universe = JSON.parse(readFileSync("public/content/universe.json", "utf8"));

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

describe("generated content", () => {
  it("keeps closed books in the generator fixture", () => {
    expect(fixture.placeholder_parameters).toBe(true);
    expect(fixture.fitted_to_real_filings).toBe(false);
    expect(fixture.unit).toBe("usd_thousand");
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

  it("opens the universe in thousand USD with balanced books and no history", () => {
    expect(universe.schema).toBe("universe");
    expect(universe.unit).toBe("usd_thousand");
    expect(universe.placeholder_parameters).toBe(true);
    expect(universe.companies.length).toBeGreaterThanOrEqual(250);
    const regions = new Set(geo.admin1.map((unit) => unit.code));
    const sectors = new Set(universe.industries.map((industry: { sector_id: string }) => industry.sector_id));
    const names = new Set<string>();
    for (const company of universe.companies) {
      const assets =
        company.cash +
        company.accounts_receivable +
        company.inventory +
        company.gross_ppe -
        company.accumulated_depreciation;
      const claims = company.accounts_payable + company.debt + company.share_capital + company.retained_earnings;
      expect(assets, company.id).toBe(claims);
      expect(regions.has(company.admin1), company.admin1).toBe(true);
      expect(company.admin1.startsWith(`${company.country}-`)).toBe(true);
      expect(sectors.has(company.sector_id)).toBe(true);
      expect(company).not.toHaveProperty("quarters");
      expect(company).not.toHaveProperty("ticker");
      expect(Number((company.lat as number).toFixed(2))).toBe(company.lat);
      names.add(company.legal_name);
    }
    expect(names.size).toBe(universe.companies.length);
  });

  it("does not import generated content into the client bundle", () => {
    const roots = ["src/ui", "src/data", "src/sim", "src/i18n"];
    for (const file of roots.flatMap((root) => clientSources(root))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("sample-companies");
      expect(text, file).not.toContain("fixtures/");
      expect(text, file).not.toMatch(/from "[^"]*universe\.json"/);
    }
  });
});
