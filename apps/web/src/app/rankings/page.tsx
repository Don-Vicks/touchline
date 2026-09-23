"use client";

import { LeagueTable } from "@/components/league-table";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { Fan } from "@/lib/types";

export default function RankingsPage() {
  const rankings = useQuery({
    queryKey: ["rankings"],
    queryFn: () => api<{ users: (Fan & { bestStreak?: number; rank: number; form?: string[] })[]; squads: { id: string; name: string; xp: number; rank: number }[] }>("/rankings"),
  });
  if (rankings.isLoading) return <Skeleton className="h-48 w-full" />;
  if (rankings.isError) return <ErrorState message={rankings.error.message} onRetry={() => rankings.refetch()} />;
  const data = rankings.data!;
  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">Season standings</p>
        <h1 className="font-serif text-5xl tracking-tight">Table</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">XP from settled calls. A $5 call and a $500 call sit on the same row.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <LeagueTable
          title="Fans"
          kicker="Individuals"
          rows={data.users.map((user) => ({
            id: user.id,
            name: user.displayName,
            rank: user.rank ?? 0,
            xp: user.xp,
            extra: user.bestStreak ? `streak ${user.bestStreak}` : undefined,
            avatarUrl: user.avatarUrl,
            seed: user.username,
            form: user.form,
          }))}
        />
        <LeagueTable
          title="Squads"
          kicker="Clubs"
          rows={data.squads.map((squad) => ({ id: squad.id, name: squad.name, rank: squad.rank, xp: squad.xp }))}
        />
      </div>
    </div>
  );
}
