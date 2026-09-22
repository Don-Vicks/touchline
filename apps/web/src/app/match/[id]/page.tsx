"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { MarketPanel } from "@/components/market-card";
import { Scorebug } from "@/components/scorebug";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { API_URL, api } from "@/lib/api";
import { formatXp } from "@/lib/format";
import type { ChatLine, FeedEvent, Fan, MarketCard, MatchCard, MePayload } from "@/lib/types";

interface RoomPayload {
  match: MatchCard;
  disabled: boolean;
  events: FeedEvent[];
  markets: MarketCard[];
  messages: ChatLine[];
  members: Fan[];
  joined: boolean;
  matchroomId: string;
}

const reactions = ["🔥", "😂", "😭", "👀", "🤯", "💀", "👏", "😡"];

function eventLabel(event: FeedEvent) {
  const who = event.playerName ? ` ${event.playerName}` : "";
  const names: Record<string, string> = {
    GOAL: "Goal",
    OWN_GOAL: "Own goal",
    PENALTY: "Penalty",
    MISSED_PENALTY: "Missed penalty",
    YELLOW_CARD: "Yellow card",
    SECOND_YELLOW: "Second yellow",
    RED_CARD: "Red card",
    SUBSTITUTION: "Substitution",
    CORNER: "Corner",
    SHOT: "Shot",
    SHOT_ON_TARGET: "Shot on target",
    VAR: "VAR",
    KICKOFF: "Kickoff",
    HALFTIME: "Half time",
    FULLTIME: "Full time",
  };
  return `${names[event.type] ?? event.type}${who}`;
}

function clock(event: FeedEvent) {
  if (event.type === "HALFTIME") return "HT";
  if (event.type === "FULLTIME") return "FT";
  if (event.extraMinute) return `${event.minute}+${event.extraMinute}`;
  return `${event.minute}'`;
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);
  if (!id) return <Skeleton className="h-64 w-full" />;
  return <Room matchId={id} />;
}

