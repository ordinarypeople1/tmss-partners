/** Format an integer amount stored in million KRW. */

export function formatKrwMillion(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toFixed(2)}조 원`;
  }
  if (absolute >= 100) {
    return `${sign}${(absolute / 100).toFixed(1)}억 원`;
  }
  return `${sign}${absolute.toLocaleString("ko-KR")}백만 원`;
}
