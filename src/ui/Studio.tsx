import { useEffect, useState } from "react";
import { joinBase } from "./publicPath";
import "./Studio.css";

/** The studio mark stays at least this long, unless the player skips it. */
const MIN_MS = 1_500;
/** The fade out. */
const OUT_MS = 550;
const SEEN_KEY = "deal-atlas.studio";

/** Once per launch: a session of the app (a desktop window, a browser tab). */
function seen(): boolean {
  try {
    const was = window.sessionStorage.getItem(SEEN_KEY) === "1";
    window.sessionStorage.setItem(SEEN_KEY, "1");
    return was;
  } catch {
    return false;
  }
}

/**
 * The studio's mark on a dark ground as the game opens: Poiesis fades and rises in, holds,
 * and fades out over whatever is ready underneath. A click or a key skips it.
 * The same mark as the studio's other game (onsen-tycoon, assets/poiesis.svg).
 */
export function Studio() {
  const [phase, setPhase] = useState<"off" | "start" | "in" | "out">(() =>
    seen() || /[?&]nostudio/.test(window.location.search) ? "off" : "start",
  );

  useEffect(() => {
    if (phase !== "start") {
      return;
    }
    // Two frames so the first paint has the mark hidden and the fade has somewhere to start.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("in"));
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase === "in") {
      const timer = window.setTimeout(() => setPhase("out"), MIN_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "out") {
      const timer = window.setTimeout(() => setPhase("off"), OUT_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "off" || phase === "out") {
      return;
    }
    const skip = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      setPhase("out");
    };
    window.addEventListener("keydown", skip, true);
    return () => window.removeEventListener("keydown", skip, true);
  }, [phase]);

  if (phase === "off") {
    return null;
  }
  return (
    <div className="studio" data-phase={phase} aria-hidden onPointerDown={() => setPhase("out")}>
      <img src={joinBase(import.meta.env.BASE_URL, "brand/poiesis.svg")} alt="" width={240} />
    </div>
  );
}
