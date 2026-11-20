import { useT } from "../i18n/useT";
import type { Access, CompanyRow, CompanyView, Intent, Step } from "../sim/types";
import { Meter, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./Journey.css";

/** The road from a first meeting to owning the company. */
const NODES = ["contact", "trust", "talks", "nda", "diligence", "committee", "bid", "close"] as const;

const STEP_ICON: Record<Step, string> = {
  meet: "handshake",
  approach: "flag",
  propose_exclusive: "flag",
  sign_nda: "search",
  diligence: "search",
  offer: "layers",
  committee: "gavel",
  bid: "gavel",
  raise: "up",
  wait: "clock",
  operate: "portfolio",
};

const INTENT_TONE: Record<Intent, "muted" | "warn" | "accent" | "good"> = {
  closed: "muted",
  thinking: "warn",
  open: "accent",
  eager: "good",
};

/** What each relationship threshold unlocks, as a symbol and two words. */
const MARKS = [
  ["intent", "eye"],
  ["early", "clock"],
  ["propose", "flag"],
] as const;

const ACCESS_ORDER: Access[] = ["stranger", "acquainted", "trusted", "confidant"];

/** Where on the road this company stands. The sim says what to do; this only places it on the track. */
function position(row: CompanyRow): number {
  const { step, block } = row.next;
  if (row.in_deal) {
    if (step === "diligence" || block === "reports_due") {
      return 4;
    }
    if (step === "offer" || step === "committee") {
      return 5;
    }
    return 6;
  }
  if (step === "sign_nda" || step === "propose_exclusive") {
    return step === "sign_nda" ? 3 : 2;
  }
  if (step === "approach") {
    return 2;
  }
  return row.relationship > 0 ? 1 : 0;
}

/** A compact label for tables and lists: the step, greyed when blocked. */
export function StepChip({ row }: { row: CompanyRow }) {
  const t = useT();
  const { step, block } = row.next;
  return (
    <span className="step-chip" data-blocked={block ? "true" : undefined} data-step={step} title={block ? t(`block.${block}`, { months: 12 }) : t(`step.${step}.why`)}>
      <Icon name={block && step !== "wait" ? "lock" : STEP_ICON[step]} size={13} />
      {t(`step.${step}`)}
    </span>
  );
}

/** Relationship as three pips, with a dot for what the owner says about selling. */
export function AccessPips({ row }: { row: CompanyRow }) {
  const t = useT();
  const level = ACCESS_ORDER.indexOf(row.access);
  return (
    <span className="rel-pips" title={`${t(`access.${row.access}`)} · ${row.relationship}`}>
      {[1, 2, 3].map((step) => (
        <i key={step} data-on={level >= step} />
      ))}
      {row.intent ? <b data-intent={row.intent} title={t(`intent.${row.intent}`)} /> : null}
    </span>
  );
}

/** What the owner says about selling, or that nobody has asked yet. */
export function IntentTag({ intent }: { intent: Intent | null }) {
  const t = useT();
  if (!intent) {
    return <Tag tone="muted">{t("intent.unknown")}</Tag>;
  }
  return <Tag tone={INTENT_TONE[intent]}>{t(`intent.${intent}`)}</Tag>;
}

/**
 * One card that answers three questions about a company the fund does not own: how well the owner
 * knows us, whether they would sell, and the one thing to do now. The sim decides all three.
 */
export function Journey({ company, onOpenDeal }: { company: CompanyView; onOpenDeal: () => void }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const { step, block } = company.next;
  const at = position(company);
  const abroad = company.country !== "US";
  const { approach } = company;
  const level = ACCESS_ORDER.indexOf(company.access);
  const marks = [approach.known_at, approach.early_notice_at, approach.proposal_at];

  const run = () => {
    switch (step) {
      case "meet":
        game.act({ type: "meet_owner", company: company.i });
        break;
      case "approach":
        game.act({ type: "approach_owner", company: company.i });
        break;
      case "propose_exclusive":
        game.act({ type: "propose_exclusive", company: company.i });
        break;
      case "sign_nda":
        game.act({ type: "sign_nda", company: company.i });
        break;
      case "wait":
        game.nextMonth();
        break;
      default:
        onOpenDeal();
    }
  };
  const cost = step === "meet" ? (abroad ? 2 : 1) : step === "approach" || step === "propose_exclusive" ? 1 : 0;
  // Waiting is never blocked: the block is the reason for the wait.
  const disabled = Boolean(block) && step !== "wait";
  const canAlsoMeet = step !== "meet" && step !== "wait" && company.owner.kind !== "public";

  return (
    <section className="card journey">
      <ol className="journey-track" aria-label={t("journey.title")}>
        {NODES.map((node, index) => {
          // A sale in the open lets a stranger sign the NDA: the earlier steps were skipped, not done.
          const earned = index === 0 ? company.relationship > 0 : index === 1 ? company.relationship >= approach.proposal_at : true;
          const state = index === at ? "now" : index < at ? (earned ? "done" : "skipped") : "later";
          return (
            <li key={node} data-state={state}>
              <i>{state === "done" ? <Icon name="check" size={10} /> : null}</i>
              <span>{t(`journey.${node}`)}</span>
            </li>
          );
        })}
      </ol>

      <div className="journey-owner">
        <div className="journey-rel">
          <Meter
            label={t(`access.${company.access}`)}
            text={f.integer(company.relationship)}
            value={company.relationship}
            max={100}
            markers={marks}
            tone={level >= 3 ? "good" : level >= 2 ? "accent" : "ink"}
          />
          <ul className="journey-marks">
            {MARKS.map(([key, icon], index) => (
              <li key={key} data-on={company.relationship >= marks[index]} title={t(`access.${ACCESS_ORDER[index + 1]}.effect`, { known: approach.known_at })}>
                <Icon name={icon} size={12} />
                <b>{marks[index]}</b>
                {t(`journey.mark.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="journey-intent">
          <span className="muted">{t("journey.intent")}</span>
          {company.sale ? (
            <Tag tone="accent">{`${t(`stage.${company.sale.stage}`)} · ${t(`reason.${company.sale.reason}`)}`}</Tag>
          ) : (
            <IntentTag intent={company.intent} />
          )}
          {approach.odds_pct !== null && !company.sale && !company.in_deal ? (
            <span className="journey-odds" title={t("journey.odds", { pct: approach.odds_pct })}>
              <Icon name="flag" size={12} />
              {f.pct(approach.odds_pct * 100, 0)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="journey-next" data-blocked={disabled ? "true" : undefined}>
        <div className="journey-next-text">
          <span className="journey-kicker">{t("journey.next")}</span>
          <p>{t(`step.${step}.why`)}</p>
          {block ? (
            <p className="journey-block" role="note">
              <Icon name={step === "wait" ? "clock" : "lock"} size={13} />
              {t(`block.${block}`, { months: approach.cooldown })}
            </p>
          ) : null}
        </div>
        <div className="journey-buttons">
          <button type="button" className="btn primary" disabled={disabled} onClick={run}>
            <Icon name={STEP_ICON[step]} size={16} />
            {t(`step.${step}`)}
            {cost > 0 ? (
              <span className="journey-cost" title={t("company.attentionLeft", { left: view.attention.left, max: view.attention.max })}>
                <Icon name="bolt" size={11} />
                {cost}
              </span>
            ) : null}
          </button>
          {canAlsoMeet ? (
            <button type="button" className="btn" disabled={view.attention.left < (abroad ? 2 : 1)} onClick={() => game.act({ type: "meet_owner", company: company.i })}>
              <Icon name="handshake" size={15} />
              {t("step.meet")}
              <span className="journey-cost">
                <Icon name="bolt" size={11} />
                {abroad ? 2 : 1}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
