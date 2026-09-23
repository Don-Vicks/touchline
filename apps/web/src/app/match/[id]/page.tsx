"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ChatPanel } from "@/components/chat-panel";
import { Kit, posTone } from "@/components/kit";
import { MarketBoard } from "@/components/market-board";
import { Scorebug } from "@/components/scorebug";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { LineupBoard } from "@/components/lineup-board";
import { WatchScreen } from "@/components/watch-screen";
import { API_URL, api } from "@/lib/api";
import { formatXp } from "@/lib/format";
import type { ChatLine, FeedEvent, Fan, LineupPlayer, MarketCard, MatchCard, MePayload, WatchShare, WatchVideo } from "@/lib/types";

interface RoomPayload {
  match: MatchCard;
  disabled: boolean;
  events: FeedEvent[];
  markets: MarketCard[];
  messages: ChatLine[];
  members: Fan[];
  joined: boolean;
  matchroomId: string;
  watch: WatchShare | null;
  broadcasts: string[];
  officialWatch: { name: string; url: string }[];
  videos: WatchVideo[];
  formations: { home: string | null; away: string | null };
  lineups: { home: LineupPlayer[]; away: LineupPlayer[] };
}

const reactions = ["🔥", "😂", "😭", "👀", "🤯", "💀", "👏", "😡"];

function eventLabel(event: FeedEvent) {
  const who = [event.teamName, event.playerName].filter(Boolean).join(" · ");
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
  const label = names[event.type] ?? event.type;
  const extra = event.detail && event.detail !== label ? ` — ${event.detail}` : "";
  return who ? `${label} · ${who}${extra}` : `${label}${extra}`;
}

function clock(event: FeedEvent) {
  if (event.type === "HALFTIME") return "HT";
  if (event.type === "FULLTIME") return "FT";
  if (event.type === "KICKOFF") return "KO";
  if (event.extraMinute) return `${event.minute}+${event.extraMinute}`;
  if (event.minute == null) return "—";
  return `${event.minute}'`;
}

function wallClock(kickoffAt: string, event: FeedEvent) {
  const start = new Date(kickoffAt).getTime();
  if (Number.isNaN(start)) return "";
  const added = (event.minute ?? 0) * 60_000 + (event.extraMinute ?? 0) * 60_000;
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(new Date(start + added));
}

