"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Scorebug } from "@/components/scorebug";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import type { MatchCard } from "@/lib/types";

const filters = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "results", label: "Results" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
] as const;

const leagues = [
  { id: "", label: "All leagues" },
  { id: "epl", label: "Premier League" },
  { id: "laliga", label: "La Liga" },
  { id: "seriea", label: "Serie A" },
  { id: "bundesliga", label: "Bundesliga" },
  { id: "ligue1", label: "Ligue 1" },
  { id: "championship", label: "Championship" },
  { id: "mls", label: "MLS" },
  { id: "ligamx", label: "Liga MX" },
  { id: "brasileirao", label: "Brasileirão" },
  { id: "ligaarg", label: "Liga Profesional" },
  { id: "libertadores", label: "Libertadores" },
  { id: "ucl", label: "Champions League" },
  { id: "nations", label: "Nations League" },
  { id: "saudi", label: "Saudi Pro League" },
  { id: "jleague", label: "J1 League" },
] as const;

export default function MatchesPage() {
  const [when, setWhen] = useState("upcoming");
  const [league, setLeague] = useState("");
  const tz = new Date().getTimezoneOffset() * -1;
  const matches = useQuery({
    queryKey: ["matches", when, league, tz],
    queryFn: () => api<{ matches: MatchCard[] }>(`/matches?when=${when}&tz=${tz}${league ? `&league=${league}` : ""}`),
    refetchInterval: when === "live" ? 20_000 : 60_000,
  });

  return (
    <div>
      <p className="kicker">Europe · Americas · Asia · international</p>
      <h1 className="font-serif text-5xl tracking-tight">Fixtures</h1>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="When">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setWhen(filter.id)}
            className={`focus-ring min-h-11 px-3 font-display text-sm uppercase tracking-[0.12em] ${when === filter.id ? "bg-lime text-ink" : "bg-card text-muted"}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="League">
        {leagues.map((row) => (
          <button
            key={row.id || "all"}
            type="button"
            onClick={() => setLeague(row.id)}
            className={`focus-ring min-h-11 border px-3 font-display text-sm uppercase tracking-[0.1em] ${league === row.id ? "border-lime bg-turf text-foreground" : "border-line text-muted"}`}
          >
            {row.label}
          </button>
        ))}
      </div>
      {matches.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {matches.isError ? <ErrorState message={matches.error.message} onRetry={() => matches.refetch()} /> : null}
      {matches.data && matches.data.matches.length === 0 ? (
        <Empty
          title={when === "live" ? "No football is live" : "Nothing in this window"}
          body={
            when === "live"
              ? "No live kickoff in this league right now. Upcoming still lists the next matches from Europe, the Americas, and Asia."
              : "None of the free feeds returned a match for this filter yet. The next window sync fills every tracked league."
          }
          action={
            when === "live" ? (
              <button type="button" onClick={() => setWhen("upcoming")} className="focus-ring min-h-11 text-sm underline">
                Show upcoming
              </button>
            ) : undefined
          }
        />
      ) : null}
      <div className="mt-6 space-y-10">
        {Object.entries(
          (matches.data?.matches ?? []).reduce<Record<string, MatchCard[]>>((groups, match) => {
            const key = match.competition.name;
            (groups[key] ??= []).push(match);
            return groups;
          }, {}),
        ).map(([competition, rows]) => (
          <section key={competition}>
            <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
              {rows[0]?.competition.imageUrl ? <img src={rows[0].competition.imageUrl} alt="" className="h-7 w-7 object-contain" /> : null}
              <h2 className="font-display text-sm uppercase tracking-[0.16em] text-lime">{competition}</h2>
            </div>
            {rows.map((match) => (
              <Scorebug key={match.id} match={match} href={`/match/${match.id}`} variant="row" />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