function Room({ matchId }: { matchId: string }) {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });
  const room = useQuery({
    queryKey: ["room", matchId],
    queryFn: () => api<RoomPayload>(`/matches/${matchId}/room`),
    refetchInterval: (query) => (query.state.data ? 8000 : false),
  });
  const [tab, setTab] = useState<"chat" | "events" | "squad">("chat");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!room.data?.joined || !me.data?.user) return;
    const socket: Socket = io(API_URL, { withCredentials: true });
    socket.on("connect", () => socket.emit("user:join", { matchroomId: room.data!.matchroomId }));
    const refresh = () => void client.invalidateQueries({ queryKey: ["room", matchId] });
    socket.on("message:new", refresh);
    socket.on("chat:new", refresh);
    socket.on("match:update", refresh);
    socket.on("match:event", refresh);
    socket.on("market:new", refresh);
    socket.on("market:update", refresh);
    socket.on("prediction:new", refresh);
    socket.on("reaction:new", (payload: { counts?: Record<string, string> }) => {
      if (payload.counts) setCounts(payload.counts);
    });
    socket.on("message:error", (payload: { error?: string }) => setSendError(payload.error ?? "Could not send."));
    return () => {
      socket.emit("user:leave", { matchroomId: room.data?.matchroomId });
      socket.disconnect();
    };
  }, [room.data?.joined, room.data?.matchroomId, me.data?.user, client, matchId]);

  const featured = useMemo(() => {
    const markets = room.data?.markets ?? [];
    if (selected) {
      return (
        markets.find((market) => market.sourceEventId === selected) ??
        markets.find((market) => market.tradable) ??
        markets[0] ??
        null
      );
    }
    return markets.find((market) => market.tradable) ?? markets.find((market) => market.status !== "RESOLVED") ?? markets[0] ?? null;
  }, [room.data?.markets, selected]);

  if (room.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (room.isError || !room.data) return <ErrorState message={room.error?.message ?? "Matchroom unavailable."} onRetry={() => room.refetch()} />;

  const data = room.data;
  const events = [...data.events].reverse();

  async function join() {
    await api(`/matchrooms/${data.matchroomId}/join`, { method: "POST" });
    await room.refetch();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSendError(null);
    try {
      await api(`/matchrooms/${data.matchroomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      setBody("");
      await room.refetch();
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "Could not send.");
    }
  }

  return (
    <div className="space-y-4">
      <Scorebug match={data.match} variant="hero" />
      {data.disabled ? <p className="text-sm text-muted">This matchroom is paused.</p> : null}
      {!data.joined ? (
        <button type="button" onClick={() => void join().catch((caught: Error) => setSendError(caught.message))} className="focus-ring min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
          Join matchroom
        </button>
      ) : null}
      {sendError && !data.joined ? (
        <p className="text-sm text-no" role="alert">
          {sendError}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-4">
          <MarketPanel market={featured} signedIn={Boolean(me.data?.user)} />
          <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Room sections">
            {(["chat", "events", "squad"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`focus-ring min-h-11 flex-1 text-sm capitalize ${tab === item ? "bg-foreground text-ink" : "bg-panel"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <section className={tab === "events" ? "block" : "hidden lg:block"} aria-label="Match events">
            <h2 className="font-serif text-2xl">What happened</h2>
            {events.length ? (
              <ol className="mt-3">
                {events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(event.providerEventId)}
                      className="focus-ring flex min-h-11 w-full items-baseline gap-4 border-b border-line py-2 text-left"
                    >
                      <span className="w-14 shrink-0 font-display text-xl tabular-nums text-muted">{clock(event)}</span>
                      <span>{eventLabel(event)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty title="No events yet" body="Goals, cards, and corners show up here as the feed sends them." />
            )}
            {selected ? (
              <p className="mt-2 text-sm text-muted">
                {data.markets.some((market) => market.sourceEventId === selected)
                  ? "That moment opened the call above."
                  : "No call tied to that moment."}
              </p>
            ) : null}
          </section>
        </div>
        <div className="space-y-4">
          <section className={tab === "squad" ? "block" : "hidden lg:block"} aria-label="In the room">
            <h2 className="font-serif text-2xl">In the room</h2>
            {data.members.length ? (
              <ol className="mt-3">
                {data.members.map((member, index) => (
                  <li key={member.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2">
                    <span>
                      <span className="font-display tabular-nums text-muted">#{index + 1}</span> {member.displayName}
                    </span>
                    <span className="font-display tabular-nums">{formatXp(member.xp)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">Nobody’s checked in yet.</p>
            )}
          </section>
          <section className={tab === "chat" ? "flex min-h-80 flex-col" : "hidden min-h-80 flex-col lg:flex"} aria-label="Chat">
            <div className="flex gap-1 overflow-x-auto border-b border-line py-2">
              {reactions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="focus-ring min-h-11 min-w-11 text-lg"
                  aria-label={`React ${emoji}`}
                  onClick={() => {
                    const socket = io(API_URL, { withCredentials: true });
                    socket.on("connect", () => {
                      socket.emit("user:join", { matchroomId: data.matchroomId });
                      socket.emit("reaction:add", { emoji, matchId });
                      window.setTimeout(() => socket.disconnect(), 400);
                    });
                  }}
                >
                  <span aria-hidden>{emoji}</span>
                  {counts[emoji] ? <span className="ml-1 font-display text-sm tabular-nums">{counts[emoji]}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              {data.messages.length ? (
                data.messages.map((message) => (
                  <p key={message.id} className={message.kind === "message" ? "text-sm" : "text-sm text-foreground"}>
                    <span className="text-muted">{message.user.displayName}</span> {message.body}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted">The room is quiet. Say something.</p>
              )}
            </div>
            <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t border-line pt-3">
              <label className="sr-only" htmlFor="chat-body">
                Message
              </label>
              <input
                id="chat-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={500}
                placeholder={data.joined ? "Talk your side" : "Join the room to talk"}
                disabled={!data.joined}
                className="focus-ring min-h-11 flex-1 bg-panel px-3 text-sm"
              />
              <button type="submit" disabled={!data.joined} className="focus-ring min-h-11 bg-foreground px-4 text-sm font-medium text-ink disabled:opacity-50">
                Send
              </button>
            </form>
            {sendError && data.joined ? (
              <p className="px-3 pb-3 text-sm text-no" role="alert">
                {sendError}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
