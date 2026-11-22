import { Children, createContext, useCallback, useContext, type ReactNode } from "react";
import { useIntl } from "react-intl";
import type { Bidder, View } from "../sim/types";
import { useGame, type Page } from "./game";
import { bidderName, bidderPage, type MessageText } from "./messages";
import "./Links.css";

/**
 * What a link does before it navigates: a dialog passes its own close here, so following a
 * name out of a meeting closes the meeting.
 */
export const FollowContext = createContext<(() => void) | null>(null);

/** A name that opens its page: a company, a rival house or a bank. */
export function EntityLink({ page, children }: { page: Page; children: ReactNode }) {
  const game = useGame();
  const follow = useContext(FollowContext);
  return (
    <button
      type="button"
      className="entity-link"
      data-kind={page.kind}
      onClick={(event) => {
        event.stopPropagation();
        follow?.();
        game.open(page);
      }}
    >
      {children}
    </button>
  );
}

export function HouseLink({ house }: { house: number }) {
  const { view } = useGame();
  return <EntityLink page={{ kind: "house", id: house }}>{view.rivals[house] ?? ""}</EntityLink>;
}

export function AdviserLink({ adviser }: { adviser: number }) {
  const { view } = useGame();
  return <EntityLink page={{ kind: "adviser", id: adviser }}>{view.advisers[adviser]?.name ?? ""}</EntityLink>;
}

/** A bidder's name, linked when it is a rival house. */
export function BidderName({ bidder, t, view }: { bidder: Bidder; t: (id: string) => string; view: View }) {
  const page = bidderPage(bidder);
  const name = bidderName(t, view, bidder);
  return page ? <EntityLink page={page}>{name}</EntityLink> : <>{name}</>;
}

/**
 * Formats a catalog message with some of its values drawn as links. `links` maps a value's
 * name to the page it opens; the text of the link is the value itself.
 */
export function useRich() {
  const intl = useIntl();
  return useCallback(
    (id: string, values: Record<string, string | number>, links: Record<string, Page>): ReactNode => {
      const rich: Record<string, ReactNode> = { ...values };
      for (const [key, page] of Object.entries(links)) {
        if (values[key] !== undefined && values[key] !== "") {
          rich[key] = <EntityLink page={page}>{values[key]}</EntityLink>;
        }
      }
      const out = intl.formatMessage({ id }, rich as never) as ReactNode;
      return Array.isArray(out) ? <>{Children.toArray(out)}</> : out;
    },
    [intl],
  );
}

/** A message's title or body with its names linked. */
export function RichMessage({ text, part }: { text: MessageText; part: "title" | "body" }) {
  const rich = useRich();
  return <>{rich(part === "title" ? text.titleId : text.bodyId, text.values, text.links)}</>;
}
