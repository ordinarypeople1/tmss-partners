import { useEffect, useRef, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { formatUsdThousand } from "../i18n/money";
import { GameSession, type GameDate, type SimEvent, type WorldView } from "../sim/wasm";

const SAVE_KEY = "deal-atlas.save.v1";
const NEW_GAME_SEED = 20240101;

function readSave(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeSave(save: string) {
  try {
    window.localStorage.setItem(SAVE_KEY, save);
  } catch {
    // Private windows refuse storage. The game still runs for this visit.
  }
}

async function openSession(): Promise<GameSession> {
  const save = readSave();
  if (save) {
    try {
      return await GameSession.resume(save);
    } catch {
      // A save from another schema starts a new game.
    }
  }
  return GameSession.start(NEW_GAME_SEED);
}

function monthsBetween(from: GameDate, to: GameDate): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

function describeEvent(intl: IntlShape, event: SimEvent): string {
  switch (event.type) {
    case "month_closed":
      return intl.formatMessage({ id: "event.month_closed" }, { month: event.date.month });
    case "quarter_closed":
      return intl.formatMessage({ id: "event.quarter_closed" }, { quarter: event.quarter });
    case "policy_rate_changed":
      return intl.formatMessage(
        { id: "event.policy_rate_changed" },
        { from: event.from_bps / 100, to: event.to_bps / 100 },
      );
    case "investment_period_ended":
      return intl.formatMessage({ id: "event.investment_period_ended" });
    case "fund_term_ended":
      return intl.formatMessage({ id: "event.fund_term_ended" });
  }
}

export function SimClock() {
  const intl = useIntl();
  const session = useRef<GameSession | null>(null);
  const [world, setWorld] = useState<WorldView | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    openSession()
      .then((opened) => {
        if (cancelled) {
          return;
        }
        session.current = opened;
        setWorld(opened.view());
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function advance() {
    const current = session.current;
    if (!current) {
      return;
    }
    setEvents(current.advanceMonth());
    writeSave(current.save());
    setWorld(current.view());
  }

  function restart() {
    GameSession.start(NEW_GAME_SEED)
      .then((opened) => {
        session.current = opened;
        writeSave(opened.save());
        setEvents([]);
        setWorld(opened.view());
      })
      .catch(() => setFailed(true));
  }

  if (failed) {
    return <p className="clock">{intl.formatMessage({ id: "clock.error" })}</p>;
  }
  if (!world) {
    return <p className="clock">{intl.formatMessage({ id: "clock.loading" })}</p>;
  }

  const { fund, economy, date } = world;
  const periodMonths = monthsBetween(fund.started, fund.investment_period_ends);
  const monthsLeft = Math.max(0, monthsBetween(date, fund.investment_period_ends));
  const uncalled = fund.committed - fund.called;

  return (
    <section className="clock" aria-label={intl.formatMessage({ id: "clock.label" })}>
      <p className="clock-date">{intl.formatMessage({ id: "clock.date" }, { year: date.year, month: date.month })}</p>
      <dl className="clock-facts">
        <div>
          <dt>{intl.formatMessage({ id: "clock.policyRate" })}</dt>
          <dd>
            {intl.formatMessage({ id: "clock.rateValue" }, { rate: economy.policy_rate_bps / 100 })}
          </dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "clock.uncalled" })}</dt>
          <dd>{formatUsdThousand(intl, uncalled)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "clock.investmentPeriod" })}</dt>
          <dd>
            <meter min={0} max={periodMonths} value={monthsLeft} />
            {intl.formatMessage({ id: "clock.monthsLeft" }, { months: monthsLeft })}
          </dd>
        </div>
      </dl>
      <ul className="clock-events" aria-live="polite">
        {events.map((event) => (
          <li key={event.seq}>{describeEvent(intl, event)}</li>
        ))}
      </ul>
      <div className="clock-actions">
        <button type="button" className="clock-restart" onClick={restart}>
          {intl.formatMessage({ id: "clock.restart" })}
        </button>
        <button type="button" className="clock-advance" onClick={advance}>
          {intl.formatMessage({ id: "clock.advance" })}
        </button>
      </div>
    </section>
  );
}
