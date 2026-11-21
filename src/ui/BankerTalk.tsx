import { useT, type Translate } from "../i18n/useT";
import type { CoverLine, CoverTalk, View } from "../sim/types";
import { Meter, Tag } from "./charts";
import { useGame } from "./game";
import { Icon } from "./icons";
import { Portrait } from "./Portrait";

/** One of the banker's lines, with its figures filled in. */
function lineText(t: Translate, view: View, line: CoverLine, variant: number): string {
  switch (line.kind) {
    case "market":
      return t(`cover.line.market.${line.phase}`);
    case "credit":
      return t(line.spread_bps >= 450 ? `cover.line.credit.tight.${variant}` : `cover.line.credit.easy.${variant}`, { spread: (line.spread_bps / 100).toFixed(2) });
    case "sector":
      return t(`cover.line.sector.${variant}`, { sector: t(`sector.${line.sector}`), months: String(line.months) });
    case "rival":
      return t("cover.line.rival", { house: view.rivals[line.house] ?? "", sector: t(`sector.${line.sector}`) });
    case "pipeline":
      return t("cover.line.pipeline", { company: line.company, months: String(line.months) });
    case "reputation":
      return t(line.good ? "cover.line.reputation.good" : "cover.line.reputation.bad");
  }
}

/**
 * The coverage meeting: the banker who covers the fund at this bank, a line
 * or two of what they know, and how much closer the relationship got.
 */
export function BankerTalk({ talk, onClose }: { talk: CoverTalk; onClose: () => void }) {
  const t = useT();
  const { view } = useGame();
  const adviser = view.advisers[talk.adviser];
  if (!adviser) {
    return null;
  }
  const [list, favour, headsUp] = view.coverage_marks;
  const variant = ((talk.before + talk.adviser) % 2) + 1;
  const crossed = [
    ["list", list],
    ["favour", favour],
    ["headsUp", headsUp],
  ].filter(([, mark]) => talk.before < Number(mark) && talk.after >= Number(mark));
  return (
    <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t("cover.title")} onClick={onClose}>
      <div className="talk" onClick={(event) => event.stopPropagation()}>
        <header>
          <span className="talk-kicker">{t("cover.title")}</span>
          <span className="muted clip">{adviser.name}</span>
        </header>
        <div className="talk-body">
          <div className="talk-who">
            <Portrait seed={adviser.banker.name} feminine={adviser.banker.feminine} country="US" size={96} />
            <b>{adviser.banker.name}</b>
            <small className="muted">{t("cover.role", { bank: adviser.name })}</small>
          </div>
          <div className="talk-lines">
            {talk.lines.map((line, index) => (
              <blockquote key={index} className="talk-line">
                {lineText(t, view, line, variant)}
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
  );
}
