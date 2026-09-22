function asNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Object.is(n, -0) ? 0 : n;
}

export function formatCents(price: string | number | null | undefined) {
  const n = asNumber(price);
  if (n == null) return { text: "—", label: "Price unavailable" };
  if (n === 0) return { text: "0¢", label: "0 USDC" };
  if (n > 0 && n < 0.005) return { text: "<1¢", label: `${n} USDC` };
  const cents = Math.round(n * 100);
  return { text: `${cents}¢`, label: `${n.toFixed(4)} USDC per share` };
}

export function formatXp(value: number | null | undefined) {
  const n = asNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.trunc(n));
}

export function formatUsdc(value: string | number | null | undefined) {
  const n = asNumber(value);
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) return n < 0 ? "-<$0.01" : "<$0.01";
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function formatCount(value: number | null | undefined) {
  const n = asNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(n) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(value: number | null | undefined) {
  const n = asNumber(value);
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function greeting(name?: string | null) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}
