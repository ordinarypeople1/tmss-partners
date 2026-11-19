import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n/useT";
import type { Difficulty, Era } from "../sim/types";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./NewGame.css";

const DIFFICULTIES: Difficulty[] = ["relaxed", "standard", "hard"];
const ERAS: Era[] = ["high_rates", "cheap_money", "late_cycle"];

/** One radio group drawn as large cards. Arrow keys move the choice, as in a native radio group. */
function Picker<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  label,
  autoFocus,
}: {
  name: string;
  legend: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => { title: string; effect: string };
  autoFocus?: boolean;
}) {
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus) {
      first.current?.focus();
    }
  }, [autoFocus]);
  return (
    <fieldset className="newgame-group">
      <legend>{legend}</legend>
      <div className="newgame-options">
        {options.map((option) => {
          const text = label(option);
          return (
            <label key={option} className="newgame-option" data-checked={option === value}>
              <input
                ref={option === value ? first : undefined}
                type="radio"
                name={name}
                value={option}
                checked={option === value}
                onChange={() => onChange(option)}
              />
              <span className="newgame-mark" aria-hidden>
                {option === value ? <Icon name="check" size={14} /> : null}
              </span>
              <strong>{text.title}</strong>
              <small>{text.effect}</small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The dialog that starts a new game: difficulty and era. */
export function NewGame({ onClose }: { onClose: () => void }) {
  const t = useT();
  const game = useGame();
  const [difficulty, setDifficulty] = useState<Difficulty>(game.view.options.difficulty);
  const [era, setEra] = useState<Era>(game.view.options.era);
  const card = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    const stops = [...card.current.querySelectorAll<HTMLElement>("input:checked, button")];
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

  const start = () => {
    game.newGame({ difficulty, era });
    onClose();
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
      <div ref={card} className="newgame card stack" role="dialog" aria-modal="true" aria-labelledby="newgame-title">
        <div className="row between">
          <h2 id="newgame-title">{t("newgame.title")}</h2>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label={t("newgame.cancel")}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="muted">{t("newgame.lead")}</p>
        <Picker
          name="newgame-difficulty"
          legend={t("newgame.difficulty")}
          options={DIFFICULTIES}
          value={difficulty}
          onChange={setDifficulty}
          label={(id) => ({ title: t(`difficulty.${id}`), effect: t(`difficulty.${id}.effect`) })}
          autoFocus
        />
        <Picker
          name="newgame-era"
          legend={t("newgame.era")}
          options={ERAS}
          value={era}
          onChange={setEra}
          label={(id) => ({ title: t(`era.${id}`), effect: t(`era.${id}.effect`) })}
        />
        <p className="newgame-warning">
          <Icon name="alert" size={16} />
          {t("newgame.warning")}
        </p>
        <div className="row newgame-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("newgame.cancel")}
          </button>
          <button type="button" className="btn primary" onClick={start}>
            {t("newgame.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
