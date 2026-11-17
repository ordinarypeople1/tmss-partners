export function joinBase(base: string, file: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${file.replace(/^\//, "")}`;
}
