import "./Boot.css";

/**
 * The wait while sim-core loads and the world opens: the folded map draws itself,
 * pins drop on it, and a bar runs underneath. Without motion it is the still map.
 */
export function Boot({ label }: { label: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <svg className="boot-map" viewBox="0 0 24 24" aria-hidden>
        <path className="boot-fold" pathLength={1} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
        <path className="boot-crease" pathLength={1} d="M9 4v14M15 6v14" />
        <circle className="boot-pin" cx="6" cy="11" r="1.2" />
        <circle className="boot-pin" cx="12" cy="9" r="1.2" />
        <circle className="boot-pin" cx="18" cy="12" r="1.2" />
      </svg>
      <div className="boot-bar" aria-hidden>
        <span />
      </div>
      <p>{label}</p>
    </div>
  );
}
