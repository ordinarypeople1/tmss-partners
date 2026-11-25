import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n/useT";
import { useFormat } from "./format";
import { SCREENS, useGame, type Page, type Screen } from "./game";
import { Icon } from "./icons";
import { describeMessage } from "./messages";
import "./Search.css";

/** How many hits a group shows, and how many in all. */
const PER_GROUP = 5;
const TOTAL = 24;
const PARTNER_SEATS = [0, 1, 2, 3, 4, 5];

type Group = "screen" | "company" | "person" | "house" | "adviser" | "message";
const GROUPS: Group[] = ["screen", "company", "person", "house", "adviser", "message"];

interface Entry {
  group: Group;
  label: string;
  sub: string;
  icon: string;
  /** Extra text that matches but is not shown as the label. */
  also?: string;
  go: { screen: Screen } | { page: Page } | { message: number };
}

/** Lower case, no accents: "Ferrières" finds "ferrieres". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** 0 for a match at the start, 1 at the start of a word, 2 anywhere, null for none. */
function score(entry: Entry, query: string): number | null {
  const label = fold(entry.label);
  if (label.startsWith(query)) {
    return 0;
  }
  if (label.split(/[\s,.·&-]+/).some((word) => word.startsWith(query))) {
    return 1;
  }
  if (label.includes(query) || fold(entry.also ?? "").includes(query) || fold(entry.sub).includes(query)) {
    return 2;
  }
  return null;
}

/**
 * One search across the game: screens, companies, people, rival houses, banks and the inbox.
 * Ctrl+K or / puts the cursor in it; arrows move, Enter lands, Esc leaves.
 */
export function Search() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Ctrl+K anywhere, or / when the player is not typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A click outside closes the list.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const screen of SCREENS) {
      list.push({ group: "screen", label: t(`nav.${screen}`), sub: t("search.group.screen"), icon: "layers", go: { screen } });
    }
    for (const row of view.companies) {
      if (row.owner.kind === "merged") {
        continue;
      }
      const place = `${t(`sector.${row.sector}`)} · ${t(`admin1.${row.admin1}`)}`;
      list.push({ group: "company", label: row.short, also: row.name, sub: place, icon: row.sector, go: { page: { kind: "company", id: row.i } } });
      list.push({ group: "person", label: row.ceo_name, sub: t("search.person.ceo", { company: row.short }), icon: "career", go: { page: { kind: "person", role: "ceo", id: row.i } } });
      list.push({ group: "person", label: row.executive_name, sub: t("search.person.executive", { company: row.short }), icon: "career", go: { page: { kind: "person", role: "executive", id: row.i } } });
    }
    for (const seat of PARTNER_SEATS) {
      list.push({ group: "person", label: t(`partner.${seat}.name`), sub: t(`partner.${seat}.role`), icon: "gavel", go: { page: { kind: "person", role: "partner", id: seat } } });
    }
    view.rivals.forEach((name, house) => {
      list.push({ group: "house", label: name, sub: t("entity.house"), icon: "flag", go: { page: { kind: "house", id: house } } });
    });
    view.advisers.forEach((bank, adviser) => {
      list.push({ group: "adviser", label: bank.name, sub: t(`tier.${bank.tier}`), icon: "career", go: { page: { kind: "adviser", id: adviser } } });
      list.push({ group: "person", label: bank.banker.name, sub: t("cover.role", { bank: bank.name }), icon: "career", go: { page: { kind: "person", role: "banker", id: adviser } } });
    });
    for (const message of [...view.messages].reverse()) {
      const text = describeMessage(t, f, view, message);
      list.push({ group: "message", label: text.title, also: text.body, sub: f.date(message.date), icon: text.icon, go: { message: message.id } });
    }
    return list;
  }, [view, t, f]);

  const hits = useMemo(() => {
    const q = fold(query.trim());
    if (!q) {
      return [];
    }
    // Each group keeps its best few; the group whose best hit matches the name most closely comes first.
    const groups = GROUPS.map((group, order) => {
      const ranked = entries
        .filter((entry) => entry.group === group)
        .map((entry) => ({ entry, rank: score(entry, q) }))
        .filter((item): item is { entry: Entry; rank: number } => item.rank !== null)
        .sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label))
        .slice(0, PER_GROUP);
      return { order, best: ranked[0]?.rank ?? Infinity, hits: ranked.map((item) => item.entry) };
    });
    groups.sort((a, b) => a.best - b.best || a.order - b.order);
    return groups.flatMap((group) => group.hits).slice(0, TOTAL);
  }, [entries, query]);

  useEffect(() => setAt(0), [query]);

  const land = (entry: Entry) => {
    if ("screen" in entry.go) {
      game.go(entry.go.screen);
    } else if ("page" in entry.go) {
      game.open(entry.go.page);
    } else {
      game.openMessage(entry.go.message);
    }
    setOpen(false);
    setQuery("");
    input.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAt((value) => Math.min(value + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAt((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter" && hits[at]) {
      event.preventDefault();
      land(hits[at]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      input.current?.blur();
    }
  };

  const listId = "search-results";
  const showing = open && query.trim() !== "";
  return (
    <div className="search" ref={root}>
      <Icon name="search" size={15} />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing && hits[at] ? `search-hit-${at}` : undefined}
        aria-label={t("search.label")}
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd aria-hidden>{t("search.shortcut")}</kbd>
      {showing ? (
        <div className="search-results" id={listId} role="listbox" aria-label={t("search.label")}>
          {hits.length === 0 ? <p className="muted">{t("search.none")}</p> : null}
          {hits.map((entry, index) => (
            <div key={`${entry.group}-${index}`}>
              {index === 0 || hits[index - 1].group !== entry.group ? <div className="search-group">{t(`search.group.${entry.group}`)}</div> : null}
              <button
                type="button"
                id={`search-hit-${index}`}
                role="option"
                aria-selected={index === at}
                className="search-hit"
                onMouseEnter={() => setAt(index)}
                onClick={() => land(entry)}
              >
                <Icon name={entry.icon} size={15} />
                <span className="search-hit-label clip">{entry.label}</span>
                <span className="search-hit-sub clip">{entry.sub}</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
