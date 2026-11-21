import { useMemo, useState } from "react";
import { useT } from "../i18n/useT";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./Guide.css";

const STEPS = ["wait", "meet", "nda", "diligence", "committee", "bid", "own", "operate", "exit"] as const;
const HIDE_KEY = "deal-atlas.guide.hidden";

function stored(): boolean {
  try {
    const saved = window.localStorage.getItem(HIDE_KEY);
    if (saved !== null) {
      return saved === "1";
    }
  } catch {
    // Storage blocked: fall through to the default.
  }
  // On a phone the checklist starts folded, so it does not cover the map.
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches === true;
}

/**
 * The first deal as a checklist. It reads the view and decides nothing: each
 * step is done when the state already shows it.
 */
export function Guide() {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const [hidden, setHidden] = useState(stored);

  const done = useMemo(() => {
    const closed = view.career.deals_closed > 0;
    const deals = view.deals.map((index) => game.peek(index)?.deal);
    const held = view.companies.filter((row) => row.held).map((row) => game.peek(row.i)?.holding);
    const state: Record<(typeof STEPS)[number], boolean> = {
      wait: closed || view.market.visible > 0 || view.deals.length > 0,
      meet: closed || view.companies.some((row) => row.watched || row.relationship > 0),
      nda: closed || view.deals.length > 0,
      diligence: closed || deals.some((deal) => (deal?.streams_done.length ?? 0) > 0),
      committee: closed || deals.some((deal) => deal?.committee),
      bid: closed || view.companies.some((row) => row.sale?.bid_in),
      own: closed,
      operate: view.career.exits > 0 || held.some((holding) => (holding?.initiatives.length ?? 0) + (holding?.done.length ?? 0) > 0),
      exit: view.career.exits > 0,
    };
    return state;
    // The checklist follows the month and the player's actions, both of which replace `view`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (done.exit) {
    return null;
  }
  const current = STEPS.find((step) => !done[step]) ?? "exit";
  const count = STEPS.filter((step) => done[step]).length;
  const toggle = () => {
    setHidden((value) => {
      try {
        window.localStorage.setItem(HIDE_KEY, value ? "0" : "1");
      } catch {
        // Storage is a convenience here.
      }
      return !value;
    });
  };

  return (
    <aside className="guide" data-hidden={hidden}>
      <button type="button" className="guide-head" aria-expanded={!hidden} aria-label={hidden ? t("guide.show") : t("guide.hide")} onClick={toggle}>
        <Icon name="flag" size={15} />
        <strong>{t("guide.title")}</strong>
        <span>{t("guide.progress", { done: count, total: STEPS.length })}</span>
        <Icon name={hidden ? "down" : "up"} size={13} />
      </button>
      {hidden ? null : (
        <>
          <ol>
            {STEPS.map((step) => (
              <li key={step} data-state={done[step] ? "done" : step === current ? "now" : "later"}>
                <i>{done[step] ? <Icon name="check" size={11} /> : null}</i>
                {t(`guide.step.${step}.title`)}
              </li>
            ))}
          </ol>
          <p>{t(`guide.step.${current}.hint`)}</p>
        </>
      )}
    </aside>
  );
}
