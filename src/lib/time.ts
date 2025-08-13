export const fmtUTC = (ts: bigint) =>
  ts === 0n ? "—" : new Date(Number(ts) * 1000).toISOString();

export const fmtLocal = (ts: bigint) => {
  if (ts === 0n) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(Number(ts) * 1000));
  } catch {
    return new Date(Number(ts) * 1000).toLocaleString();
  }
};

export const toLocalInputValue = (ts: bigint) => {
  if (ts === 0n) return "";
  const d = new Date(Number(ts) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

export const localInputToUtcSeconds = (v: string) => {
  const ms = Date.parse(v); // local time parsed as local
  if (!Number.isFinite(ms)) throw new Error("Enter a valid date & time.");
  return Math.floor(ms / 1000);
};
