import type { Translate } from "../i18n/useT";
import type { Bidder, Message, View } from "../sim/types";
import type { Format } from "./format";
import type { Page } from "./game";

export interface MessageText {
  title: string;
  body: string;
  icon: string;
  tone?: "good" | "bad" | "warn";
  /** The ids and values behind title and body, for a rendering with linked names. */
  titleId: string;
  bodyId: string;
  values: Record<string, string>;
  /** Which values name a company, a rival house or a bank, and which page each opens. */
  links: Record<string, Page>;
}

/** The page a bidder's name opens: a rival house's. Strategic buyers and the player have none. */
export function bidderPage(bidder: Bidder): Page | null {
  return bidder.kind === "house" ? { kind: "house", id: bidder.house } : null;
}

export function bidderName(t: Translate, view: View, bidder: Bidder): string {
  return bidder.kind === "house" ? (view.rivals[bidder.house] ?? "") : t(`bidder.${bidder.kind}`);
}

const LOOK: Record<Message["type"], [string, MessageText["tone"]?]> = {
  welcome: ["flag"],
  rate_changed: ["market"],
  phase_changed: ["clock"],
  sale_early_notice: ["handshake", "good"],
  owner_opened: ["handshake", "good"],
  owner_declined: ["close", "warn"],
  sale_started: ["deals"],
  sale_withdrawn: ["close"],
  sale_failed: ["close"],
  rival_deal: ["gavel"],
  teaser_received: ["inbox"],
  shortlisted: ["check", "good"],
  not_shortlisted: ["close", "bad"],
  bank_pitch: ["handshake", "good"],
  rival_approach: ["flag", "warn"],
  lost_to_rival: ["flag", "bad"],
  rival_rebuffed: ["flag", "good"],
  house_fundraised: ["fund"],
  house_partner_left: ["career"],
  house_distress: ["alert"],
  owner_succeeded: ["career", "warn"],
  ceo_moved: ["career", "good"],
  auction_lost: ["gavel", "bad"],
  final_round: ["gavel", "warn"],
  regulator_blocked: ["alert", "bad"],
  event: ["bolt", "warn"],
  achievement_unlocked: ["flag", "good"],
  objectives_review: ["check"],
  diligence_report: ["search"],
  valuation_ready: ["market"],
  committee_convened: ["gavel", "good"],
  owner_considering: ["clock"],
  bank_feedback: ["career"],
  committee_decision: ["gavel"],
  deal_closed: ["check", "good"],
  deal_broken: ["alert", "bad"],
  initiative_done: ["bolt", "good"],
  issue_surfaced: ["alert", "bad"],
  strike: ["alert", "bad"],
  covenant_breach: ["alert", "bad"],
  lenders_took_keys: ["alert", "bad"],
  refinanced: ["link"],
  recap_paid: ["fund", "good"],
  add_on_closed: ["link", "good"],
  exit_offer: ["exit", "good"],
  exit_pulled: ["close", "warn"],
  exit_closed: ["exit", "good"],
  proceeds_received: ["fund", "good"],
  quarter_report: ["fund"],
  investment_period_ended: ["clock", "warn"],
  fund_term_ended: ["fund"],
  next_fund: ["fund", "good"],
  promotion: ["career", "good"],
  fired: ["alert", "bad"],
};

