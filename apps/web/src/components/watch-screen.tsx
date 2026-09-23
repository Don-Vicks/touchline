"use client";

import { useMemo, useState } from "react";
import { HlsPlayer } from "@/components/hls-player";
import type { MatchCard, WatchShare, WatchVideo } from "@/lib/types";
import { parseWatchUrl } from "./watch-parse";

function embedSrc(watch: WatchShare | null) {
  if (!watch) return null;
  if (watch.provider === "youtube" && watch.youtubeId) {
    return `https://www.youtube.com/embed/${watch.youtubeId}?autoplay=1&rel=0`;
  }
  if (watch.provider === "twitch" && watch.twitchChannel) {
    const parent = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return `https://player.twitch.tv/?channel=${encodeURIComponent(watch.twitchChannel)}&parent=${parent}&autoplay=true`;
  }
  return null;
}

export function WatchScreen({
  match,
  watch,
  videos,
  broadcasts,
  officialWatch,
  canSet,
  onSet,
}: {
  match: MatchCard;
  watch: WatchShare | null;
  videos: WatchVideo[];
  broadcasts: string[];
  officialWatch: { name: string; url: string }[];
  canSet: boolean;
  onSet: (url: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const live = match.status === "LIVE" || match.status === "HALFTIME";
  const finished = match.status === "FINISHED";
  const auto = useMemo(() => {
    if (watch) return watch;
    const kind = live ? "LIVE" : "HIGHLIGHT";
    const row =
      videos.find((video) => video.featured && (video.embeddable || video.provider === "youtube")) ??
      videos.find((video) => video.kind === kind && (video.embeddable || video.provider === "youtube")) ??
      videos.find((video) => video.provider === "youtube" || video.embeddable);
    if (!row) return null;
    if (row.provider === "youtube" && row.externalId) {
      return { provider: "youtube" as const, youtubeId: row.externalId, source: row.url };
    }
    return parseWatchUrl(row.url);
  }, [watch, videos, live]);
  const chosen = picked ? parseWatchUrl(picked) ?? auto : auto;
  const src = embedSrc(chosen);
  const query = encodeURIComponent(
    finished ? `${match.home.name} vs ${match.away.name} highlights` : `${match.home.name} vs ${match.away.name} live`,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSet(url);
      setUrl("");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not put that on the screen.");
    }
  }

  return (
    <section className="overflow-hidden bg-pitch ring-1 ring-line">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <p className="kicker text-flood">{finished ? "Highlights" : live ? "On the big screen" : "Watch together"}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`https://www.youtube.com/results?search_query=${query}`}
            target="_blank"
            rel="noreferrer"
            className="focus-ring font-display text-xs uppercase tracking-[0.14em] text-flood"
          >
            {finished ? "More highlights" : "Find official stream"}
          </a>
          {canSet ? (
            <button type="button" onClick={() => setOpen((value) => !value)} className="focus-ring font-display text-xs uppercase tracking-[0.14em] text-lime">
              {watch ? "Change feed" : "Put YouTube / Twitch on"}
            </button>
          ) : null}
        </div>
      </div>
      {chosen?.provider === "hls" && chosen.hlsUrl ? (
        <div className="relative aspect-video max-h-[40vh] bg-ink md:max-h-none">
          <HlsPlayer src={chosen.hlsUrl} title={`${match.home.name} vs ${match.away.name}`} />
        </div>
      ) : src ? (
        <div className="relative aspect-video max-h-[40vh] bg-ink md:max-h-none">
          <iframe
            title={`${match.home.name} vs ${match.away.name} watch together`}
            src={src}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="pitch-mark relative aspect-video max-h-[36vh] md:max-h-none">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pitch/70 px-6 text-center">
            <p className="font-serif text-2xl tracking-tight md:text-3xl">
              {finished
                ? videos.length
                  ? "Pick a clip below"
                  : "No official clip yet"
                : live
                  ? "Put the match on"
                  : "Watch here with your people"}
            </p>
            <p className="max-w-md text-sm text-flood">
              {finished
                ? videos.length
                  ? "Official recaps from league and SuperSport YouTube. Tap a title to play."
                  : "Clips usually land after full time. Use More highlights, or paste a YouTube link so the room shares it."
                : live
                  ? "Watch on an official broadcaster, or paste YouTube / Twitch so the whole terrace sees one picture."
                  : "Open the room now. Chat with friends here — this is the TV when kickoff comes."}
            </p>
          </div>
        </div>
      )}
      {(broadcasts.length || officialWatch.length) && !finished ? (
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          {broadcasts.map((name) => (
            <span key={name} className="bg-turf px-2 py-1 font-display text-xs uppercase tracking-widest">
              On {name}
            </span>
          ))}
          {officialWatch.map((row) => (
            <a key={row.url} href={row.url} target="_blank" rel="noreferrer" className="focus-ring bg-lime px-2 py-1 font-display text-xs uppercase tracking-widest text-ink">
              Watch on {row.name}
            </a>
          ))}
        </div>
      ) : null}
      {videos.length ? (
        <ul className="divide-y divide-white/10 border-t border-white/10">
          {videos.slice(0, 5).map((video) => (
            <li key={video.id}>
              <button type="button" onClick={() => setPicked(video.url)} className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm">
                <span className="truncate">{video.title}</span>
                <span className="kicker shrink-0">{video.kind === "LIVE" ? "Live" : "Clip"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap gap-2 border-t border-white/10 p-3">
          <label className="sr-only" htmlFor="watch-url">
            Official stream URL
          </label>
          <input
            id="watch-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="YouTube, Twitch, or https://…/stream.m3u8"
            className="focus-ring min-h-11 flex-1 bg-panel px-3 text-sm"
          />
          <button type="submit" className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
            Show
          </button>
          {error ? (
            <p className="w-full text-sm text-no" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