function eventTone(type: string) {
  if (type === "GOAL" || type === "PENALTY") return "border-lime text-foreground";
  if (type === "RED_CARD" || type === "SECOND_YELLOW") return "border-live text-foreground";
  if (type === "YELLOW_CARD") return "border-flood text-foreground";
  return "border-line text-foreground";
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
  const [tab, setTab] = useState<"watch" | "terrace" | "teams" | "calls" | "play">("watch");
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setTab("terrace");
  }, []);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<ChatLine | null>(null);

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
    if (featuredId) return markets.find((market) => market.id === featuredId) ?? markets[0] ?? null;
    return markets.find((market) => market.tradable || market.xpOnly) ?? markets[0] ?? null;
  }, [room.data?.markets, featuredId]);

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
  const upcoming = data.match.status === "SCHEDULED";
  const panels = [
    { id: "watch" as const, label: "Watch" },
    { id: "terrace" as const, label: "Chat" },
    { id: "teams" as const, label: "Teams" },
    { id: "calls" as const, label: "Calls" },
    { id: "play" as const, label: "Play" },
  ];

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
        body: JSON.stringify({ body: text, replyToId: replyTo?.id }),
      });
      setBody("");
      setReplyTo(null);
      await room.refetch();
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "Could not send.");
    }
  }

  const chat = (
    <ChatPanel
      title="Terrace"
      kicker={upcoming ? "Gather before kickoff" : "Talk like you’re here"}
      messages={data.messages}
      body={body}
      onBody={setBody}
      onSend={(event) => void send(event)}
      placeholder={data.joined ? (replyTo ? `Reply to ${replyTo.user.displayName}` : "Talk with the room") : "Join to talk with friends"}
      disabled={!data.joined}
      error={sendError && data.joined ? sendError : null}
      inputId="match-chat"
      replyTo={replyTo}
      onReply={setReplyTo}
      onClearReply={() => setReplyTo(null)}
      reactions={
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1">
          {reactions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-lg hover:bg-turf/50"
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
              {counts[emoji] ? <span className="ml-1 font-display text-sm tabular-nums text-muted">{counts[emoji]}</span> : null}
            </button>
          ))}
        </div>
      }
    />
  );

  return (
    <div className="space-y-4">
      {data.disabled ? <p className="text-sm text-muted">This matchroom is paused.</p> : null}
      {!data.joined ? (
        <button type="button" onClick={() => void join().catch((caught: Error) => setSendError(caught.message))} className="focus-ring flex min-h-14 w-full items-center justify-between bg-lime px-5 font-display text-sm uppercase tracking-[0.16em] text-ink">
          <span>{upcoming ? "Open the room" : "Join the terrace"}</span>
          <span>{data.match.watching} already in</span>
        </button>
      ) : null}
      {sendError && !data.joined ? (
        <p className="text-sm text-no" role="alert">
          {sendError}
        </p>
      ) : null}
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Matchroom">
        {panels.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`focus-ring min-h-11 shrink-0 px-4 font-display text-sm uppercase tracking-[0.12em] ${tab === item.id ? "bg-lime text-ink" : "bg-panel text-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {(tab === "watch" || tab === "terrace") && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]">
          <div className={tab === "watch" ? "block space-y-4" : "hidden lg:block lg:space-y-4"}>
            <WatchScreen
              match={data.match}
              watch={data.watch}
              videos={data.videos ?? []}
              broadcasts={data.broadcasts ?? []}
              officialWatch={data.officialWatch ?? []}
              canSet={data.joined}
              onSet={async (url) => {
                await api(`/matchrooms/${data.matchroomId}/watch`, { method: "POST", body: JSON.stringify({ url }) });
                await room.refetch();
              }}
            />
            <div className="md:hidden">
              <Scorebug match={data.match} variant="row" />
            </div>
            <div className="hidden md:block">
              <Scorebug match={data.match} variant="board" />
            </div>
            {(data.match.venue || data.match.referee || data.match.officials?.length || data.match.attendance) ? (
              <dl className="grid gap-3 bg-card/80 px-4 py-3 text-sm ring-1 ring-line sm:grid-cols-3">
                {data.match.venue ? (
                  <div>
                    <dt className="kicker">Stadium</dt>
                    <dd className="mt-1 font-medium">{data.match.venue}</dd>
                    {data.match.venueCity ? <dd className="text-muted">{data.match.venueCity}</dd> : null}
                  </div>
                ) : null}
                {data.match.referee ? (
                  <div>
                    <dt className="kicker">Referee</dt>
                    <dd className="mt-1 font-medium">{data.match.referee}</dd>
                  </div>
                ) : null}
                {data.match.officials?.length ? (
                  <div>
                    <dt className="kicker">Officials</dt>
                    <dd className="mt-1">
                      {data.match.officials.map((row) => (
                        <p key={`${row.role}-${row.name}`}>
                          {row.name}
                          <span className="text-muted"> · {row.role}</span>
                        </p>
                      ))}
                    </dd>
                    {data.match.attendance ? <dd className="text-muted">{data.match.attendance.toLocaleString()} in</dd> : null}
                  </div>
                ) : data.match.attendance ? (
                  <div>
                    <dt className="kicker">Crowd</dt>
                    <dd className="mt-1 font-medium">{data.match.attendance.toLocaleString()}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          <div className={tab === "terrace" ? "block" : "hidden lg:block"}>{chat}</div>
        </div>
      )}
      {tab === "teams" ? (
        <LineupBoard
          homeName={data.match.home.name}
          awayName={data.match.away.name}
          home={data.lineups?.home ?? []}
          away={data.lineups?.away ?? []}
          homeFormation={data.formations?.home ?? null}
          awayFormation={data.formations?.away ?? null}
        />
      ) : null}
      {tab === "calls" ? (
        <MarketBoard
          markets={data.markets}
          featuredId={featured?.id ?? null}
          signedIn={Boolean(me.data?.user)}
          onPick={setFeaturedId}
        />
      ) : null}
      {tab === "play" ? (
        <section className="bg-card/80 ring-1 ring-line" aria-label="Match events">
          <div className="border-b border-line px-4 py-3">
            <p className="kicker">Commentary</p>
            <h2 className="font-serif text-2xl">What happened</h2>
          </div>
          {events.length ? (
            <ol>
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const linked = data.markets.find((market) => market.sourceEventId === event.providerEventId);
                      if (linked) {
                        setFeaturedId(linked.id);
                        setTab("calls");
                      }
                    }}
                    className={`focus-ring flex min-h-12 w-full items-baseline gap-4 border-l-4 px-4 py-3 text-left ${eventTone(event.type)}`}
                  >
                    <span className="w-16 shrink-0">
                      <span className="block font-display text-xl tabular-nums leading-none">{clock(event)}</span>
                      <span className="font-display text-xs tabular-nums text-muted">{wallClock(data.match.kickoffAt, event)}</span>
                    </span>
                    <span>{eventLabel(event)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="px-4">
              <Empty title="No events yet" body="Goals, cards, and corners show up here as the feed sends them." />
            </div>
          )}
          {data.members.length ? (
            <div className="border-t border-line px-4 py-3">
              <p className="kicker mb-2">In the room</p>
              <ol className="space-y-2">
                {data.members.map((member, index) => (
                  <li key={member.id} className="flex items-center gap-3">
                    <span className={`w-8 font-display text-xl tabular-nums ${posTone(index + 1)}`}>{index + 1}</span>
                    <Kit name={member.displayName} imageUrl={member.avatarUrl} seed={member.username} size="sm" />
                    <span className="min-w-0 flex-1">{member.displayName}</span>
                    <span className="font-display tabular-nums">{formatXp(member.xp)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
