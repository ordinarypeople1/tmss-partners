import { useEffect, useRef, type KeyboardEvent } from "react";
import { useT } from "../i18n/useT";
import { Icon } from "./icons";
import "./NewGame.css";

/**
 * Asks before a new game replaces the one on this device. The game starts with the
 * default options (standard difficulty, high-rates era); there is no choice to make yet.
 */
export function NewGame({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const t = useT();
  const card = useRef<HTMLDivElement | null>(null);
  const confirm = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirm.current?.focus();
    return () => before?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !card.current) {
      return;
    }
    // Keep Tab inside the dialog.
    const stops = [...card.current.querySelectorAll<HTMLElement>("button")];
    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === firstStop) {
      event.preventDefault();
      lastStop?.focus();
    } else if (!event.shiftKey && document.activeElement === lastStop) {
      event.preventDefault();
      firstStop?.focus();
    }
  };

  return (
    <div
      className="newgame-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={card} className="newgame card stack" role="alertdialog" aria-modal="true" aria-labelledby="newgame-title">
        <div className="row between">
          <h2 id="newgame-title">{t("newgame.title")}</h2>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label={t("newgame.cancel")}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="newgame-warning">
          <Icon name="alert" size={16} />
          {t("newgame.warning")}
        </p>
        <div className="row newgame-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("newgame.cancel")}
          </button>
          <button
            ref={confirm}
            type="button"
            className="btn primary"
            onClick={() => {
              onClose();
              onStart();
            }}
          >
            {t("newgame.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
