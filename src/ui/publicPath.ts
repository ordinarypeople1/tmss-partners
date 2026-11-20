export function joinBase(base: string, file: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${file.replace(/^\//, "")}`;
}

/**
 * The same, as an absolute URL. MapLibre fetches GeoJSON from a worker, where a
 * relative path would resolve against the worker, not the page. A build with
 * a relative base (VITE_BASE=./) needs this.
 */
export function publicUrl(base: string, file: string, page: string = document.baseURI): string {
  return new URL(joinBase(base, file), page).href;
}
