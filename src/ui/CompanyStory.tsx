import { useState } from "react";
import { useT } from "../i18n/useT";
import type { CompanyView } from "../sim/types";
import { useFormat } from "./format";
import { useGame } from "./game";

const HOME = "US";
/** Business traits told as prose, at most this many. */
const TRAIT_LINES = 3;

/**
 * The company as a deal team would brief it: where it came from, who runs
 * it, what kind of business it is, how it has done and why it might sell.
 * Each part appears once the player has earned it: the people after a
 * meeting, the numbers after the NDA.
 */
export function CompanyStory({ company, full }: { company: CompanyView; full: boolean }) {
  const t = useT();
  const f = useFormat();
  const { view } = useGame();
  const [open, setOpen] = useState(false);
  const origin = t("company.story", {
    year: company.founded,
    abroad: company.country !== HOME ? "yes" : "no",
    country: t(`country.${company.country}`),
    region: t(`admin1.${company.admin1}`),
    site: company.site_name,
    product: t(`product.${company.sector}.${company.product}`),
    count: company.employees,
  });
  if (!full) {
    return <p className="cp-story">{origin}</p>;
  }

  const ceo = company.ceo;
  const owner = company.owner;
  const age = view.date.year - company.founded;
  const paragraphs: string[] = [];

  // Who owns it and who runs it.
  let ownerLine: string | null = null;
  switch (owner.kind) {
    case "founder":
      ownerLine = !ceo.founder
        ? t("story.owner.professional", { name: ceo.name, tenure: ceo.tenure })
        : age > ceo.tenure + 8
          ? t("story.owner.heir", { name: ceo.name, tenure: ceo.tenure })
          : t("story.owner.founder", { name: ceo.name, age: ceo.age, tenure: ceo.tenure });
      break;
    case "sponsor":
      ownerLine = t("story.owner.sponsor", {
        house: view.rivals[owner.house] ?? "",
        years: Math.max(Math.round(owner.months_held / 12), 1),
        name: ceo.name,
      });
      break;
    case "corporate":
      ownerLine = t("story.owner.corporate", { name: ceo.name });
      break;
    case "public":
      ownerLine = t("story.owner.public", { name: ceo.name });
      break;
    default:
      break;
  }
  paragraphs.push(ownerLine ? `${origin} ${ownerLine}` : origin);

  // What kind of business: the traits the player has seen, as sentences.
  const business = company.traits.slice(0, TRAIT_LINES).map((trait) => t(`story.trait.${trait}`));
  if (business.length) {
    paragraphs.push(business.join(" "));
  }

  // The people: the chief's style once met, the shop floor.
  const people: string[] = [];
  if (ceo.style) {
    people.push(t(`story.style.${ceo.style}`, { name: ceo.name }));
  }
  if (company.union_strength_bps >= 6_000) {
    people.push(t("story.union.strong", { union: f.pct(company.union_strength_bps, 0) }));
  } else if (company.union_strength_bps <= 1_500) {
    people.push(t("story.union.weak"));
  }
  if (people.length) {
    paragraphs.push(people.join(" "));
  }

  // The numbers: a trend from the statements after the NDA, the teaser before.
  const years = company.financials?.statements.years ?? [];
  if (years.length >= 2) {
    const first = years[0];
    const last = years[years.length - 1];
    const span = years.length - 1;
    const cagr = first.income.revenue > 0 ? (Math.pow(last.income.revenue / first.income.revenue, 1 / span) - 1) * 10_000 : 0;
    const margin = (period: typeof first) => (period.income.revenue ? (period.income.ebit / period.income.revenue) * 10_000 : 0);
    const from = margin(first);
    const to = margin(last);
    const trend = cagr > 150 ? "up" : cagr < -150 ? "down" : "flat";
    const moved = to - from > 100 ? "up" : to - from < -100 ? "down" : "flat";
    paragraphs.push(
      `${t(`story.trend.${trend}`, { years: span, cagr: f.pct(Math.abs(Math.round(cagr))) })} ${t(`story.margin.${moved}`, { from: f.pct(Math.round(from)), to: f.pct(Math.round(to)) })}`,
    );
  } else {
    paragraphs.push(t("story.teaser", { revenue: f.figure(company.revenue), ebitda: f.figure(company.ebitda) }));
  }

  // Why it might change hands.
  if (company.sale) {
    paragraphs.push(t(`story.sale.${company.sale.reason}`));
  } else if (company.intent) {
    paragraphs.push(t(`story.intent.${company.intent}`));
  }

  const shown = open ? paragraphs : paragraphs.slice(0, 2);
  return (
    <div className="cp-story cp-story-full">
      {shown.map((text, index) => (
        <p key={index}>{text}</p>
      ))}
      {paragraphs.length > 2 ? (
        <button type="button" className="cp-story-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t(open ? "story.less" : "story.more")}
        </button>
      ) : null}
    </div>
  );
}
