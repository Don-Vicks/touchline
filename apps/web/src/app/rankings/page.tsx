"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatXp } from "@/lib/format";
import type { Fan } from "@/lib/types";

export default function RankingsPage() {
  const rankings = useQuery({
    queryKey: ["rankings"],
    queryFn: () => api<{ users: (Fan & { bestStreak?: number })[]; squads: { id: string; name: string; xp: number; rank: number }[] }>("/rankings"),
  });
  if (rankings.isLoading) return <Skeleton className="h-48 w-full" />;
  if (rankings.isError) return <ErrorState message={rankings.error.message} onRetry={() => rankings.refetch()} />;
  const data = rankings.data!;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-5xl tracking-tight">Ranks</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Ordered by prediction XP. A correct call scores the same whether it was $5 or $500.</p>
      </div>
      <div className="grid gap-12 md:grid-cols-2">
        <section>
          <h2 className="font-serif text-2xl">Fans</h2>
          <ol className="mt-4">
            {data.users.map((user) => (
              <li key={user.id} className="flex items-baseline justify-between border-b border-line py-3">
                <span>
                  <span className="font-display text-xl tabular-nums text-muted">#{user.rank}</span> {user.displayName}
                </span>
                <span className="font-display tabular-nums">{formatXp(user.xp)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Squads</h2>
          <ol className="mt-4">
            {data.squads.map((squad) => (
              <li key={squad.id} className="flex items-baseline justify-between border-b border-line py-3">
                <span>
                  <span className="font-display text-xl tabular-nums text-muted">#{squad.rank}</span> {squad.name}
                </span>
                <span className="font-display tabular-nums">{formatXp(squad.xp)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
