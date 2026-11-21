import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Draws a dialog at the top of the document. A fixed layer inside a card or a
 * scrolling panel can be trapped by an ancestor (iOS WebKit clips fixed
 * elements inside some scroll and filter containers); at the body it never is.
 */
export function Overlay({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return <>{children}</>;
  }
  return createPortal(children, document.body);
}
