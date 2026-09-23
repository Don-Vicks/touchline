/** User-pasted YouTube, Twitch, or HLS. We do not scrape public IPTV directories. */

export type WatchShare = {
  provider: "youtube" | "twitch" | "hls";
  source: string;
  youtubeId?: string;
  twitchChannel?: string;
  hlsUrl?: string;
};

export function parseWatchUrl(raw: string): WatchShare | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (!id) return null;
    return { provider: "youtube", youtubeId: id, source: url.toString() };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const fromQuery = url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    const fromPath = parts[0] === "live" || parts[0] === "embed" || parts[0] === "shorts" ? parts[1] : parts[0] === "watch" ? fromQuery : fromQuery;
    const id = fromQuery ?? fromPath;
    if (!id) return null;
    return { provider: "youtube", youtubeId: id, source: url.toString() };
  }
  if (host === "twitch.tv") {
    const channel = url.pathname.split("/").filter(Boolean)[0];
    if (!channel || channel === "videos" || channel === "directory") return null;
    return { provider: "twitch", twitchChannel: channel, source: url.toString() };
  }
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8") || url.search.toLowerCase().includes("m3u8")) {
    return { provider: "hls", hlsUrl: url.toString(), source: url.toString() };
  }
  return null;
}
