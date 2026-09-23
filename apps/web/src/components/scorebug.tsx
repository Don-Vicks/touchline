"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCount } from "@/lib/format";
import type { MatchCard } from "@/lib/types";

function Crest({ name, imageUrl, large = false }: { name: string; imageUrl: string | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = large ? "h-16 w-16 md:h-20 md:w-20" : "h-10 w-10";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (!imageUrl || failed) {
    return (
      <span className={`grid place-items-center bg-white/10 font-display text-sm uppercase tracking-wide ${size}`} aria-hidden>
        {initials}
      </span>
    );
  }
  return <img src={imageUrl} alt="" className={`${size} object-contain drop-shadow`} onError={() => setFailed(true)} />;
}

function kickoffLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Soon";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

export function Scorebug({
  match,
  href,
  variant = "board",
}: {
  match: MatchCard;
  href?: string;
  variant?: "hero" | "row" | "board";
}) {
  const live = match.status === "LIVE" || match.status === "HALFTIME";
  if (variant === "row") {
    const row = (
      <article className="grid min-h-16 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 md:grid-cols-[7rem_minmax(0,1fr)_auto]">
        <div>
          {live ? (
            <span className="inline-flex items-center gap-1.5 font-display text-sm uppercase tracking-widest text-live">
              <span className="h-2 w-2 rounded-full bg-live motion-safe:animate-pulse" aria-hidden />
              {match.clock}
            </span>
          ) : (
            <span className="font-display text-xs uppercase tracking-wide text-muted md:text-sm">{kickoffLabel(match.kickoffAt)}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1">
            <Crest name={match.home.name} imageUrl={match.home.imageUrl} />
            <Crest name={match.away.name} imageUrl={match.away.imageUrl} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{match.home.name}</p>
            <p className="truncate text-muted">{match.away.name}</p>
          </div>
        </div>
        <p className="font-display text-3xl tabular-nums leading-none md:text-4xl">
          {match.homeScore}
          <span className="px-1 text-line">–</span>
          {match.awayScore}
        </p>
      </article>
    );
    if (!href) return row;
    return (
      <Link href={href} className="focus-ring block hover:bg-card/80">
        {row}
      </Link>
    );
  }

  const board = (
    <article className="relative overflow-hidden bg-pitch text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
      <div className="pitch-mark pointer-events-none absolute inset-0 opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_120%,rgba(200,232,122,0.18),transparent_55%)]" />
      <div className="relative px-5 pb-6 pt-5 md:px-8 md:pt-7">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {match.competition.imageUrl ? <img src={match.competition.imageUrl} alt="" className="h-6 w-6 object-contain" /> : null}
            <span className="kicker truncate text-flood">{match.competition.name}</span>
          </span>
          {live ? (
            <span className="inline-flex items-center gap-2 bg-live px-2 py-1 font-display text-xs uppercase tracking-[0.18em] text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
              Live {match.clock}
            </span>
          ) : (
            <span className="font-display text-sm uppercase tracking-widest text-flood/90">
              {match.status === "SCHEDULED" ? kickoffLabel(match.kickoffAt) : match.status.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:mt-10">
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <Crest name={match.home.name} imageUrl={match.home.imageUrl} large={variant === "hero"} />
            <p className="max-w-[9rem] text-lg leading-tight md:max-w-none md:font-display md:text-2xl md:uppercase md:tracking-wide">{match.home.name}</p>
          </div>
          <p className="font-display text-7xl tabular-nums leading-none md:text-8xl" aria-label={`${match.homeScore} to ${match.awayScore}`}>
            {match.homeScore}
            <span className="px-1 text-flood/50 md:px-2">–</span>
            {match.awayScore}
          </p>
          <div className="flex flex-col items-end gap-3 text-right md:flex-row-reverse md:items-center">
            <Crest name={match.away.name} imageUrl={match.away.imageUrl} large={variant === "hero"} />
            <p className="max-w-[9rem] text-lg leading-tight md:max-w-none md:font-display md:text-2xl md:uppercase md:tracking-wide">{match.away.name}</p>
          </div>
        </div>
        <div className="mt-8 flex items-end justify-between">
          {match.status === "SCHEDULED" ? (
            <p className="font-serif text-3xl leading-none">{kickoffLabel(match.kickoffAt)}</p>
          ) : (
            <p className="font-display text-5xl tabular-nums leading-none">{match.clock}</p>
          )}
          <p className="text-sm text-flood/90">
            <span className="font-display text-3xl tabular-nums text-foreground">{formatCount(match.watching)}</span> in the room
          </p>
        </div>
      </div>
      {variant === "hero" && href ? (
        <div className="relative flex min-h-14 items-center justify-between bg-lime px-5 text-ink md:px-8">
          <span className="font-display text-sm uppercase tracking-[0.16em]">The room is open</span>
          <span className="font-display text-sm uppercase tracking-[0.16em]">Join</span>
        </div>
      ) : null}
    </article>
  );

  if (!href || variant === "hero") {
    if (href && variant === "hero") {
      return (
        <Link href={href} className="focus-ring block">
          {board}
        </Link>
      );
    }
    return board;
  }
  return (
    <Link href={href} className="focus-ring block">
      {board}
    </Link>
  );
}
