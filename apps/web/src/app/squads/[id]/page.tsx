"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatPercent, formatXp } from "@/lib/format";
import type { ChatLine, Fan } from "@/lib/types";

interface SquadDetail {
  squad: {
    id: string;
    name: string;
    description: string | null;
    inviteCode: string;
    xp: number;
    members: number;
    rank: number;
    predictions: number;
    correct: number;
    accuracy: number | null;
    topPredictor: { displayName: string; xp: number } | null;
    roster: (Fan & { role: string })[];
  };
  joined: boolean;
  messages: ChatLine[];
}

export default function SquadPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);
  if (!id) return <Skeleton className="h-40 w-full" />;
  return <Squad id={id} />;
}

function Squad({ id }: { id: string }) {
  const client = useQueryClient();
  const squad = useQuery({ queryKey: ["squad", id], queryFn: () => api<SquadDetail>(`/squads/${id}`) });
  const [username, setUsername] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (squad.isLoading) return <Skeleton className="h-48 w-full" />;
  if (squad.isError || !squad.data) return <ErrorState message={squad.error?.message ?? "Squad missing."} onRetry={() => squad.refetch()} />;
  const data = squad.data.squad;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/squads/${id}/invites`, { method: "POST", body: JSON.stringify({ username }) });
      setUsername("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invite failed.");
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api(`/squads/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await client.invalidateQueries({ queryKey: ["squad", id] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send.");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Squad rank #{data.rank}</p>
        <h1 className="font-serif text-5xl tracking-tight">{data.name}</h1>
        <p className="mt-2 text-sm text-muted">{data.members} members · code {data.inviteCode}</p>
      </header>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Predictions", String(data.predictions)],
          ["Correct", String(data.correct)],
          ["Accuracy", formatPercent(data.accuracy)],
          ["XP", formatXp(data.xp)],
        ].map(([label, value]) => (
          <div key={label} className="border border-line bg-card p-3">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</dt>
            <dd className="font-display text-3xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {data.topPredictor ? (
        <p className="text-sm">
          Top predictor <span className="text-foreground">{data.topPredictor.displayName}</span> · {formatXp(data.topPredictor.xp)} XP
        </p>
      ) : null}
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Roster</h2>
        <ol className="mt-3 border border-line bg-card">
          {data.roster.map((member, index) => (
            <li key={member.id} className="flex justify-between px-3 py-2">
              <span>
                <span className="font-display tabular-nums text-muted">#{index + 1}</span> {member.displayName}
              </span>
              <span className="font-display tabular-nums">{formatXp(member.xp)}</span>
            </li>
          ))}
        </ol>
      </section>
      {squad.data.joined ? (
        <form onSubmit={(event) => void invite(event)} className="flex flex-wrap items-end gap-3">
          <label className="text-sm" htmlFor="invite-user">
            Invite by username
            <input id="invite-user" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="focus-ring mt-1 min-h-11 bg-panel px-3" />
          </label>
          <button type="submit" className="focus-ring min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
            Invite
          </button>
        </form>
      ) : null}
      <section className="border border-line bg-card">
        <div className="space-y-2 px-3 py-3">
          {squad.data.messages.length ? (
            squad.data.messages.map((message) => (
              <p key={message.id} className="text-sm">
                <span className="text-muted">{message.user.displayName}</span> {message.body}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted">Squad chat is empty.</p>
          )}
        </div>
        {squad.data.joined ? (
          <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t border-line p-2">
            <label className="sr-only" htmlFor="squad-chat">
              Squad message
            </label>
            <input id="squad-chat" value={body} onChange={(event) => setBody(event.target.value)} className="focus-ring min-h-11 flex-1 bg-panel px-3 text-sm" />
            <button type="submit" className="focus-ring min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
              Send
            </button>
          </form>
        ) : null}
      </section>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
