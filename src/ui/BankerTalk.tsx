import type { ReactNode } from "react";
import { useT, type Translate } from "../i18n/useT";
import { Overlay } from "./Overlay";
import type { CoverLine, CoverTalk, View } from "../sim/types";
import { Meter, Tag } from "./charts";
import { useGame } from "./game";
import { Icon } from "./icons";
import { pick } from "./lines";
import { AdviserLink, FollowContext, PersonLink, useRich } from "./Links";
import { Portrait } from "./Portrait";

/** One of the banker's lines, with its figures filled in. */
type Rich = ReturnType<typeof useRich>;

/** One of the banker's lines, its houses and companies linked to their pages. */
function lineText(t: Translate, rich: Rich, view: View, line: CoverLine, seed: number): ReactNode {
  switch (line.kind) {
    case "market":
      return t(pick(`cover.line.market.${line.phase}`, seed));
    case "credit":
      return t(pick(line.spread_bps >= 450 ? "cover.line.credit.tight" : "cover.line.credit.easy", seed), { spread: (line.spread_bps / 100).toFixed(2) });
    case "sector":
      return t(pick("cover.line.sector", seed), { sector: t(`sector.${line.sector}`), months: String(line.months) });
    case "rival":
      return rich(pick("cover.line.rival", seed), { house: view.rivals[line.house] ?? "", sector: t(`sector.${line.sector}`) }, { house: { kind: "house", id: line.house } });
    case "pipeline":
    {
      const row = view.companies.find((item) => item.name === line.company);
      return rich(
        pick("cover.line.pipeline", seed),
        { company: line.company, months: String(line.months) },
        row ? { company: { kind: "company", id: row.i } } : {},
      );
    }
    case "reputation":
      return t(pick(line.good ? "cover.line.reputation.good" : "cover.line.reputation.bad", seed));
  }
}

/** How the banker opens: a stranger is sized up, a regular is welcomed, a friend is told first. */
function opener(before: number, list: number, headsUp: number): string {
  return before >= headsUp ? "cover.close" : before >= list ? "cover.open.warm" : "cover.open.cold";
}

/**
 * The coverage meeting: the banker who covers the fund at this bank, a line
 * or two of what they know, and how much closer the relationship got.
 */
export function BankerTalk({ talk, onClose }: { talk: CoverTalk; onClose: () => void }) {
  const t = useT();
  const rich = useRich();
  const { view } = useGame();
  const adviser = view.advisers[talk.adviser];
  if (!adviser) {
    return null;
  }
  const [list, favour, headsUp] = view.coverage_marks;
  // The month, the bank and how well it knows the fund pick the words.
  const seed = talk.before + talk.adviser * 7 + view.month;
  const crossed = [
    ["list", list],
    ["favour", favour],
    ["headsUp", headsUp],
  ].filter(([, mark]) => talk.before < Number(mark) && talk.after >= Number(mark));
  return (
    <Overlay>
    <FollowContext.Provider value={onClose}>
    <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t("cover.title")} onClick={onClose}>
      <div className="talk" onClick={(event) => event.stopPropagation()}>
        <header>
          <span className="talk-kicker">{t("cover.title")}</span>
          <span className="muted clip">
            <AdviserLink adviser={talk.adviser} />
          </span>
        </header>
        <div className="talk-body">
          <div className="talk-who">
            <Portrait seed={adviser.banker.name} feminine={adviser.banker.feminine} country="US" size={96} />
            <b>
              <PersonLink role="banker" id={talk.adviser}>
                {adviser.banker.name}
              </PersonLink>
            </b>
            <small className="muted">{t("cover.role", { bank: adviser.name })}</small>
          </div>
          <div className="talk-lines">
            <blockquote className="talk-line">{t(pick(opener(talk.before, list, headsUp), seed))}</blockquote>
            {talk.lines.map((line, index) => (
              <blockquote key={index} className="talk-line">
                {lineText(t, rich, view, line, seed + index * 3)}
              </blockquote>
            ))}
          </div>
        </div>
        <div className="talk-result">
          <Meter label={t("banks.coverage")} text={`${talk.before} → ${talk.after}`} value={talk.after} max={100} markers={[list, favour, headsUp]} tone={talk.after >= headsUp ? "good" : "accent"} />
          <div className="talk-tags">
            {crossed.map(([key]) => (
              <Tag key={String(key)} tone="good" icon={<Icon name="check" size={12} />}>
                {t(`banks.mark.${key}`)}
              </Tag>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary" autoFocus onClick={onClose}>
          {t("talk.close")}
        </button>
      </div>
    </div>
    </FollowContext.Provider>
    </Overlay>
  );
}
