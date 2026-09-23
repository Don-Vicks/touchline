"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Kit } from "@/components/kit";
import { Scorebug } from "@/components/scorebug";
import { Empty, ErrorState, ProviderNote, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatCents, formatXp, greeting } from "@/lib/format";
import type { HomePayload } from "@/lib/types";

export default function HomePage() {
  const home = useQuery({ queryKey: ["home"], queryFn: () => api<HomePayload>("/home"), refetchInterval: 20_000 });
  if (home.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (home.isError) return <ErrorState message={home.error.message} onRetry={() => home.refetch()} />;
  const data = home.data!;
  const feature = data.live[0] ?? data.soon[0];
  const rest = [...data.live.slice(feature && data.live[0] ? 1 : 0), ...data.soon.filter((match) => match.id !== feature?.id)].slice(0, 5);

  return (
    <div>
      <p className="kicker">{greeting(data.user?.displayName)} · Matchday</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight md:text-6xl">{data.live.length ? "On the pitch" : "Next kickoff"}</h1>
      <div className="mt-6">
        <ProviderNote football={data.provider.football} panta={data.provider.panta} />
      </div>
      <div className="mt-8 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          {feature ? (
            <Scorebug match={feature} href={feature.matchroomId ? `/match/${feature.id}` : undefined} variant="hero" />
          ) : (
            <Empty
              title="The grounds are quiet"
              body="The next kickoff from any tracked league worldwide shows up here."
              action={
                <Link href="/matches" className="focus-ring inline-flex min-h-11 items-center text-sm underline">
                  Browse the list
                </Link>
              }
            />
          )}
          {rest.length ? (
            <div className="mt-8">
              <h2 className="font-serif text-2xl">Also this week</h2>
              <p className="kicker mt-1">Fixtures</p>
              <div className="mt-2">
                {rest.map((match) => (
                  <Scorebug key={match.id} match={match} href={`/match/${match.id}`} variant="row" />
                ))}
              </div>
            </div>
          ) : null}
          {data.recent?.length ? (
            <div className="mt-10">
              <h2 className="font-serif text-2xl">Last weekend</h2>
              <div className="mt-2">
                {data.recent.map((match) => (
                  <Scorebug key={match.id} match={match} href={`/match/${match.id}`} variant="row" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <aside className="space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Your squad</h2>
            <p className="kicker mt-1">Dressing room</p>
            {data.squad ? (
              <Link href={`/squads/${data.squad.id}`} className="focus-ring mt-3 block">
                <p className="text-xl">{data.squad.name}</p>
                <p className="mt-1 text-sm text-muted">
                  #{data.squad.rank} · <span className="font-display text-2xl tabular-nums text-foreground">{formatXp(data.squad.xp)}</span> XP
                </p>
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No squad yet.{" "}
                <Link href="/squads" className="focus-ring text-foreground underline">
                  Start one
                </Link>
              </p>
            )}
          </section>
          <section>
            <h2 className="font-serif text-2xl">Calls</h2>
            {data.trending.length ? (
              <ul className="mt-3 space-y-4">
                {data.trending.map((market) => {
                  const yes = formatCents(market.yesPrice);
                  const no = formatCents(market.noPrice);
                  return (
                    <li key={market.id}>
                      <Link href={`/match/${market.matchId}`} className="focus-ring block">
                        <p className="leading-snug">{market.question}</p>
                        <p className="mt-1 font-display text-2xl tabular-nums">
                          {market.xpOnly ? (
                            <span>
                              {market.yesCalls ?? 0} yes / {market.noCalls ?? 0} no
                            </span>
                          ) : (
                            <>
                              <span aria-label={`Yes ${yes.label}`}>{yes.text}</span>
                              <span className="px-2 text-muted">/</span>
                              <span aria-label={`No ${no.label}`}>{no.text}</span>
                            </>
                          )}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Markets open when a match gives us something to ask.</p>
            )}
          </section>
          <section>
            <h2 className="font-serif text-2xl">Ranks</h2>
            {data.leaders.length ? (
              <ol className="mt-3">
                {data.leaders.slice(0, 5).map((fan) => (
                  <li key={fan.id} className="flex items-center justify-between gap-3 border-b border-line/70 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-6 font-display text-lg tabular-nums text-lime">{fan.rank}</span>
                      <Kit name={fan.displayName} imageUrl={fan.avatarUrl} seed={fan.username} size="sm" />
                      <span className="truncate">{fan.displayName}</span>
                    </span>
                    <span className="font-display tabular-nums">{formatXp(fan.xp)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">Ranks start after the first settled call.</p>
            )}
            <Link href="/rankings" className="focus-ring mt-3 inline-flex min-h-11 items-center text-sm underline">
              Full table
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
