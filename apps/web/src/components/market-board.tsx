"use client";

import { MarketPanel } from "@/components/market-card";
import type { MarketCard } from "@/lib/types";

function closesIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const min = Math.round(ms / 60_000);
  if (min < 90) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 36) return `${hours} hr`;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function MarketBoard({
  markets,
  featuredId,
  signedIn,
  onPick,
}: {
  markets: MarketCard[];
  featuredId: string | null;
  signedIn: boolean;
  onPick: (id: string) => void;
}) {
  if (!markets.length) {
    return (
      <section>
        <p className="kicker">The call</p>
        <h2 className="mt-2 font-serif text-4xl tracking-tight">Waiting on the next moment</h2>
        <p className="mt-2 max-w-md text-sm text-muted">A corner, a card, a goal. The room opens a question when the match gives it one.</p>
      </section>
    );
  }
  const featured = markets.find((row) => row.id === featuredId) ?? markets[0]!;
  const rest = markets.filter((row) => row.id !== featured.id);
  return (
    <div>
      <MarketPanel market={featured} signedIn={signedIn} />
      {featured.resolutionRule ? <p className="mt-4 max-w-xl text-sm text-muted">{featured.resolutionRule}</p> : null}
      <p className="mt-3 font-display text-sm uppercase tracking-[0.14em] text-muted">
        {closesIn(featured.closesAt)}
        {(featured.yesCalls || featured.noCalls) ? ` · ${featured.yesCalls ?? 0} yes · ${featured.noCalls ?? 0} no` : ""}
        {featured.mySide ? ` · your side ${featured.mySide}` : ""}
        {featured.squadYes || featured.squadNo
          ? featured.squadNo === 0 && (featured.squadYes ?? 0) >= 2
            ? " · your squad took YES"
            : featured.squadYes === 0 && (featured.squadNo ?? 0) >= 2
              ? " · your squad took NO"
              : ` · squad ${featured.squadYes ?? 0}–${featured.squadNo ?? 0}`
          : ""}
      </p>
      {rest.length ? (
        <div className="mt-10">
          <p className="kicker">Also open</p>
          <ul className="mt-2">
            {rest.map((row) => (
              <li key={row.id} className="border-b border-line">
                <button type="button" onClick={() => onPick(row.id)} className="focus-ring grid min-h-16 w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left">
                  <span className="font-display text-xs uppercase tracking-wide text-muted">{closesIn(row.closesAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.question}</span>
                    {row.mySide ? <span className="text-sm text-muted">Your side {row.mySide}</span> : null}
                  </span>
                  <span className="font-display text-2xl tabular-nums leading-none">
                    {row.yesCalls ?? 0}
                    <span className="px-1 text-line">–</span>
                    {row.noCalls ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
