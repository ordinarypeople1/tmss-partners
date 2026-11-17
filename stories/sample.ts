import page from "../public/sample-page.json";
import type { CompanyCard, CompanyCardPage } from "../src/data/page";

const document = page as CompanyCardPage;

export const sampleCards: CompanyCard[] = document.cards;
export const sampleSeed = document.seed;

export const quotedFood = {
  enterpriseValue: 18_353,
  equityValue: 17_623,
  netDebt: 730,
};
