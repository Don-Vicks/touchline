import Link from "next/link";
import { formatCount } from "@/lib/format";
import type { MatchCard } from "@/lib/types";

function Crest({ name, imageUrl, large = false }: { name: string; imageUrl: string | null; large?: boolean }) {
  const size = large ? "h-16 w-16 md:h-20 md:w-20" : "h-10 w-10";
  if (!imageUrl) {
    return (
      <span className={`grid place-items-center bg-white/10 font-serif text-xl ${size}`} aria-hidden>
        {name.slice(0, 1)}
      </span>
    );
  }
  return <img src={imageUrl} alt="" className={`${size} object-contain`} />;
}

function kickoffLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Soon";
  return new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
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
      <article className="flex min-h-16 items-center gap-4 border-b border-line py-3">
        <div className="w-16 shrink-0 text-sm text-muted">{live ? match.clock : kickoffLabel(match.kickoffAt)}</div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Crest name={match.home.name} imageUrl={match.home.imageUrl} />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted">{match.competition.name}</p>
            <p className="truncate">{match.home.name}</p>
            <p className="truncate text-muted">{match.away.name}</p>
          </div>
        </div>
        <p className="font-display text-3xl tabular-nums leading-none">
          {match.homeScore}
          <span className="px-1 text-muted">–</span>
          {match.awayScore}
        </p>
      </article>
    );
    if (!href) return row;
    return (
      <Link href={href} className="focus-ring block hover:bg-card">
        {row}
      </Link>
    );
  }

  const board = (
    <article className="relative overflow-hidden bg-pitch text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_120%,rgba(34,92,58,0.55),transparent_60%)]" />
      <div className="relative px-5 pb-6 pt-5 md:px-8 md:pt-7">
        <div className="flex items-center justify-between gap-3 text-sm text-foreground/80">
          <span className="truncate">{match.competition.name}</span>
          {live ? (
            <span className="inline-flex items-center gap-2 text-live">
              <span className="h-2 w-2 rounded-full bg-live motion-safe:animate-pulse" aria-hidden />
              Live
            </span>
          ) : (
            <span>{match.status === "SCHEDULED" ? kickoffLabel(match.kickoffAt) : match.status.toLowerCase()}</span>
          )}
        </div>
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:mt-10">
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <Crest name={match.home.name} imageUrl={match.home.imageUrl} large={variant === "hero"} />
            <p className="max-w-[9rem] text-lg leading-tight md:max-w-none md:text-2xl">{match.home.name}</p>
          </div>
          <p className="font-display text-6xl tabular-nums leading-none md:text-8xl" aria-label={`${match.homeScore} to ${match.awayScore}`}>
            {match.homeScore}
            <span className="px-1 text-foreground/40 md:px-2">–</span>
            {match.awayScore}
          </p>
          <div className="flex flex-col items-end gap-3 text-right md:flex-row-reverse md:items-center">
            <Crest name={match.away.name} imageUrl={match.away.imageUrl} large={variant === "hero"} />
            <p className="max-w-[9rem] text-lg leading-tight md:max-w-none md:text-2xl">{match.away.name}</p>
          </div>
        </div>
        <div className="mt-8 flex items-end justify-between">
          {match.status === "SCHEDULED" ? (
            <p className="font-serif text-3xl leading-none">{kickoffLabel(match.kickoffAt)}</p>
          ) : (
            <p className="font-display text-5xl tabular-nums leading-none">{match.clock}</p>
          )}
          <p className="text-sm text-foreground/75">
            <span className="font-display text-3xl tabular-nums text-foreground">{formatCount(match.watching)}</span> in the room
          </p>
        </div>
      </div>
      {variant === "hero" && href ? (
        <div className="relative flex min-h-14 items-center justify-between bg-foreground px-5 text-ink md:px-8">
          <span className="text-sm">The room is open</span>
          <span className="text-sm">Join</span>
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
