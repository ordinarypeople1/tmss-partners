import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

const STORE = "deal-atlas.layout";

function readStore(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeStore(key: string, value: number | null) {
  try {
    const all = readStore();
    if (value === null) {
      delete all[key];
    } else {
      all[key] = Math.round(value);
    }
    window.localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // A private window: the size lasts until reload.
  }
}

/**
 * A size in pixels the player can drag, remembered in this browser. Null
 * means the layout's own default. `clamp` keeps it in a sane range for the
 * window as it is now.
 */
export function useStoredSize(key: string, clamp: (value: number) => number): [number | null, (value: number | null) => void] {
  const [size, setSize] = useState<number | null>(() => {
    const stored = readStore()[key];
    return typeof stored === "number" ? clamp(stored) : null;
  });
  const set = useCallback(
    (value: number | null) => {
      const next = value === null ? null : clamp(value);
      setSize(next);
      writeStore(key, next);
    },
    [key, clamp],
  );
  // A smaller window may push a stored size out of range.
  useEffect(() => {
    const onResize = () => setSize((current) => (current === null ? null : clamp(current)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);
  return [size, set];
}

/**
 * A handle between two areas. Drag it, use the arrow keys, or double-click
 * to go back to the default. `measure` gives the current size when the drag
 * starts; `direction` says which way the size grows as the pointer moves.
 */
export function Splitter({
  axis,
  label,
  measure,
  onResize,
  onReset,
  direction = 1,
  className,
  style,
}: {
  axis: "x" | "y";
  label: string;
  measure: () => number;
  onResize: (value: number) => void;
  onReset: () => void;
  /** 1 if moving right or down grows the area, −1 if it shrinks it. */
  direction?: 1 | -1;
  className?: string;
  style?: CSSProperties;
}) {
  const start = useRef<{ at: number; size: number } | null>(null);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { at: axis === "x" ? event.clientX : event.clientY, size: measure() };
    document.body.dataset.resizing = axis;
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) {
      return;
    }
    const now = axis === "x" ? event.clientX : event.clientY;
    onResize(start.current.size + (now - start.current.at) * direction);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    start.current = null;
    delete document.body.dataset.resizing;
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const grow = axis === "x" ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
    const sign = grow[event.key as keyof typeof grow];
    if (sign) {
      event.preventDefault();
      onResize(measure() + sign * step * direction);
    } else if (event.key === "Home") {
      event.preventDefault();
      onReset();
    }
  };
  return (
    <div
      className={`splitter splitter-${axis}${className ? ` ${className}` : ""}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  );
}
