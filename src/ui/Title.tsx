import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { useFormat } from "./format";
import type { TitleControls } from "./game";
import { Icon } from "./icons";
import { NewGame } from "./NewGame";
import { Preferences } from "./Preferences";
import "./Title.css";

/** The first screen: continue the game on this device or start a new one. */
export function Title({ saved, resume, newGame }: TitleControls) {
  const t = useT();
  const f = useFormat();
  const [choosing, setChoosing] = useState(false);
  const first = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <div className="title-screen">
      <svg className="title-grid" aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none">
        {[12, 30, 48, 66, 84].map((y) => (
          <line key={`h${y}`} x1="0" x2="100" y1={y} y2={y} />
        ))}
        {[18, 42, 66, 90].map((x) => (
          <line key={`v${x}`} y1="0" y2="100" x1={x} x2={x} />
        ))}
      </svg>
      <main className="title-card">
        <header className="title-brand">
          <span className="title-mark" aria-hidden>
            <Icon name="map" size={22} />
          </span>
          <h1>{t("app.title")}</h1>
          <p>{t("title.tagline")}</p>
        </header>

        <nav className="title-actions" aria-label={t("title.menu")}>
          {saved ? (
            <button ref={first} type="button" className="btn primary title-continue" data-title="continue" onClick={resume}>
              <span className="title-continue-label">
                <Icon name="play" size={16} />
                {t("title.continue")}
              </span>
              <small>
                {t("title.saved", {
                  date: f.date(saved.date),
                  rank: t(`rank.${saved.rank}`),
                  house: t(`app.house.${saved.house}`),
                  deals: saved.deals,
                })}
              </small>
            </button>
          ) : null}
          <button
            ref={saved ? undefined : first}
            type="button"
            className={saved ? "btn" : "btn primary"}
            data-title="new"
            onClick={() => setChoosing(true)}
          >
            <Icon name="restart" size={16} />
            {t("title.newGame")}
          </button>
        </nav>

        <footer className="title-footer">
          <div className="settings">
            <Preferences />
          </div>
          <small className="muted">{t("title.storage")}</small>
        </footer>
      </main>
      {choosing ? (
        <NewGame onClose={() => setChoosing(false)} onStart={newGame} initial={saved?.options} replaces={saved !== null} />
      ) : null}
    </div>
  );
}
