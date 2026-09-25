import type { DomainVideo } from "@touchline/football-domain";

/** Official league YouTube channels — the same family of sources Google’s match card uses. */
const CHANNELS: { match: RegExp; ids: string[] }[] = [
  { match: /premier league/i, ids: ["UCG5qGWdu8nIRZqJ_GgDwQ-w", "UCqZQlzSHbVJrwrn5XvzrzcA"] },
  { match: /la liga|laliga/i, ids: ["UCTv-XvfzLX3i4Y9VVzMRJ2w"] },
  { match: /serie a/i, ids: ["UCBJeMCIeLQos7wacox4hmjw"] },
  { match: /bundesliga/i, ids: ["UC6UL29enLNe4mqwTfAyeNuw"] },
  { match: /ligue 1/i, ids: ["UCQ7dFBzZGlBvtU2WZwn1YzQ"] },
  { match: /\bmls\b/i, ids: ["UCSZbXT5TLLW_i-5W8FZpFsg"] },
  { match: /champions league/i, ids: ["UCET00YnetHT7tOpu12nGvow"] },
  { match: /nations league/i, ids: ["UC4i_9WvfPRTuRWEaWyfTekA"] },
];

function tokens(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|united|city|town|hotspur|wanderers|athletic|real|club|de|the)\b/g, "")
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter((part) => part.length >= 4);
}

function clipTitle(title: string) {
  return /highlight|goals|recap|extended|all goals|match clip/i.test(title);
}

function titleHits(title: string, home: string, away: string) {
  const t = title.toLowerCase();
  const last = (value: string) => value.toLowerCase().split(/\s+/).pop() ?? "___";
  const homeOk = tokens(home).some((part) => t.includes(part)) || t.includes(last(home));
  const awayOk = tokens(away).some((part) => t.includes(part)) || t.includes(last(away));
  if (!clipTitle(title)) return false;
  return homeOk && awayOk;
}

async function readXml(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/atom+xml,text/xml", "User-Agent": "Touchline/1.0" } });
  if (!response.ok) return "";
  return response.text();
}

function videosFromXml(xml: string, home: string, away: string): DomainVideo[] {
  const out: DomainVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
    if (!videoId || !title) continue;
    if (!titleHits(title, home, away)) {
      const t = title.toLowerCase();
      const last = (value: string) => value.toLowerCase().split(/\s+/).pop() ?? "___";
      if (!clipTitle(title) || !(t.includes(last(home)) || t.includes(last(away)))) continue;
    }
    out.push({
      kind: "HIGHLIGHT",
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      provider: "youtube",
      externalId: videoId,
    });
  }
  return out;
}

function uploadsPlaylist(channelId: string) {
  return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
}

export async function fetchOfficialChannelHighlights(home: string, away: string, competition: string): Promise<DomainVideo[]> {
  const ids = CHANNELS.find((row) => row.match.test(competition))?.ids ?? [];
  const extra = ["UCG5qGWdu8nIRZqJ_GgDwQ-w"];
  const all = [...new Set([...ids, ...extra])];
  const feeds = [
    ...all.map((id) => readXml(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)),
    ...all.map((id) => readXml(`https://www.youtube.com/feeds/videos.xml?playlist_id=${uploadsPlaylist(id)}`)),
    readXml("https://www.youtube.com/feeds/videos.xml?user=SuperSport"),
    readXml("https://www.youtube.com/feeds/videos.xml?user=SkySports"),
  ];
  const xmls = await Promise.all(feeds);
  const out: DomainVideo[] = [];
  const seen = new Set<string>();
  for (const xml of xmls) {
    for (const video of videosFromXml(xml, home, away)) {
      if (seen.has(video.url)) continue;
      seen.add(video.url);
      out.push(video);
    }
  }
  return out.slice(0, 6);
}
