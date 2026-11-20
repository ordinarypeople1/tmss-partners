import { useState } from "react";
import { useT } from "../i18n/useT";
import type { Access, CompanyRow, CompanyView, Intent, Step } from "../sim/types";
import { Meter, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { Portrait } from "./Portrait";
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

/** Where the company stands on the road, and how the owner feels: the last card of the profile. */
export function Journey({ company }: { company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const at = position(company);
  const { approach } = company;
  const level = ACCESS_ORDER.indexOf(company.access);
  const marks = [approach.known_at, approach.early_notice_at, approach.proposal_at];
  return (
    <section className="card journey">
      <h3>{t("journey.title")}</h3>
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
    </section>
  );
}

interface Talk {
  kind: "meet" | "yes" | "no";
  before: number;
}

/** The step to take, always in reach at the foot of the company panel. */
export function ActionBar({ company, onOpenDeal }: { company: CompanyView; onOpenDeal: () => void }) {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const { step, block } = company.next;
  const abroad = company.country !== "US";
  const { approach } = company;
  const [talk, setTalk] = useState<Talk | null>(null);

  const meet = () => {
    const before = company.relationship;
    if (game.act({ type: "meet_owner", company: company.i })) {
      setTalk({ kind: "meet", before });
    }
  };
  const run = () => {
    switch (step) {
      case "meet":
        meet();
        break;
      case "approach": {
        const before = company.relationship;
        if (game.act({ type: "approach_owner", company: company.i })) {
          // The sim answered inside the command: a deal file means yes.
          setTalk({ kind: game.peek(company.i)?.in_deal ? "yes" : "no", before });
        }
        break;
      }
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
    <>
      <footer className="action-bar" data-blocked={disabled ? "true" : undefined}>
        <div className="action-text">
          <span className="journey-kicker">{t("journey.next")}</span>
          <p>{block ? t(`block.${block}`, { months: approach.cooldown }) : t(`step.${step}.why`)}</p>
        </div>
        <div className="journey-buttons">
          {canAlsoMeet ? (
            <button type="button" className="btn" disabled={view.attention.left < (abroad ? 2 : 1)} onClick={meet}>
              <Icon name="handshake" size={15} />
              {t("step.meet")}
              <span className="journey-cost">
                <Icon name="bolt" size={11} />
                {abroad ? 2 : 1}
              </span>
            </button>
          ) : null}
          <button type="button" className="btn primary" disabled={disabled} onClick={run}>
            <Icon name={disabled ? "lock" : STEP_ICON[step]} size={16} />
            {t(`step.${step}`)}
            {cost > 0 ? (
              <span className="journey-cost" title={t("company.attentionLeft", { left: view.attention.left, max: view.attention.max })}>
                <Icon name="bolt" size={11} />
                {cost}
              </span>
            ) : null}
          </button>
        </div>
      </footer>
      {talk ? <OwnerTalk company={company} talk={talk} onClose={() => setTalk(null)} /> : null}
    </>
  );
}

/** What was said across the table: who it was, one line, and what the meeting changed. */
function OwnerTalk({ company, talk, onClose }: { company: CompanyView; talk: Talk; onClose: () => void }) {
  const game = useGame();
  const t = useT();
  const { approach } = company;
  const after = company.relationship;
  const founder = company.owner.kind === "founder";
  const house = company.owner.kind === "sponsor" ? (game.view.rivals[company.owner.house] ?? "") : "";
  const marks = [approach.known_at, approach.early_notice_at, approach.proposal_at];
  const unlocked = MARKS.filter((_, index) => talk.before < marks[index] && after >= marks[index]);
  const variant = ((company.i + talk.before) % 2) + 1;
  const line =
    talk.kind === "yes"
      ? "talk.yes"
      : talk.kind === "no"
        ? "talk.no"
        : company.sale
          ? "talk.meet.sale"
          : talk.before === 0
            ? `talk.meet.first.${variant}`
            : company.intent
              ? `talk.meet.${company.intent}.${variant}`
              : "talk.meet.unknown";
  return (
    <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t(`talk.title.${talk.kind}`)} onClick={onClose}>
      <div className="talk" data-kind={talk.kind} onClick={(event) => event.stopPropagation()}>
        <header>
          <span className="talk-kicker">{t(`talk.title.${talk.kind}`)}</span>
          <span className="muted clip">{company.short}</span>
        </header>
        <div className="talk-body">
          <div className="talk-who">
            <Portrait seed={founder ? company.ceo.name : `${company.owner.kind}-${company.i}`} feminine={founder ? company.ceo.feminine : company.i % 2 === 0} size={104} />
            <b>{founder ? company.ceo.name : t(`talk.role.${company.owner.kind}`, { house })}</b>
            {founder ? <small className="muted">{t("talk.role.founder")}</small> : null}
          </div>
          <blockquote className="talk-line">{t(line)}</blockquote>
        </div>
        <div className="talk-result">
          <Meter label={t(`access.${company.access}`)} text={t("talk.gain", { before: talk.before, after })} value={after} max={100} markers={marks} tone={after >= approach.proposal_at ? "good" : "accent"} />
          <div className="talk-tags">
            {unlocked.map(([key, icon]) => (
              <Tag key={key} tone="good" icon={<Icon name={icon} size={12} />}>
                {t("talk.unlocked", { what: t(`journey.mark.${key}`) })}
              </Tag>
            ))}
            {company.sale || talk.kind !== "meet" ? null : <IntentTag intent={company.intent} />}
            {talk.kind === "yes" ? <Tag tone="good">{t("stage.exclusive")}</Tag> : null}
            {talk.kind === "no" ? <Tag tone="bad">{t("block.owner_not_ready", { months: approach.cooldown })}</Tag> : null}
          </div>
        </div>
        <button type="button" className="btn primary" autoFocus onClick={onClose}>
          {t("talk.close")}
        </button>
      </div>
    </div>
  );
}
