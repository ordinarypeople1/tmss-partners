import { useEffect, useRef } from "react";
import { rasterBuilding, siteKind } from "./buildings";

export function BuildingMark({
  tier,
  kind = "factory",
  tone = "ink",
}: {
  tier: number;
  kind?: string;
  tone?: "ink" | "live";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        return;
      }
      const styles = getComputedStyle(document.documentElement);
      const ink = styles.getPropertyValue("--ink").trim() || "#111111";
      const paper = styles.getPropertyValue("--page").trim() || "#f6f3ee";
      const accent = styles.getPropertyValue("--accent").trim() || "#9b1b30";
      ctx.putImageData(rasterBuilding(tier, siteKind(kind), tone === "live" ? accent : ink, paper), 0, 0);
    };
    draw();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", draw);
    window.addEventListener("deal-atlas-theme", draw);
    return () => {
      media.removeEventListener("change", draw);
      window.removeEventListener("deal-atlas-theme", draw);
    };
  }, [tier, kind, tone]);
  return <canvas ref={ref} width={64} height={64} className="legend-mark" aria-hidden="true" />;
}
