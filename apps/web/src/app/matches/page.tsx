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

export default function MatchesPage() {
  const [when, setWhen] = useState("upcoming");
  const tz = new Date().getTimezoneOffset() * -1;
  const matches = useQuery({
    queryKey: ["matches", when, tz],
    queryFn: () => api<{ matches: MatchCard[] }>(`/matches?when=${when}&tz=${tz}`),
  });

  return (
    <div>
      <p className="text-sm text-muted">Football</p>
      <h1 className="font-serif text-5xl tracking-tight">Matches</h1>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="When">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setWhen(filter.id)}
            className={`focus-ring min-h-11 px-3 text-sm ${when === filter.id ? "bg-foreground text-ink" : "text-muted"}`}
          >
            {filter.label}
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
              ? "The feeds are connected. Switch to Upcoming for the next Premier League, Bundesliga, and Superliga kickoffs."
              : "None of the football feeds returned a match for this filter."
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
      <div className="mt-4">
        {matches.data?.matches.map((match) => (
          <Scorebug key={match.id} match={match} href={`/match/${match.id}`} variant="row" />
        ))}
      </div>
    </div>
  );
}
