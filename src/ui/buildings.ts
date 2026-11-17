const SIZE = 32;
const CUTS = [12000, 18000, 24000, 36000] as const;
const SCALES = [0.74, 0.88, 1, 1.16, 1.34] as const;

export interface MapSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  live?: boolean;
  held?: boolean;
  revenue?: number | null;
  assets?: number | null;
}

export interface SiteCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: string;
      name: string;
      tier: number;
      kind: string;
      tone: string;
      scale: number;
    };
  }>;
}

export interface SpriteHost {
  isStyleLoaded(): boolean | void;
  hasImage(id: string): boolean;
  addImage(id: string, image: ImageData, options?: { pixelRatio?: number }): unknown;
  updateImage(id: string, image: ImageData): unknown;
}

export function sizeTier(amount: number): 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(amount) || amount < CUTS[0]) {
    return 1;
  }
  if (amount < CUTS[1]) {
    return 2;
  }
  if (amount < CUTS[2]) {
    return 3;
  }
  if (amount < CUTS[3]) {
    return 4;
  }
  return 5;
}

export function tierScale(tier: number): number {
  return SCALES[tier - 1] ?? 1;
}

export function markerAmount(revenue?: number | null, assets?: number | null): number {
  if (typeof revenue === "number" && revenue > 0) {
    return revenue;
  }
  if (typeof assets === "number" && assets > 0) {
    return assets;
  }
  return 0;
}

export function siteKind(kind: string): "factory" | "warehouse" | "store" {
  if (kind === "warehouse" || kind === "store") {
    return kind;
  }
  return "factory";
}

export function siteFeatures(pins: MapSite[], selectedId: string): SiteCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((pin) => {
      const tier = sizeTier(markerAmount(pin.revenue, pin.assets));
      const selected = pin.id === selectedId;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [pin.lon, pin.lat] },
        properties: {
          id: pin.id,
          name: pin.name,
          tier,
          kind: siteKind(pin.kind),
          tone: pin.live || pin.held ? "live" : "ink",
          scale: tierScale(tier) * (selected ? 1.14 : 1),
        },
      };
    }),
  };
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
}

function windows(ctx: CanvasRenderingContext2D, x: number, y: number, count: number, gap: number) {
  for (let index = 0; index < count; index += 1) {
    ctx.strokeRect(x + index * gap, y, 2.2, 2.2);
  }
}

function drawMass(ctx: CanvasRenderingContext2D, tier: number) {
  if (tier <= 1) {
    block(ctx, 8, 16, 16, 12);
    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.lineTo(16, 11);
    ctx.lineTo(24, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(14, 22, 4, 6);
    return;
  }
  if (tier === 2) {
    block(ctx, 8, 9, 16, 19);
    windows(ctx, 11, 12, 2, 6);
    windows(ctx, 11, 17, 2, 6);
    ctx.strokeRect(14, 22, 4, 6);
    return;
  }
  if (tier === 3) {
    block(ctx, 3, 16, 10, 12);
    block(ctx, 12, 10, 14, 18);
    windows(ctx, 15, 13, 2, 5);
    windows(ctx, 15, 18, 2, 5);
    return;
  }
  if (tier === 4) {
    block(ctx, 11, 5, 10, 23);
    ctx.beginPath();
    ctx.moveTo(16, 5);
    ctx.lineTo(16, 1.5);
    ctx.stroke();
    for (let y = 8; y <= 22; y += 4) {
      windows(ctx, 13, y, 2, 5);
    }
    return;
  }
  block(ctx, 2, 17, 8, 11);
  block(ctx, 11, 6, 9, 22);
  block(ctx, 21, 13, 9, 15);
  windows(ctx, 13, 10, 2, 4);
  windows(ctx, 13, 15, 2, 4);
  windows(ctx, 13, 20, 2, 4);
}

function drawBadge(ctx: CanvasRenderingContext2D, kind: string) {
  ctx.beginPath();
  if (kind === "warehouse") {
    ctx.rect(1.4, 1.6, 7, 5);
    ctx.moveTo(1.4, 4.1);
    ctx.lineTo(8.4, 4.1);
  } else if (kind === "store") {
    ctx.moveTo(1.4, 3.2);
    ctx.lineTo(8.6, 3.2);
    ctx.lineTo(5, 7);
    ctx.closePath();
  } else {
    ctx.rect(3, 2.4, 3, 5);
    ctx.moveTo(2.2, 2.4);
    ctx.lineTo(6.8, 2.4);
  }
  ctx.fill();
  ctx.stroke();
}

export function rasterBuilding(tier: number, kind: string, ink: string, paper: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * 2;
  canvas.height = SIZE * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(SIZE * 2, SIZE * 2);
  }
  ctx.scale(2, 2);
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = paper;
  drawMass(ctx, tier);
  drawBadge(ctx, siteKind(kind));
  return ctx.getImageData(0, 0, SIZE * 2, SIZE * 2);
}

export function rasterCluster(count: number, ink: string, paper: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * 2;
  canvas.height = SIZE * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(SIZE * 2, SIZE * 2);
  }
  ctx.scale(2, 2);
  ctx.beginPath();
  ctx.arc(16, 16, 11, 0, Math.PI * 2);
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = "600 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), 16, 16.5);
  return ctx.getImageData(0, 0, SIZE * 2, SIZE * 2);
}

export function clusterIconExpression(): unknown[] {
  const expression: unknown[] = ["step", ["get", "point_count"], "c-2"];
  for (let count = 3; count <= 30; count += 1) {
    expression.push(count, `c-${count}`);
  }
  return expression;
}

export function paintClusters(host: SpriteHost, ink: string, paper: string) {
  if (!host.isStyleLoaded()) {
    return;
  }
  for (let count = 2; count <= 30; count += 1) {
    const id = `c-${count}`;
    const image = rasterCluster(count, ink, paper);
    if (host.hasImage(id)) {
      host.updateImage(id, image);
    } else {
      host.addImage(id, image, { pixelRatio: 2 });
    }
  }
}

export function paintBuildings(host: SpriteHost, ink: string, paper: string, accent: string) {
  if (!host.isStyleLoaded()) {
    return;
  }
  for (const tier of [1, 2, 3, 4, 5]) {
    for (const kind of ["factory", "warehouse", "store"]) {
      for (const tone of ["ink", "live"]) {
        const id = `b-${tier}-${kind}-${tone}`;
        const image = rasterBuilding(tier, kind, tone === "live" ? accent : ink, paper);
        if (host.hasImage(id)) {
          host.updateImage(id, image);
        } else {
          host.addImage(id, image, { pixelRatio: 2 });
        }
      }
    }
  }
}
