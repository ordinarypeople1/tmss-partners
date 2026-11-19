import { useT } from "../i18n/useT";
import type { ObjectiveKind } from "../sim/types";
import { Ring } from "./charts";
import { useFormat } from "./format";
import { useGame, type Screen } from "./game";
import { Icon } from "./icons";
import "./Objectives.css";

/** The screen where each objective is worked on. */
const WHERE: Record<ObjectiveKind, Screen> = {
  close_deals: "deals",
  deploy_capital: "deals",
  build_relationships: "map",
  finish_initiatives: "portfolio",
  clean_covenants: "portfolio",
  exit_count: "portfolio",
  no_rejections: "deals",
};

/** Met for as long as nothing has gone wrong; there is no ratio to show. */
const KEPT = new Set<ObjectiveKind>(["clean_covenants", "no_rejections"]);

/** This year's objectives from the chair, compact, for the sidebar. */
export function Objectives() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { objectives } = game.view;
  if (objectives.length === 0) {
    return null;
  }
  const met = objectives.filter((item) => item.met).length;
  return (
    <section className="objectives">
      <h3>
        <span>{t("objectives.title", { year: game.view.date.year })}</span>
        <b>{t("objectives.count", { met, total: objectives.length })}</b>
      </h3>
      <ul>
        {objectives.map((item) => {
          const kept = KEPT.has(item.kind);
          const money = item.kind === "deploy_capital";
          const state = kept ? (item.met ? "kept" : "broken") : item.met ? "met" : "open";
          const sub = kept
            ? t(`objectives.${state}`)
            : t("objectives.progress", {
                progress: money ? f.shortMoney(item.progress) : f.integer(item.progress),
                target: money ? f.shortMoney(item.target) : f.integer(item.target),
              });
          return (
            <li key={item.kind}>
              <button type="button" className="objective" data-state={state} onClick={() => game.go(WHERE[item.kind])}>
                {state === "open" ? (
                  <Ring fraction={item.target > 0 ? item.progress / item.target : 0} size={20} tone="warn" />
                ) : (
                  <span className="objective-mark">
                    <Icon name={state === "broken" ? "close" : "check"} size={12} />
                  </span>
                )}
                <span className="objective-text">
                  <span>{t(`objective.${item.kind}`, { target: item.target, amount: f.money(item.target) })}</span>
                  <small>{sub}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
