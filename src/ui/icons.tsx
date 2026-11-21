import type { ReactNode } from "react";

/** Line icons drawn for this game. 24 px grid, stroke follows text color. */
const PATHS: Record<string, ReactNode> = {
  map: <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />,
  inbox: <path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5" />,
  deals: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  portfolio: <path d="M3 8h18v11H3zM9 8V5h6v3M3 13h18" />,
  market: <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />,
  fund: <path d="M12 3a9 9 0 1 0 9 9h-9zM14 3v7h7a7 7 0 0 0-7-7z" />,
  career: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" />,
  play: <path d="M7 4l13 8-13 8z" />,
  pause: <path d="M7 4v16M17 4v16" />,
  skip: <path d="M5 4l10 8-10 8zM19 4v16" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  handshake: <path d="M2 9l5-3 5 3 5-3 5 3v6l-5 3-5-3-5 3-5-3zM12 9v6" />,
  /** Two speech bubbles: a meeting, a conversation. */
  meet: <path d="M3 4h12v9H8l-4 3v-3H3zM18 8h3v9h-1v3l-4-3h-5v-2" />,
  /** Three dots: more controls. */
  more: <path d="M4.5 12h1.5M11.25 12h1.5M18 12h1.5" strokeWidth={3} />,
  search: <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15 15l6 6" />,
  gavel: <path d="M13 4l7 7-3 3-7-7zM11 9l-8 8 2 2 8-8M14 20h8" />,
  flag: <path d="M5 21V4h12l-2 4 2 4H5" />,
  alert: <path d="M12 3l10 18H2zM12 10v5M12 18v.5" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  table: <path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  down: <path d="M12 5v14M5 12l7 7 7-7" />,
  check: <path d="M4 12l5 5L20 6" />,
  exit: <path d="M14 4h6v16h-6M3 12h12M11 8l4 4-4 4" />,
  sun: <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sound: <path d="M4 10v4h3l5 4V6L7 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />,
  mute: <path d="M4 10v4h3l5 4V6L7 10zM16 9.5l5 5M21 9.5l-5 5" />,
  restart: <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />,
  lock: <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  link: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
  food_manufacturing: <path d="M6 3v8a3 3 0 0 0 6 0V3M9 3v18M17 3c-2 2-2 6 0 9v9" />,
  industrial_components: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" />
  ),
  cold_chain_logistics: <path d="M12 2v20M3 7l18 10M21 7L3 17M9 4l3 3 3-3M9 20l3-3 3 3" />,
  business_services: <path d="M4 21V5l8-3v19M12 9l8 2v10M2 21h20M7 8v.5M7 12v.5M7 16v.5M16 14v.5M16 17v.5" />,
  healthcare_services: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  building_products: <path d="M3 21V11l9-8 9 8v10zM9 21v-7h6v7" />,
};

export function Icon({ name, size = 18, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {PATHS[name] ?? PATHS.flag}
    </svg>
  );
}
