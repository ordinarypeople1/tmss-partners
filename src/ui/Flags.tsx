import type { ReactNode } from "react";
import { LOCALES, type Locale } from "../i18n/config";
import { useLocale } from "../i18n/LocaleProvider";
import { useT } from "../i18n/useT";
import "./Flags.css";

/**
 * Flags drawn in SVG: Windows has no flag emoji, and the game ships on Windows first.
 * English uses the US flag, as the game is set at a US house.
 */
const W = 90;
const H = 60;

/** A five-pointed star centred on (x, y), radius r, one point up (or toward `angle`). */
function star(x: number, y: number, r: number, angle = -90): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.382;
    const a = ((angle + i * 36) * Math.PI) / 180;
    points.push(`${(x + radius * Math.cos(a)).toFixed(2)},${(y + radius * Math.sin(a)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** One trigram of the Korean flag: three bars, each whole or broken, centred and turned. */
function Trigram({ x, y, angle, bars }: { x: number; y: number; angle: number; bars: boolean[] }) {
  const width = 12;
  const height = 2;
  const gap = 1.5;
  return (
    <g transform={`rotate(${angle} ${x} ${y})`} fill="#000">
      {bars.map((whole, index) => {
        const top = y - (3 * height + 2 * gap) / 2 + index * (height + gap);
        return whole ? (
          <rect key={index} x={x - width / 2} y={top} width={width} height={height} />
        ) : (
          <g key={index}>
            <rect x={x - width / 2} y={top} width={width / 2 - 0.8} height={height} />
            <rect x={x + 0.8} y={top} width={width / 2 - 0.8} height={height} />
          </g>
        );
      })}
    </g>
  );
}

function Korea() {
  const cx = W / 2;
  const cy = H / 2;
  const r = 15;
  return (
    <>
      <rect width={W} height={H} fill="#fff" />
      <g transform={`rotate(33.69 ${cx} ${cy})`}>
        <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} Z`} fill="#cd2e3a" />
        <path d={`M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} Z`} fill="#0047a0" />
        <circle cx={cx - r / 2} cy={cy} r={r / 2} fill="#cd2e3a" />
        <circle cx={cx + r / 2} cy={cy} r={r / 2} fill="#0047a0" />
      </g>
      <Trigram x={21} y={14} angle={-56.31} bars={[true, true, true]} />
      <Trigram x={69} y={46} angle={-56.31} bars={[false, false, false]} />
      <Trigram x={69} y={14} angle={56.31} bars={[false, true, false]} />
      <Trigram x={21} y={46} angle={56.31} bars={[true, false, true]} />
    </>
  );
}

function UnitedStates() {
  const stripe = H / 13;
  const cantonW = W * 0.4;
  const cantonH = stripe * 7;
  const stars: ReactNode[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      stars.push(<circle key={`${row}-${col}`} cx={3.2 + col * 6} cy={3 + row * 7.1} r={1.1} fill="#fff" />);
    }
  }
  return (
    <>
      <rect width={W} height={H} fill="#fff" />
      {Array.from({ length: 7 }, (_, index) => (
        <rect key={index} y={index * 2 * stripe} width={W} height={stripe} fill="#b22234" />
      ))}
      <rect width={cantonW} height={cantonH} fill="#3c3b6e" />
      {stars}
    </>
  );
}

function Japan() {
  return (
    <>
      <rect width={W} height={H} fill="#fff" />
      <circle cx={W / 2} cy={H / 2} r={18} fill="#bc002d" />
    </>
  );
}

function China() {
  return (
    <>
      <rect width={W} height={H} fill="#ee1c25" />
      <polygon points={star(15, 15, 9)} fill="#ffff00" />
      <polygon points={star(30, 6, 3, -90 + 31)} fill="#ffff00" />
      <polygon points={star(36, 12, 3, -90 + 8)} fill="#ffff00" />
      <polygon points={star(36, 21, 3, -90 - 16)} fill="#ffff00" />
      <polygon points={star(30, 27, 3, -90 - 38)} fill="#ffff00" />
    </>
  );
}

const FLAG: Record<Locale, () => ReactNode> = {
  ko: Korea,
  en: UnitedStates,
  ja: Japan,
  "zh-Hans": China,
};

export function Flag({ locale, size = 36 }: { locale: Locale; size?: number }) {
  const Drawing = FLAG[locale];
  return (
    <svg className="flag" viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} aria-hidden>
      <Drawing />
    </svg>
  );
}

/** The language, chosen by flag. Arrow keys move along the row, as in a radio group. */
export function LanguageFlags() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div className="flags" role="radiogroup" aria-label={t("language.label")}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={code === locale}
          aria-label={t(`language.${code}`)}
          title={t(`language.${code}`)}
          tabIndex={code === locale ? 0 : -1}
          onClick={() => setLocale(code)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
            if (step === 0) {
              return;
            }
            event.preventDefault();
            const next = LOCALES[(LOCALES.indexOf(code) + step + LOCALES.length) % LOCALES.length];
            setLocale(next);
            const row = event.currentTarget.parentElement;
            window.requestAnimationFrame(() => row?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
          }}
        >
          <Flag locale={code} />
          <span>{t(`language.${code}`)}</span>
        </button>
      ))}
    </div>
  );
}
