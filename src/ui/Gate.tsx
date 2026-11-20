/**
 * Props for a control that may be disabled. While `why` is set, hovering the
 * control shows what it takes to turn it on, and assistive tech reads it as
 * the control's description. Disabled buttons still match `:hover`, so the
 * tip needs no wrapper and the layout does not change.
 */
export function gate(why: string | null | undefined | false): { "data-gate"?: string; "aria-description"?: string } {
  return why ? { "data-gate": why, "aria-description": why } : {};
}
