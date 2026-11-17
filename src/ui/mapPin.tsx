export function MapPin({
  selected,
  glyph,
  ariaLabel,
  onSelect,
  kind = "factory",
  live = false,
}: {
  selected: boolean;
  glyph: string;
  ariaLabel: string;
  onSelect: () => void;
  kind?: string;
  live?: boolean;
}) {
  return (
    <button
      type="button"
      className="pin"
      data-kind={kind}
      data-selected={selected ? "true" : "false"}
      data-live={live ? "true" : "false"}
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
  kind?: string;
  live?: boolean;
}): { host: HTMLDivElement } {
  const host = document.createElement("div");
  host.className = "pin-host";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pin";
  button.dataset.kind = options.kind ?? "factory";
  button.dataset.selected = options.selected ? "true" : "false";
  button.dataset.live = options.live ? "true" : "false";
  button.setAttribute("aria-label", options.ariaLabel);
  button.addEventListener("click", options.onSelect);
  const label = document.createElement("span");
  label.className = "pin-label";
  label.textContent = options.glyph;
  button.append(label);
  host.append(button);
  return { host };
}
