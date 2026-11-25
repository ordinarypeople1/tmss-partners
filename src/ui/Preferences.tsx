import { useState } from "react";
import { LOCALES, type Locale } from "../i18n/config";
import { useLocale } from "../i18n/LocaleProvider";
import { useT } from "../i18n/useT";
import { Icon } from "./icons";
import { isMuted, setMuted } from "./sound";
import { applyTheme, currentTheme, type Theme } from "./theme";

/** Language, theme and sound. Kept on this device; the same on the title screen and in the game. */
export function Preferences({ language = true }: { language?: boolean }) {
  const t = useT();
  const [muted, setMutedState] = useState(isMuted);
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  return (
    <>
      {language ? (
        <select
          className="language"
          value={locale}
          aria-label={t("language.label")}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {t(`language.${code}`)}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        aria-label={t("shell.theme.label")}
        title={t(`shell.theme.${theme}`)}
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          applyTheme(next, true);
          setTheme(next);
        }}
      >
        <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={muted}
        aria-label={muted ? t("shell.sound.off") : t("shell.sound.on")}
        title={muted ? t("shell.sound.off") : t("shell.sound.on")}
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
      >
        <Icon name={muted ? "mute" : "sound"} size={16} />
      </button>
    </>
  );
}
