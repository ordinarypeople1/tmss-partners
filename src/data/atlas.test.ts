import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const boot = JSON.parse(readFileSync("public/atlas/boot.json", "utf8"));

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

describe("playable atlas", () => {
  it("boots a hundred companies and a 500억 fund without quarter history", () => {
    expect(boot.schema).toBe("atlas_boot");
    expect(boot.placeholder_parameters).toBe(true);
    expect(boot.fitted_to_real_filings).toBe(false);
    expect(boot.companies.length).toBeGreaterThanOrEqual(100);
    const sectors = new Set(boot.companies.map((company: { sector_id: string }) => company.sector_id));
    expect(sectors.size).toBe(11);
    const live = boot.deals.length;
    expect(live / boot.companies.length).toBeGreaterThanOrEqual(0.05);
    expect(live / boot.companies.length).toBeLessThanOrEqual(0.1);
    expect(boot.fund.commitments).toBe(50_000);
    expect(boot.clock).toEqual({ year: 2026, quarter: 1, week_in_quarter: 0, absolute_week: 0 });
    const lps = boot.agents.filter((agent: { kind: string }) => agent.kind === "lp");
    const committed = lps.reduce((sum: number, agent: { commitment: number }) => sum + agent.commitment, 0);
    expect(committed).toBe(50_000);
    for (const company of boot.companies) {
      expect(company.name_ko).not.toContain("주식회사");
      expect(company.name_ko).not.toContain("(주)");
      if (company.country === "KR") {
        expect(company.legal_name_ko.startsWith("주식회사 ")).toBe(true);
      }
      expect(company).not.toHaveProperty("quarters");
      const books = company.books;
      const assets = books.cash + books.ar + books.inv + books.net_ppe;
      const claims = books.ap + books.debt + books.share_capital + books.retained;
      expect(assets).toBe(claims);
      const stakes = company.cap.reduce((sum: number, row: { stake_bps: number }) => sum + row.stake_bps, 0);
      expect(stakes).toBe(10_000);
    }
  });

  it("publishes card pages of at most twenty and leaves quarters out", () => {
    const names = readdirSync("public/atlas/pages").filter((name) => name.startsWith("cards-"));
    expect(names.length).toBeGreaterThan(2);
    for (const name of names) {
      const page = JSON.parse(readFileSync(`public/atlas/pages/${name}`, "utf8"));
      expect(page.cards.length).toBeGreaterThan(0);
      expect(page.cards.length).toBeLessThanOrEqual(20);
      for (const card of page.cards) {
        expect(card).not.toHaveProperty("quarters");
      }
    }
  });

  it("keeps a dossier identity outside the boot file", () => {
    const dossier = JSON.parse(readFileSync("public/atlas/companies/co-001.json", "utf8"));
    expect(dossier.quarters.length).toBe(8);
    expect(dossier.quarters[0].period).toBe("2024Q1");
    expect(dossier.quarters[7].period).toBe("2025Q4");
    for (const quarter of dossier.quarters) {
      const balance = quarter.balance;
      expect(balance.total_assets).toBe(balance.total_liabilities + balance.total_equity);
      expect(balance.cash).toBe(quarter.cashflow.closing_cash);
    }
  });

  it("does not import the atlas or the sample fixture into the client bundle", () => {
    const roots = ["src/ui", "src/data", "src/sim", "src/i18n"];
    for (const file of roots.flatMap((root) => clientSources(root))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'][^"']*boot\.json["']/);
      expect(text, file).not.toContain("sample-companies");
      expect(text, file).not.toContain("fixtures/");
    }
  });
});
