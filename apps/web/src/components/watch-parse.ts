import type { WatchShare } from "@/lib/types";

export function parseWatchUrl(raw: string): WatchShare | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { provider: "youtube", youtubeId: id, source: url.toString() } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    return id ? { provider: "youtube", youtubeId: id, source: url.toString() } : null;
  }
  if (host === "twitch.tv") {
    const channel = url.pathname.split("/").filter(Boolean)[0];
    if (!channel || channel === "videos") return null;
    return { provider: "twitch", twitchChannel: channel, source: url.toString() };
  }
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8") || url.search.toLowerCase().includes("m3u8")) {
    return { provider: "hls", hlsUrl: url.toString(), source: url.toString() };
  }
  return null;
}
