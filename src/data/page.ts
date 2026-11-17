export interface CompanyCard {
  id: string;
  legal_name_ko: string;
  sector_id: string;
  region_label_ko: string;
  complex_name_ko: string;
  lat: number;
  lon: number;
  founded_year: number;
  employees: number;
  period: string;
  revenue: number;
  ebitda: number;
  model_multiple_millis: number;
  debt: number;
  cash: number;
}

export interface CompanyCardPage {
  schema: "company_card_page";
  seed: number;
  unit: "krw_million";
  page: number;
  page_size: number;
  placeholder_parameters: true;
  cards: CompanyCard[];
}
