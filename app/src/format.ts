export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function rate(n: number | null | undefined): string {
  return n == null ? '–' : `${bytes(n)}/s`;
}

export function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function hoursToAge(h: number | null | undefined): string {
  if (h == null) return '–';
  const years = h / 8766;
  return years >= 1 ? `${years.toFixed(1)} y (${h.toLocaleString()} h)` : `${h.toLocaleString()} h`;
}

export function ago(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(now - unix));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
