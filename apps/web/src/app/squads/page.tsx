"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
      <h1 className="font-serif text-5xl tracking-tight">Squads</h1>
      <form onSubmit={(event) => void create(event)} className="mt-8 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm" htmlFor="squad-name">
          Squad name
          <input id="squad-name" name="name" required minLength={2} maxLength={32} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
        </label>
        <label className="text-sm" htmlFor="squad-about">
          About
          <input id="squad-about" name="description" maxLength={180} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
        </label>
        <button type="submit" className="focus-ring min-h-11 self-end bg-foreground px-4 text-sm font-medium text-ink">
          Create squad
        </button>
      </form>
      <form onSubmit={(event) => void join(event)} className="flex flex-wrap items-end gap-3">
        <label className="text-sm" htmlFor="invite">
          Invite code
          <input id="invite" value={code} onChange={(event) => setCode(event.target.value)} className="focus-ring mt-1 min-h-11 bg-panel px-3" />
        </label>
        <button type="submit" className="focus-ring min-h-11 bg-panel px-4 text-sm">
          Join with code
        </button>
      </form>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      {squads.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {squads.isError ? <ErrorState message={squads.error.message} onRetry={() => squads.refetch()} /> : null}
      {squads.data && squads.data.squads.length === 0 ? <Empty title="No squads yet" body="Create the first one and send the code to the group chat." /> : null}
      <ul className="mt-8">
        {squads.data?.squads.map((squad) => (
          <li key={squad.id}>
            <Link href={`/squads/${squad.id}`} className="focus-ring flex items-baseline justify-between gap-3 border-b border-line py-4">
              <span>
                <span className="font-serif text-2xl">{squad.name}</span>
                <span className="ml-3 text-sm text-muted">{squad.members} fans</span>
              </span>
              <span className="text-sm text-muted">
                #{squad.rank} · <span className="font-display text-xl tabular-nums text-foreground">{formatXp(squad.xp)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
