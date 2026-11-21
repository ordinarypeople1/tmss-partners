import type { Translate } from "../i18n/useT";
import { useT } from "../i18n/useT";
import type { DdFinding, DdReport } from "../sim/types";
import { useFormat, type Format } from "./format";
import { Icon } from "./icons";
import { Overlay } from "./Overlay";
import "./DiligenceReport.css";

const TONE_ICON = { good: "check", neutral: "eye", bad: "alert" } as const;
/** Findings whose wording depends on how they read. */
const BY_TONE = new Set(["working_capital", "growth_vs_market", "management", "market_growth"]);

/** One finding as a sentence, with its figures. */
export function findingText(t: Translate, f: Format, finding: DdFinding): string {
  const key = BY_TONE.has(finding.kind) ? `dd.f.${finding.kind}.${finding.tone}` : `dd.f.${finding.kind}`;
  const text = t(key, {
    amount: f.money(Math.abs(finding.amount)),
    pct: f.pct(Math.abs(finding.bps)),
    signed: f.signedPct(finding.bps),
    days: f.integer(Math.round(finding.bps / 100)),
    score: f.integer(Math.round(finding.bps / 500)),
  });
  if (finding.kind === "customer_concentration" && finding.amount > 0) {
    return `${text} ${t("dd.f.customer_concentration.risk", { amount: f.money(finding.amount) })}`;
  }
  return text;
}

/** The two lines that matter most, for the stream's card. */
export function ReportSummary({ report }: { report: DdReport }) {
  const t = useT();
  const f = useFormat();
  const ranked = [...report.findings].sort((a, b) => (a.tone === "bad" ? -1 : 0) - (b.tone === "bad" ? -1 : 0));
  return (
    <ul className="dd-summary">
      {ranked.slice(0, 2).map((finding, index) => (
        <li key={index} data-tone={finding.tone}>
          <Icon name={TONE_ICON[finding.tone]} size={12} />
          <span>{findingText(t, f, finding)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The whole report: every finding, and the two cases side by side. */
export function ReportDialog({ report, company, onClose }: { report: DdReport; company: string; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const outlook = report.outlook;
  return (
    <Overlay>
      <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t(`dd.title.${report.stream}`)} onClick={onClose}>
        <div className="talk dd-report" onClick={(event) => event.stopPropagation()}>
          <header>
            <span className="talk-kicker">{t(`dd.title.${report.stream}`)}</span>
            <span className="muted clip">
              {company} · {f.date(report.date)}
            </span>
          </header>
          <ul className="dd-findings">
            {report.findings.map((finding, index) => (
              <li key={index} data-tone={finding.tone}>
                <Icon name={TONE_ICON[finding.tone]} size={14} />
                <span>{findingText(t, f, finding)}</span>
              </li>
            ))}
          </ul>
          {outlook ? (
            <table className="table dd-outlook">
              <caption>{t("dd.outlook")}</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col" className="num">
                    {t("dd.outlook.management")}
                  </th>
                  <th scope="col" className="num">
                    {t("dd.outlook.diligence")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t("dd.outlook.growth")}</th>
                  <td className="num">{f.signedPct(outlook.management_growth_bps)}</td>
                  <td className="num" data-tone={outlook.diligence_growth_bps < outlook.management_growth_bps ? "bad" : undefined}>
                    {f.signedPct(outlook.diligence_growth_bps)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{t("dd.outlook.margin")}</th>
                  <td className="num">{f.pct(outlook.management_margin_bps)}</td>
                  <td className="num" data-tone={outlook.diligence_margin_bps < outlook.management_margin_bps ? "bad" : undefined}>
                    {f.pct(outlook.diligence_margin_bps)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}
          <button type="button" className="btn primary" autoFocus onClick={onClose}>
            {t("talk.close")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
