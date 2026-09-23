import { config } from "../config";
import type { DomainVideo } from "@touchline/football-domain";
import { logger } from "../logger";
import { redis } from "../redis";

type Json = Record<string, unknown>;

export async function youtubeQuotaBlocked() {
  return Boolean(await redis.get("youtube:quota"));
}

export async function searchYoutubeVideos(query: string, opts?: { eventType?: "live" | "completed" }): Promise<DomainVideo[]> {
  if (!config.youtubeApiKey) return [];
  if (await redis.get("youtube:quota")) return [];
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "5",
    key: config.youtubeApiKey,
    safeSearch: "strict",
    relevanceLanguage: "en",
  });
  if (opts?.eventType === "live") params.set("eventType", "live");
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    return [];
  }
  if (response.status === 403 || response.status === 429) {
    await redis.set("youtube:quota", "1", "EX", 6 * 60 * 60);
    logger.warn({ status: response.status, query }, "YouTube search quota hit");
    return [];
  }
  if (!response.ok) {
    logger.warn({ status: response.status, query }, "YouTube search failed");
    return [];
  }
  const body = (await response.json()) as Json;
  const items = Array.isArray(body.items) ? (body.items as Json[]) : [];
  const out: DomainVideo[] = [];
  for (const item of items) {
    const id = item.id as Json | undefined;
    const snippet = item.snippet as Json | undefined;
    const videoId = typeof id?.videoId === "string" ? id.videoId : null;
    const title = typeof snippet?.title === "string" ? snippet.title : null;
    if (!videoId || !title) continue;
    const live = snippet?.liveBroadcastContent === "live";
    out.push({
      kind: live ? "LIVE" : "HIGHLIGHT",
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      provider: "youtube",
      externalId: videoId,
      channelTitle: typeof snippet?.channelTitle === "string" ? snippet.channelTitle : null,
    });
  }
  return out;
}

export function scoreHighlight(
  video: { title: string; channelTitle?: string | null },
  home: string,
  away: string,
) {
  const text = `${video.title} ${video.channelTitle ?? ""}`.toLowerCase();
  const last = (name: string) => name.toLowerCase().split(/\s+/).pop() ?? "";
  let score = 0;
  if (/highlight|extended|goals|recap|all goals/.test(text)) score += 6;
  if (text.includes(last(home))) score += 4;
  if (text.includes(last(away))) score += 4;
  if (/premier league|sky sports|super sport|supersport|nbc sports|laliga|serie a|bundesliga|uefa|mls/.test(text)) score += 5;
  if (/short|funny|reaction|remix|ai /.test(text)) score -= 6;
  return score;
}

export function pickBestHighlight<T extends { title: string; channelTitle?: string | null }>(videos: T[], home: string, away: string) {
  if (!videos.length) return null;
  return [...videos].sort((a, b) => scoreHighlight(b, home, away) - scoreHighlight(a, home, away))[0] ?? null;
}
