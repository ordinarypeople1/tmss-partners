import { useState } from "react";
import { useT, type Translate } from "../i18n/useT";
import type { CompanyView, IcAnswer, IcFacts, IcMeeting as Meeting, IcQuestion, IcTopic } from "../sim/types";
import { Tag } from "./charts";
import { useFormat, type Format } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { Portrait } from "./Portrait";
import "./IcMeeting.css";

const ANSWERS: IcAnswer[] = ["evidence", "concede", "push_back"];
const ANSWER_ICON: Record<IcAnswer, string> = { evidence: "table", concede: "handshake", push_back: "flag" };

/** The catalog key of a question's subject. */
export function topicKey(topic: IcTopic): string {
  return typeof topic === "string" ? topic : topic.concern;
}

/** The figures a partner quotes, formatted for the question text. */
function factValues(t: Translate, f: Format, facts: IcFacts | null): Record<string, string> {
  if (!facts) {
    return {};
  }
  const list = (items: string[]) => items.join(", ");
  return {
    ev: f.money(facts.ev),
    leverage: f.multiple(facts.leverage_millis),
    cover: f.multiple(facts.cover_millis),
    multiple: f.multiple(facts.multiple_millis),
    premium: facts.price_bps === null ? t("ic.fact.noValuation") : f.signedPct(facts.price_bps - 10_000),
    irr: f.pct(facts.irr_bps),
    equity: f.money(facts.equity),
    limit: f.money(facts.limit),
    missing: list(facts.missing.map((stream) => t(`stream.${stream}`))) || t("term.none"),
    issues: list(facts.issues.map((issue) => t(`issue.${issue}`))) || t("term.none"),
    union: f.pct(facts.union_bps, 0),
    plan: String(facts.plan),
    phase: t(`phase.${facts.phase}`),
  };
}

/**
 * The committee in the room. One partner at a time puts a question; the
 * player picks one of three answers and hears how it landed. After the third
 * the vote is in, and the record stays on the deal.
 */
export function IcMeetingDialog({ company, onClose }: { company: CompanyView; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const deal = company.deal;
  const live: Meeting | null = deal?.ic_meeting ?? null;
  const meeting = live ?? deal?.ic_record ?? null;
  // The question on screen. It moves on only when the player has read the reaction.
  const [at, setAt] = useState(() => (meeting ? Math.max(meeting.questions.findIndex((question) => question.answer === null), 0) : 0));
  if (!deal || !meeting) {
    return null;
  }
  const values = factValues(t, f, deal.ic_facts);
  const question: IcQuestion | undefined = meeting.questions[at];
  const finished = live === null;
  // After the last reaction the player steps to the vote.
  const showVerdict = at >= meeting.questions.length;
  const answer = (choice: IcAnswer) => {
    game.act({ type: "answer_ic", company: company.i, answer: choice });
  };
  const outcome = deal.committee?.outcome ?? null;

  return (
    <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t("ic.title")} onClick={finished ? onClose : undefined}>
      <div className="talk ic" onClick={(event) => event.stopPropagation()}>
        <header>
          <span className="talk-kicker">{t("ic.title")}</span>
          <span className="muted clip">{company.short}</span>
        </header>
        <ol className="ic-progress" aria-label={t("ic.progress")}>
          {meeting.questions.map((item, index) => (
            <li key={index} data-state={item.landed === true ? "yes" : item.landed === false ? "no" : index === at ? "now" : "later"}>
              <Portrait partner={item.partner} size={28} />
            </li>
          ))}
          <li data-state={showVerdict ? "now" : "later"}>
            <Icon name="gavel" size={16} />
          </li>
        </ol>

        {showVerdict || !question ? (
          <Verdict t={t} outcome={outcome} meeting={meeting} />
        ) : (
          <>
            <div className="talk-body">
              <div className="talk-who">
                <Portrait partner={question.partner} mood={question.landed === true ? "for" : question.landed === false ? "against" : "hold"} size={96} />
                <b>{t(`partner.${question.partner}.name`)}</b>
                <small className="muted">{t(`partner.${question.partner}.role`)}</small>
              </div>
              <div className="talk-lines">
                <blockquote className="talk-line">{t(`ic.q.${topicKey(question.topic)}`, values)}</blockquote>
                {question.answer ? (
                  <>
                    <p className="ic-said">
                      <Icon name={ANSWER_ICON[question.answer]} size={13} />
                      {t(`ic.a.${topicKey(question.topic)}.${question.answer}`, values)}
                    </p>
                    <blockquote className="talk-line" data-tone={question.landed ? "good" : "bad"}>
                      {t(`ic.r.${question.answer}.${question.landed ? "yes" : "no"}`)}
                    </blockquote>
                  </>
                ) : null}
              </div>
            </div>
            {question.answer ? (
              <button type="button" className="btn primary" autoFocus onClick={() => setAt(at + 1)}>
                {at + 1 < meeting.questions.length ? t("ic.next") : t("ic.toVote")}
              </button>
            ) : (
              <div className="ic-answers">
                {ANSWERS.map((choice) => (
                  <button key={choice} type="button" className="ic-answer" data-kind={choice} onClick={() => answer(choice)}>
                    <strong>
                      <Icon name={ANSWER_ICON[choice]} size={14} />
                      {t(`ic.kind.${choice}`)}
                    </strong>
                    <span>{t(`ic.a.${topicKey(question.topic)}.${choice}`, values)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {showVerdict || !question ? (
          <button type="button" className="btn primary" autoFocus onClick={onClose}>
            {t("talk.close")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Verdict({ t, outcome, meeting }: { t: Translate; outcome: string | null; meeting: Meeting }) {
  const tone = outcome === "approved" ? "good" : outcome === "rejected" ? "bad" : "warn";
  return (
    <div className="ic-verdict">
      <Tag tone={tone} icon={<Icon name="gavel" size={13} />}>
        {outcome ? t(`outcome.${outcome}`) : t("ic.pending")}
      </Tag>
      <p>{outcome ? t(`ic.verdict.${outcome}`) : null}</p>
      {meeting.conditions.length > 0 ? (
        <p className="muted">{t("ic.conditions", { streams: meeting.conditions.map((stream) => t(`stream.${stream}`)).join(", ") })}</p>
      ) : null}
      {meeting.cut_bps > 0 ? <p className="muted">{t("ic.cut", { pct: (meeting.cut_bps / 100).toFixed(1) })}</p> : null}
    </div>
  );
}
