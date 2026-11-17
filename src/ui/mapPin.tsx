import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

export function MapPin({
  selected,
  glyph,
  ariaLabel,
  onSelect,
}: {
  selected: boolean;
  glyph: string;
  ariaLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="pin"
      data-selected={selected ? "true" : "false"}
      aria-label={ariaLabel}
      onClick={onSelect}
    >
      <span className="pin-label">{glyph}</span>
    </button>
  );
}

export function mountMapPin(options: {
  selected: boolean;
  glyph: string;
  ariaLabel: string;
  onSelect: () => void;
}): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  host.className = "pin-host";
  const root = createRoot(host);
  flushSync(() => {
    root.render(
      <MapPin
        selected={options.selected}
        glyph={options.glyph}
        ariaLabel={options.ariaLabel}
        onSelect={options.onSelect}
      />,
    );
  });
  return { host, root };
}
