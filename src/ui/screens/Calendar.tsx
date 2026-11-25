import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "../../i18n/useT";
import { BLOCS, type Bloc, type CompanyRow, type GameDate, type MacroCategory, type MacroEventView } from "../../sim/types";
import { Stat, Tag } from "../charts";
import { useFormat } from "../format";
import { useGame, type Screen } from "../game";
import { Icon } from "../icons";
import { Overlay } from "../Overlay";
import { addMonths, daysIn, effectText, effectTone, exposedTo, formatMacroValue, formatSurprise, sameMonth, weekday } from "../macro";
import "./Calendar.css";

/** Months the calendar pages back and ahead of the open month. */
const BACK = 24;
const AHEAD = 12;
/** Chips a grid cell shows before it folds the rest into "+n". */
const CELL_CHIPS = 3;

type Layer = MacroCategory | "mine";
const LAYERS: Layer[] = ["central_bank", "data", "politics", "mine"];

/** Something with a date that is the player's own, not the world's. */
interface MineItem {
  key: string;
  date: GameDate;
  day: number;
  kind: "sale_stage" | "decision" | "covenant" | "objectives_review" | "objectives_set" | "investment_period" | "term";
  company: number | null;
  screen: Screen;
  stage?: string;
}

type Entry = { type: "event"; event: MacroEventView } | { type: "mine"; item: MineItem };

function dayOf(entry: Entry): number {
  return entry.type === "event" ? entry.event.day : entry.item.day;
}

