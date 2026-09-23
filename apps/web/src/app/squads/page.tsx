"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Kit, posTone } from "@/components/kit";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatXp } from "@/lib/format";

interface SquadRow {
  id: string;
  name: string;
  xp: number;
  members: number;
  rank: number;
}

export default function SquadsPage() {
  const client = useQueryClient();
  const squads = useQuery({ queryKey: ["squads"], queryFn: () => api<{ squads: SquadRow[] }>("/squads") });
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      const created = await api<{ squad: { id: string } }>("/squads", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), description: form.get("description") || undefined }),
      });
      window.location.href = `/squads/${created.squad.id}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the squad.");
    }
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ squadId: string }>("/squads/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: code }),
      });
      await client.invalidateQueries({ queryKey: ["squads"] });
      window.location.href = `/squads/${result.squadId}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">Dressing room</p>
        <h1 className="font-serif text-5xl tracking-tight">Squads</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Form a club, send the code, take the same side of the terrace.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={(event) => void create(event)} className="space-y-3 bg-card/80 p-4 ring-1 ring-line">
          <p className="kicker">Found a club</p>
          <label className="block text-sm" htmlFor="squad-name">
            Squad name
            <input id="squad-name" name="name" required minLength={2} maxLength={32} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
          </label>
          <label className="block text-sm" htmlFor="squad-about">
            About
            <input id="squad-about" name="description" maxLength={180} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
          </label>
          <button type="submit" className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
            Create squad
          </button>
        </form>
        <form onSubmit={(event) => void join(event)} className="space-y-3 bg-card/80 p-4 ring-1 ring-line">
          <p className="kicker">Walk in</p>
          <label className="block text-sm" htmlFor="invite">
            Invite code
            <input id="invite" value={code} onChange={(event) => setCode(event.target.value)} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
          </label>
          <button type="submit" className="focus-ring min-h-11 bg-panel px-4 font-display text-sm uppercase tracking-[0.12em]">
            Join with code
          </button>
        </form>
      </div>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      {squads.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {squads.isError ? <ErrorState message={squads.error.message} onRetry={() => squads.refetch()} /> : null}
      {squads.data && squads.data.squads.length === 0 ? <Empty title="No squads yet" body="Create the first one and send the code to the group chat." /> : null}
      <ul className="divide-y divide-line bg-card/80 ring-1 ring-line">
        {squads.data?.squads.map((squad) => (
          <li key={squad.id}>
            <Link href={`/squads/${squad.id}`} className="focus-ring flex items-center gap-4 px-4 py-4 hover:bg-turf/30">
              <span className={`w-10 font-display text-2xl tabular-nums ${posTone(squad.rank)}`}>{squad.rank}</span>
              <Kit name={squad.name} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-2xl leading-tight">{squad.name}</span>
                <span className="text-sm text-muted">{squad.members} in the dressing room</span>
              </span>
              <span className="text-right">
                <span className="block font-display text-2xl tabular-nums">{formatXp(squad.xp)}</span>
                <span className="kicker">XP</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