/** A message as a headline and a line of text. Company names come from the view. */
export function describeMessage(t: Translate, f: Format, view: View, message: Message): MessageText {
  const company =
    message.company === null ? "" : (view.companies.find((row) => row.i === message.company)?.name ?? "");
  const values: Record<string, string> = { company };
  const links: Record<string, Page> = {};
  if (message.company !== null && company) {
    links.company = { kind: "company", id: message.company };
  }
  const link = (key: string, page: Page | null) => {
    if (page) {
      links[key] = page;
    }
  };
  if ("house" in message && typeof message.house === "number") {
    link("house", { kind: "house", id: message.house });
  }
  if ("adviser" in message && typeof message.adviser === "number") {
    link("adviser", { kind: "adviser", id: message.adviser });
  }
  if ("buyer" in message && message.buyer) {
    link("buyer", bidderPage(message.buyer));
  }
  if ("winner" in message && message.winner) {
    link("winner", bidderPage(message.winner));
  }
  let bodyId = `msg.${message.type}.body`;
  let titleId = `msg.${message.type}.title`;
  switch (message.type) {
    case "rate_changed":
      values.from = f.pct(message.from_bps, 2);
      values.to = f.pct(message.to_bps, 2);
      break;
    case "phase_changed":
      values.from = t(`phase.${message.from}`);
      values.to = t(`phase.${message.to}`);
      break;
    case "sale_early_notice":
    case "owner_opened":
    case "sale_started":
      values.reason = t(`reason.${message.reason}`);
      // Minority talks end where they started; there is no auction behind them.
      if (message.type === "owner_opened" && message.reason === "growth_capital") {
        bodyId = "msg.owner_opened.minority";
      }
      break;
    case "teaser_received":
      values.adviser = view.advisers[message.adviser]?.name ?? "";
      values.format = t(`format.${message.format}`);
      break;
    case "bank_pitch":
      values.adviser = view.advisers[message.adviser]?.name ?? "";
      break;
    case "shortlisted":
      values.bidders = String(message.bidders);
      break;
    case "rival_approach":
    case "rival_rebuffed":
    case "house_partner_left":
    case "house_distress":
      values.house = view.rivals[message.house] ?? "";
      break;
    case "lost_to_rival":
      values.house = view.rivals[message.house] ?? "";
      values.ev = f.money(message.ev);
      break;
    case "house_fundraised":
      values.house = view.rivals[message.house] ?? "";
      values.size = f.money(message.size);
      break;
    case "owner_succeeded":
      values.from = message.from;
      values.to = message.to;
      break;
    case "ceo_moved":
      values.name = message.name;
      values.from = message.from;
      break;
    case "rival_deal":
      values.buyer = bidderName(t, view, message.buyer);
      values.ev = f.money(message.ev);
      break;
    case "auction_lost":
      values.winner = bidderName(t, view, message.winner);
      values.ev = f.money(message.ev);
      break;
    case "diligence_report":
      values.stream = t(`stream.${message.stream}`);
      values.issues = message.found.map((issue) => t(`issue.${issue}`)).join(", ");
      bodyId = message.found.length ? "msg.diligence_report.found" : "msg.diligence_report.clean";
      break;
    case "owner_considering":
      values.months = String(message.months);
      break;
    case "bank_feedback":
      bodyId = `msg.bank_feedback.${message.band}.${message.certainty ? "certainty" : "price"}`;
      break;
    case "valuation_ready":
      values.kind = t(`valuation.kind.${message.kind}`);
      break;
    case "committee_decision":
      values.outcome = t(`outcome.${message.outcome}`);
      break;
    case "deal_closed":
      values.ev = f.money(message.ev);
      values.equity = f.money(message.equity);
      values.debt = f.money(message.debt);
      break;
    case "initiative_done":
      values.kind = t(`initiative.${message.kind}`);
      break;
    case "issue_surfaced":
      values.issue = t(`issue.${message.issue}`);
      break;
    case "covenant_breach":
      values.leverage = f.multiple(message.leverage_millis);
      values.max = f.multiple(message.max_leverage_millis);
      values.cover = f.multiple(message.cover_millis);
      values.cure = f.money(message.cure);
      break;
    case "refinanced":
      values.spread = f.pct(message.spread_bps, 2);
      break;
    case "recap_paid":
    case "proceeds_received":
      values.amount = f.money(message.amount);
      break;
    case "add_on_closed":
      values.target = message.target;
      values.price = f.money(message.price);
      values.fromFund = f.money(message.from_fund);
      break;
    case "exit_offer":
      values.route = t(`route.${message.route}`);
      values.ev = f.money(message.ev);
      values.proceeds = f.money(message.proceeds);
      break;
    case "exit_pulled":
      values.route = t(`route.${message.route}`);
      break;
    case "exit_closed":
      values.route = t(`route.${message.route}`);
      values.buyer = bidderName(t, view, message.buyer);
      values.proceeds = f.money(message.proceeds);
      values.moic = f.multiple(message.moic_millis, 2);
      values.irr = message.irr_bps === null ? t("msg.irrNone") : f.pct(message.irr_bps);
      break;
    case "quarter_report":
      values.nav = f.money(message.nav);
      values.tvpi = f.multiple(message.tvpi_millis, 2);
      break;
    case "fund_term_ended":
      values.tvpi = f.multiple(message.tvpi_millis, 2);
      values.carry = f.money(message.carry);
      break;
    case "next_fund":
      values.committed = f.money(message.committed);
      if (message.own_house) {
        bodyId = "msg.next_fund.own";
      }
      break;
    case "promotion":
      values.rank = t(`rank.${message.rank}`);
      break;
    case "final_round":
      values.rank = String(message.rank);
      values.bidders = String(message.bidders);
      break;
    case "event":
      titleId = `msg.event.${message.event}.title`;
      bodyId = `msg.event.${message.event}.body`;
      values.amount = f.money(message.amount);
      break;
    case "achievement_unlocked":
      values.name = t(`achievement.${message.achievement}`);
      values.detail = t(`achievement.${message.achievement}.detail`);
      break;
    case "objectives_review":
      values.met = String(message.met);
      values.total = String(message.total);
      values.bonus = f.money(message.bonus);
      break;
    default:
      break;
  }
  const [icon, tone] = LOOK[message.type];
  return { title: t(titleId, values), body: t(bodyId, values), icon, tone, titleId, bodyId, values, links };
}