function compareDates(a: GameDate, b: GameDate): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function Calendar() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const open = view.date;
  const events = view.calendar.events;

  const [shown, setShown] = useState<GameDate>(open);
  const [blocs, setBlocs] = useState<Bloc[]>(BLOCS);
  const [layers, setLayers] = useState<Layer[]>(LAYERS);
  const [majorOnly, setMajorOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // A link from the inbox opens the calendar on its event.
  useEffect(() => {
    if (game.calendarEvent === null) {
      return;
    }
    const event = events.find((item) => item.id === game.calendarEvent);
    if (event) {
      setShown(event.date);
      setPicked(`event-${event.id}`);
    }
    game.showEvent(null);
  }, [game, events]);

  // A closed month brings the calendar back to the month that is open.
  useEffect(() => {
    setShown(open);
  }, [open]);

  const watchedRows = useMemo(
    () => view.companies.filter((row) => row.owner.kind === "player" || row.in_deal || row.watched),
    [view.companies],
  );

  const mine = useMemo(() => {
    const items: MineItem[] = [];
    const end = (date: GameDate) => daysIn(date);
    for (const row of view.companies) {
      if (row.in_deal && row.sale) {
        const date = addMonths(open, row.sale.months_left);
        items.push({ key: `sale-${row.i}`, date, day: end(date), kind: "sale_stage", company: row.i, screen: "deals", stage: row.sale.stage });
      }
    }
    for (const message of view.messages) {
      if (message.decision && message.decision.chosen === null) {
        const date = addMonths(open, Math.max(message.decision.due_month - view.month, 0));
        items.push({ key: `decision-${message.id}`, date, day: end(date), kind: "decision", company: message.company, screen: "inbox" });
      }
    }
    const holds = view.companies.some((row) => row.owner.kind === "player");
    for (let ahead = 0; ahead <= AHEAD; ahead += 1) {
      const date = addMonths(open, ahead);
      if (holds && date.month % 3 === 0) {
        items.push({ key: `covenant-${date.year}-${date.month}`, date, day: end(date), kind: "covenant", company: null, screen: "portfolio" });
      }
      if (date.month === 12) {
        items.push({ key: `review-${date.year}`, date, day: end(date), kind: "objectives_review", company: null, screen: "career" });
      }
      if (date.month === 1 && ahead > 0) {
        items.push({ key: `set-${date.year}`, date, day: 1, kind: "objectives_set", company: null, screen: "career" });
      }
    }
    for (const [kind, date] of [
      ["investment_period", view.fund.investment_period_ends],
      ["term", view.fund.term_ends],
    ] as const) {
      if (compareDates(date, open) >= 0) {
        items.push({ key: `${kind}`, date, day: 1, kind, company: null, screen: "fund" });
      }
    }
    return items;
  }, [view, open]);

  const exposure = useMemo(() => {
    const map = new Map<number, CompanyRow[]>();
    for (const event of events) {
      map.set(event.id, exposedTo(event, watchedRows));
    }
    return map;
  }, [events, watchedRows]);

  const visible = (event: MacroEventView) =>
    blocs.includes(event.bloc) &&
    layers.includes(event.category) &&
    (!majorOnly || event.importance >= 3) &&
    (!mineOnly || (exposure.get(event.id)?.length ?? 0) > 0);

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const event of events) {
      if (sameMonth(event.date, shown) && visible(event)) {
        list.push({ type: "event", event });
      }
    }
    if (layers.includes("mine")) {
      for (const item of mine) {
        if (sameMonth(item.date, shown)) {
          list.push({ type: "mine", item });
        }
      }
    }
    return list.sort((a, b) => dayOf(a) - dayOf(b));
    // `visible` reads the filter state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mine, shown, blocs, layers, majorOnly, mineOnly, exposure]);

  const byDay = useMemo(() => {
    const map = new Map<number, Entry[]>();
    for (const entry of entries) {
      const list = map.get(dayOf(entry)) ?? [];
      list.push(entry);
      map.set(dayOf(entry), list);
    }
    return map;
  }, [entries]);

  const earliest = addMonths(open, -BACK);
  const latest = addMonths(open, AHEAD);
  const canBack = compareDates(shown, earliest) > 0;
  const canAhead = compareDates(shown, latest) < 0;
  const timing = compareDates(shown, open) < 0 ? "past" : sameMonth(shown, open) ? "open" : "ahead";

  const keyOf = (entry: Entry) => (entry.type === "event" ? `event-${entry.event.id}` : `mine-${entry.item.key}`);
  const selected = entries.find((entry) => keyOf(entry) === picked) ?? null;

  const headline = useMemo(() => {
    const thisMonth = events.filter((event) => sameMonth(event.date, open) && event.importance >= 3);
    const ownThisMonth = mine.filter((item) => sameMonth(item.date, open));
    return { events: thisMonth, mine: ownThisMonth };
  }, [events, mine, open]);

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) =>
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const eventLabel = (event: MacroEventView) => t(`macro.short.${event.kind}`);
  const mineLabel = (item: MineItem) =>
    t(`calendar.mine.${item.kind}`, {
      company: item.company === null ? "" : (game.rows.get(item.company)?.short ?? ""),
      stage: item.stage ? t(`stage.${item.stage}`) : "",
    });

  const pick = (date: GameDate, key: string) => {
    setShown(date);
    setPicked(key);
  };

  const chip = (entry: Entry, compact: boolean) => {
    const key = keyOf(entry);
    if (entry.type === "mine") {
      return (
        <button key={key} type="button" className="cal-chip" data-kind="mine" aria-pressed={picked === key} onClick={() => pick(entry.item.date, key)}>
          <Icon name="flag" size={12} />
          <span>{mineLabel(entry.item)}</span>
        </button>
      );
    }
    const { event } = entry;
    const surprise = event.surprise_centi ?? 0;
    const exposed = (exposure.get(event.id)?.length ?? 0) > 0;
    return (
      <button
        key={key}
        type="button"
        className="cal-chip"
        data-bloc={event.bloc}
        data-importance={event.importance}
        data-resolved={event.actual !== null}
        data-surprise={event.actual === null ? undefined : surprise >= 100 ? "above" : surprise <= -100 ? "below" : "inline"}
        aria-pressed={picked === key}
        onClick={() => pick(event.date, key)}
      >
        <i aria-hidden="true" />
        <span>{compact ? eventLabel(event) : t(`macro.event.${event.kind}`)}</span>
        {event.importance >= 3 ? <b className="cal-star" aria-label={t("calendar.major")}>★</b> : null}
        {exposed ? <Icon name="portfolio" size={12} title={t("calendar.exposedTip")} /> : null}
      </button>
    );
  };

  const first = weekday(shown, 1);
  const days = daysIn(shown);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <div className="calendar stack">
      <header className="page-head">
        <div>
          <h1>{t("calendar.title")}</h1>
          <p>{t("calendar.lead")}</p>
        </div>
        <div className="cal-nav">
          <button type="button" className="btn ghost small" disabled={!canBack} onClick={() => setShown(addMonths(shown, -1))} aria-label={t("calendar.prev")}>
            <Icon name="down" size={14} />
          </button>
          <strong>{f.date(shown)}</strong>
          <button type="button" className="btn ghost small" disabled={!canAhead} onClick={() => setShown(addMonths(shown, 1))} aria-label={t("calendar.next")}>
            <Icon name="up" size={14} />
          </button>
          <button type="button" className="btn small" disabled={sameMonth(shown, open)} onClick={() => setShown(open)}>
            {t("calendar.today")}
          </button>
        </div>
      </header>

      <section className="card cal-strip">
        <div className="cal-strip-part">
          <h2 className="card-title">
            <Icon name="calendar" size={16} />
            {t("calendar.strip.world", { month: f.date(open) })}
          </h2>
          <div className="cal-chips">
            {headline.events.length === 0 ? <span className="muted">{t("calendar.strip.none")}</span> : headline.events.map((event) => chip({ type: "event", event }, false))}
          </div>
        </div>
        <div className="cal-strip-part">
          <h2 className="card-title">
            <Icon name="flag" size={16} />
            {t("calendar.strip.mine")}
          </h2>
          <div className="cal-chips">
            {headline.mine.length === 0 ? <span className="muted">{t("calendar.strip.noneMine")}</span> : headline.mine.map((item) => chip({ type: "mine", item }, false))}
          </div>
        </div>
        <div className="cal-strip-part cal-moods">
          {BLOCS.map((bloc, index) => (
            <Stat
              key={bloc}
              label={t("calendar.mood", { bloc: t(`bloc.${bloc}`) })}
              value={f.integer(view.economy.uncertainty[index])}
              tone={view.economy.uncertainty[index] >= 50 ? "warn" : undefined}
              hint={t("calendar.moodHint", { multiple: f.signedPct(view.economy.bloc_multiple_bps[index], 1) })}
            />
          ))}
          <p className="cal-mood-note muted">{t("calendar.moodTip")}</p>
        </div>
      </section>

      <section className="cal-filters" aria-label={t("calendar.filters")}>
        <div className="cal-filter-group">
          {BLOCS.map((bloc) => (
            <button key={bloc} type="button" className="chip" data-bloc={bloc} aria-pressed={blocs.includes(bloc)} onClick={() => toggle(blocs, bloc, setBlocs)}>
              <i aria-hidden="true" />
              {t(`bloc.${bloc}`)}
            </button>
          ))}
        </div>
        <div className="cal-filter-group">
          {LAYERS.map((layer) => (
            <button key={layer} type="button" className="chip" aria-pressed={layers.includes(layer)} onClick={() => toggle(layers, layer, setLayers)}>
              {t(`calendar.layer.${layer}`)}
            </button>
          ))}
        </div>
        <div className="cal-filter-group">
          <button type="button" className="chip" aria-pressed={majorOnly} onClick={() => setMajorOnly(!majorOnly)}>
            {t("calendar.majorOnly")}
          </button>
          <button type="button" className="chip" aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)}>
            {t("calendar.mineOnly")}
          </button>
        </div>
      </section>

      <div className="cal-body">
        <section className="card cal-month" data-timing={timing}>
          <div className="cal-grid" role="grid" aria-label={f.date(shown)}>
            {Array.from({ length: 7 }, (_, day) => (
              <div key={`head-${day}`} className="cal-head" role="columnheader">
                {t(`calendar.weekday.${day}`)}
              </div>
            ))}
            {cells.map((day, index) => {
              if (day === null) {
                return <div key={`blank-${index}`} className="cal-cell" data-blank="true" />;
              }
              const list = byDay.get(day) ?? [];
              const weekend = index % 7 === 0 || index % 7 === 6;
              return (
                <div key={day} className="cal-cell" data-weekend={weekend} role="gridcell">
                  <span className="cal-day">{f.integer(day)}</span>
                  {list.slice(0, CELL_CHIPS).map((entry) => chip(entry, true))}
                  {list.length > CELL_CHIPS ? (
                    <button type="button" className="cal-more" onClick={() => setPicked(keyOf(list[CELL_CHIPS]))}>
                      {t("calendar.more", { count: list.length - CELL_CHIPS })}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <ol className="cal-agenda">
            {entries.length === 0 ? <li className="muted">{t("calendar.empty")}</li> : null}
            {[...byDay.entries()].map(([day, list]) => (
              <li key={day}>
                <span className="cal-agenda-day">
                  <strong>{f.integer(day)}</strong>
                  <small>{t(`calendar.weekday.${weekday(shown, day)}`)}</small>
                </span>
                <div className="cal-chips">{list.map((entry) => chip(entry, false))}</div>
              </li>
            ))}
          </ol>
        </section>

      </div>

      {selected === null ? null : (
        <EntryDialog
          label={selected.type === "mine" ? mineLabel(selected.item) : t(`macro.event.${selected.event.kind}`)}
          onClose={() => setPicked(null)}
        >
          {selected.type === "mine" ? (
            <MineDetail item={selected.item} label={mineLabel(selected.item)} onDone={() => setPicked(null)} />
          ) : (
            <EventDetail event={selected.event} exposed={exposure.get(selected.event.id) ?? []} onDone={() => setPicked(null)} />
          )}
        </EntryDialog>
      )}
    </div>
  );
}

/** One event or deadline over the calendar. Escape, the scrim or the button closes it. */
function EntryDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Overlay>
      <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
        <div className="talk cal-dialog" onClick={(event) => event.stopPropagation()}>
          {children}
          <button type="button" className="btn primary" autoFocus onClick={onClose}>
            {t("talk.close")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function MineDetail({ item, label, onDone }: { item: MineItem; label: string; onDone: () => void }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  return (
    <div className="stack">
      <h2 className="card-title">
        <Icon name="flag" size={16} />
        {label}
      </h2>
      <p className="muted">{t("calendar.dayOf", { date: f.date(item.date), day: item.day })}</p>
      <p>{t(`calendar.mineAbout.${item.kind}`)}</p>
      <div className="row">
        <button
          type="button"
          className="btn small"
          onClick={() => {
            onDone();
            game.go(item.screen);
          }}
        >
          {t(`nav.${item.screen}`)}
        </button>
        {item.company !== null ? (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              onDone();
              game.select(item.company);
            }}
          >
            {t("calendar.openCompany")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EventDetail({ event, exposed, onDone }: { event: MacroEventView; exposed: CompanyRow[]; onDone: () => void }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const election = event.unit === "party";
  const value = (amount: number | null, resolved = true) =>
    amount === null ? t("calendar.unknown") : formatMacroValue(t, f, event.unit, amount, resolved);
  const history = view.calendar.events
    .filter((item) => item.kind === event.kind && item.surprise_centi !== null && compareDates(item.date, event.date) <= 0)
    .slice(-6);

  return (
    <div className="stack">
      <div className="row between">
        <h2 className="card-title">{t(`macro.event.${event.kind}`)}</h2>
        <Tag tone={event.importance >= 3 ? "accent" : "muted"}>{t(`bloc.${event.bloc}`)}</Tag>
      </div>
      <p className="muted">
        {t("calendar.dayOf", { date: f.date(event.date), day: event.day })}
        {" · "}
        {t(`calendar.layer.${event.category}`)}
      </p>
      <p>{t(`macro.about.${event.kind}`)}</p>

      {election ? (
        <div className="cal-stats">
          <Stat label={t("calendar.poll")} value={value(event.consensus, false)} />
          <Stat label={t("calendar.winner")} value={value(event.actual)} tone={event.upset ? "warn" : undefined} hint={event.upset ? t("calendar.upset") : undefined} />
        </div>
      ) : (
        <div className="cal-stats">
          <Stat label={t("calendar.previous")} value={value(event.previous)} />
          <Stat
            label={t("calendar.consensus")}
            value={value(event.consensus)}
            hint={event.range ? t("calendar.range", { low: value(event.range[0]), high: value(event.range[1]) }) : undefined}
          />
          <Stat
            label={t("calendar.actual")}
            value={value(event.actual)}
            delta={event.surprise_centi === null ? undefined : formatSurprise(f, event.surprise_centi)}
            tone={event.surprise_centi === null ? undefined : Math.abs(event.surprise_centi) >= 100 ? "warn" : undefined}
          />
        </div>
      )}

      {event.consensus === null && event.actual === null && !election ? <p className="muted">{t("calendar.noConsensus")}</p> : null}

      {event.stance !== null ? (
        <div className="cal-stance" aria-label={t(`calendar.stance.${event.stance}`)}>
          <span className="muted">{t("calendar.stanceLabel")}</span>
          <ol>
            {[-2, -1, 0, 1, 2].map((step) => (
              <li key={step} data-on={step === event.stance} data-side={step < 0 ? "dove" : step > 0 ? "hawk" : "middle"} />
            ))}
          </ol>
          <strong>{t(`calendar.stance.${event.stance}`)}</strong>
        </div>
      ) : null}

      {election ? (
        <ul className="cal-parties">
          {view.calendar.parties.map((party, index) => (
            <li key={index}>
              <strong>{t(`party.${index}`)}</strong>
              <Tag tone={party.lean > 0 ? "good" : party.lean < 0 ? "warn" : "muted"}>{t(`calendar.lean.${party.lean > 0 ? "pro" : party.lean < 0 ? "con" : "mid"}`)}</Tag>
              {view.calendar.incumbent === index ? <Tag tone="muted">{t("calendar.incumbent")}</Tag> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {event.effects.length > 0 ? (
        <div className="stack">
          <h3 className="card-title">{t("calendar.effects")}</h3>
          <ul className="cal-effects">
            {event.effects.map((effect, index) => {
              const text = effectText(t, f, effect);
              return (
                <li key={index} data-tone={effectTone(effect)}>
                  <span>{text.label}</span>
                  <strong>{text.value}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      ) : event.actual !== null ? (
        <p className="muted">{t("calendar.noEffects")}</p>
      ) : null}

      {history.length > 0 && !election ? (
        <div className="stack">
          <h3 className="card-title">{t("calendar.history")}</h3>
          <ol className="cal-history">
            {history.map((item) => (
              <li key={item.id} data-sign={(item.surprise_centi ?? 0) >= 0 ? "up" : "down"} title={f.date(item.date)}>
                <i style={{ height: `${Math.min(Math.abs(item.surprise_centi ?? 0), 300) / 6 + 2}px` }} />
                <small>{formatSurprise(f, item.surprise_centi ?? 0)}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="stack">
        <h3 className="card-title">{t("calendar.exposed")}</h3>
        {exposed.length === 0 ? (
          <p className="muted">{t("calendar.exposedNone")}</p>
        ) : (
          <ul className="cal-exposed">
            {exposed.map((row) => (
              <li key={row.i}>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    onDone();
                    game.select(row.i);
                  }}
                >
                  {row.short}
                </button>
                <small className="muted">{t(row.owner.kind === "player" ? "calendar.held" : row.in_deal ? "calendar.inDeal" : "calendar.watched")}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
