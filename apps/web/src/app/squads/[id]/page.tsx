"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { Kit, posTone } from "@/components/kit";
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
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-5 bg-card/80 p-5 ring-1 ring-line">
        <Kit name={data.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="kicker">
            Club · <span className={posTone(data.rank)}>#{data.rank}</span>
          </p>
          <h1 className="font-serif text-5xl tracking-tight">{data.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {data.members} members · code <span className="font-display tracking-widest text-foreground">{data.inviteCode}</span>
          </p>
          {data.description ? <p className="mt-2 max-w-xl text-sm">{data.description}</p> : null}
        </div>
        <p className="font-display text-5xl tabular-nums leading-none">
          {formatXp(data.xp)}
          <span className="ml-2 font-sans text-sm tracking-normal text-muted">XP</span>
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Predictions", String(data.predictions)],
          ["Correct", String(data.correct)],
          ["Accuracy", formatPercent(data.accuracy)],
          ["XP", formatXp(data.xp)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4 ring-1 ring-line">
            <dt className="kicker">{label}</dt>
            <dd className="mt-1 font-display text-3xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {data.topPredictor ? (
        <p className="text-sm text-muted">
          Top predictor <span className="text-foreground">{data.topPredictor.displayName}</span> · {formatXp(data.topPredictor.xp)} XP
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="bg-card/80 ring-1 ring-line">
          <div className="border-b border-line px-4 py-3">
            <p className="kicker">Dressing room</p>
            <h2 className="font-serif text-2xl">Roster</h2>
          </div>
          <ol>
            {data.roster.map((member, index) => (
              <li key={member.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
                <span className={`w-8 font-display text-xl tabular-nums ${posTone(index + 1)}`}>{index + 1}</span>
                <Kit name={member.displayName} imageUrl={member.avatarUrl} seed={member.username} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {member.displayName}
                  <span className="ml-2 text-sm text-muted">{member.role}</span>
                </span>
                <span className="font-display tabular-nums">{formatXp(member.xp)}</span>
              </li>
            ))}
          </ol>
          {squad.data.joined ? (
            <form onSubmit={(event) => void invite(event)} className="flex flex-wrap items-end gap-3 border-t border-line p-4">
              <label className="text-sm" htmlFor="invite-user">
                Invite by username
                <input id="invite-user" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="focus-ring mt-1 min-h-11 bg-panel px-3" />
              </label>
              <button type="submit" className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
                Invite
              </button>
            </form>
          ) : null}
        </section>
        <ChatPanel
          title="Club chat"
          kicker="Terrace"
          messages={squad.data.messages}
          body={body}
          onBody={setBody}
          onSend={(event) => void send(event)}
          placeholder={squad.data.joined ? "Talk to the squad" : "Join the squad to talk"}
          disabled={!squad.data.joined}
          error={error}
          inputId="squad-chat"
        />
      </div>
    </div>
  );
}
