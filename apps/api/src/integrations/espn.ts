import {
  FootballProviderUnavailable,
  type DomainBroadcast,
  type DomainEvent,
  type DomainFixture,
  type DomainMatchStatus,
  type DomainPlayer,
  type DomainVideo,
  type FootballDataProvider,
} from "@touchline/football-domain";
import { displayCompetition, flagUrl, playerHeadshotUrl, soccerCrestUrl } from "./leagues";

type Json = Record<string, unknown>;

/** Public ESPN scoreboard — no key. Domestic leagues worldwide, then continental cups. */
export const ESPN_LEAGUES = [
  { slug: "eng.1", name: "English Premier League", id: "eng.1", dates: 4 },
  { slug: "esp.1", name: "Spanish La Liga", id: "esp.1", dates: 3 },
  { slug: "ita.1", name: "Italian Serie A", id: "ita.1", dates: 3 },
  { slug: "ger.1", name: "German Bundesliga", id: "ger.1", dates: 3 },
  { slug: "fra.1", name: "French Ligue 1", id: "fra.1", dates: 3 },
  { slug: "eng.2", name: "English League Championship", id: "eng.2", dates: 3 },
  { slug: "ned.1", name: "Dutch Eredivisie", id: "ned.1", dates: 2 },
  { slug: "por.1", name: "Portuguese Primeira Liga", id: "por.1", dates: 2 },
  { slug: "sco.1", name: "Scottish Premiership", id: "sco.1", dates: 2 },
  { slug: "bel.1", name: "Belgian Pro League", id: "bel.1", dates: 2 },
  { slug: "tur.1", name: "Turkish Super Lig", id: "tur.1", dates: 2 },
  { slug: "den.1", name: "Danish Superliga", id: "den.1", dates: 2 },
  { slug: "usa.1", name: "MLS", id: "usa.1", dates: 3 },
  { slug: "mex.1", name: "Mexican Liga BBVA MX", id: "mex.1", dates: 3 },
  { slug: "bra.1", name: "Brazilian Serie A", id: "bra.1", dates: 3 },
  { slug: "arg.1", name: "Argentine Liga Profesional", id: "arg.1", dates: 2 },
  { slug: "ksa.1", name: "Saudi Pro League", id: "ksa.1", dates: 2 },
  { slug: "jpn.1", name: "Japanese J1 League", id: "jpn.1", dates: 2 },
  { slug: "aus.1", name: "Australian A-League", id: "aus.1", dates: 2 },
  { slug: "uefa.nations", name: "UEFA Nations League", id: "uefa.nations", dates: 3 },
  { slug: "uefa.champions", name: "UEFA Champions League", id: "uefa.champions", dates: 2 },
  { slug: "uefa.europa", name: "UEFA Europa League", id: "uefa.europa", dates: 2 },
  { slug: "uefa.europa.conf", name: "UEFA Europa Conference League", id: "uefa.europa.conf", dates: 2 },
  { slug: "conmebol.libertadores", name: "CONMEBOL Libertadores", id: "conmebol.libertadores", dates: 2 },
  { slug: "conmebol.sudamericana", name: "CONMEBOL Sudamericana", id: "conmebol.sudamericana", dates: 2 },
  { slug: "eng.league_cup", name: "English Carabao Cup", id: "eng.league_cup", dates: 1 },
  { slug: "eng.fa", name: "English FA Cup", id: "eng.fa", dates: 1 },
] as const;

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function statusOf(competition: Json): { status: DomainMatchStatus; minute: number | null; extra: number | null } {
  const status = (competition.status as Json | undefined) ?? {};
  const type = (status.type as Json | undefined) ?? {};
  const state = str(type.state)?.toLowerCase();
  const name = (str(type.name) ?? str(type.description) ?? "").toLowerCase();
  const clock = str(status.displayClock) ?? "";
  const period = num(status.period);
  let minute: number | null = null;
  let extra: number | null = null;
  const clockMatch = clock.match(/(\d+)\s*(?:'\s*\+?\s*(\d+))?/);
  if (clockMatch) {
    minute = Number(clockMatch[1]);
    extra = clockMatch[2] ? Number(clockMatch[2]) : null;
  } else if (period === 1) minute = 20;
  else if (period === 2) minute = 70;
  if (state === "pre") return { status: "SCHEDULED", minute: null, extra: null };
  if (state === "post" || name.includes("final") || name.includes("ft")) return { status: "FINISHED", minute: minute ?? 90, extra };
  if (name.includes("half") && (name.includes("end") || name.includes("ht") || name.includes("halftime"))) {
    return { status: "HALFTIME", minute: minute ?? 45, extra };
  }
  if (state === "in") return { status: "LIVE", minute, extra };
  if (name.includes("postpon")) return { status: "POSTPONED", minute: null, extra: null };
  return { status: "UNKNOWN", minute, extra };
}

function eventsFrom(competition: Json, homeId: string, awayId: string): DomainEvent[] {
  const details = asList<Json>((competition.details as Json[]) ?? []);
  const out: DomainEvent[] = [];
  for (const detail of details) {
    const typeText = str((detail.type as Json | undefined)?.text) ?? str(detail.type) ?? "";
    const lower = typeText.toLowerCase();
    let type: DomainEvent["type"] | null = null;
    if (lower.includes("goal") && !lower.includes("own")) type = "GOAL";
    else if (lower.includes("own")) type = "OWN_GOAL";
    else if (lower.includes("yellow")) type = "YELLOW_CARD";
    else if (lower.includes("red")) type = "RED_CARD";
    else if (lower.includes("penalty") && lower.includes("miss")) type = "MISSED_PENALTY";
    else if (lower.includes("penalty")) type = "PENALTY";
    if (!type) continue;
    const athlete = (detail.athlete as Json | undefined) ?? (detail.athletesInvolved as Json[] | undefined)?.[0];
    const team = detail.team as Json | undefined;
    const teamId = str(team?.id) ?? (str((detail.homeAway as string) ?? "") === "away" ? awayId : homeId);
    const clock = str(detail.clock) ?? str(detail.displayClock) ?? "0";
    const parsed = clock.match(/(\d+)/);
    out.push({
      providerEventId: str(detail.id) ?? `${type}:${teamId}:${parsed?.[1] ?? "0"}:${str((athlete as Json | undefined)?.displayName) ?? ""}`,
      type,
      minute: parsed ? Number(parsed[1]) : 0,
      extraMinute: null,
      teamProviderId: teamId,
      playerName: str((athlete as Json | undefined)?.displayName) ?? str((athlete as Json | undefined)?.shortName),
      relatedPlayerName: null,
      detail: typeText,
    });
  }
  return out;
}

function normalizeEvent(raw: Json, leagueName: string, leagueId: string, leagueLogo: string | null): DomainFixture | null {
  const id = str(raw.id);
  const when = str(raw.date);
  const competitions = asList<Json>(raw.competitions as Json[]);
  const competition = competitions[0];
  if (!id || !when || !competition) return null;
  const competitors = asList<Json>(competition.competitors as Json[]);
  const homeRow = competitors.find((row) => str(row.homeAway) === "home");
  const awayRow = competitors.find((row) => str(row.homeAway) === "away");
  const homeTeam = homeRow?.team as Json | undefined;
  const awayTeam = awayRow?.team as Json | undefined;
  const homeName = str(homeTeam?.displayName) ?? str(homeTeam?.name);
  const awayName = str(awayTeam?.displayName) ?? str(awayTeam?.name);
  if (!homeName || !awayName) return null;
  const homeId = str(homeTeam?.id) ?? homeName;
  const awayId = str(awayTeam?.id) ?? awayName;
  const { status, minute, extra } = statusOf(competition);
  const venue = competition.venue as Json | undefined;
  const season = raw.season as Json | undefined;
  const homeLogo = pickCrest(homeTeam, leagueId);
  const awayLogo = pickCrest(awayTeam, leagueId);
  return {
    provider: "espn",
    providerId: id,
    competitionProviderId: leagueId,
    competitionName: displayCompetition(leagueName),
    competitionImage: leagueLogo,
    seasonProviderId: num(season?.year)?.toString() ?? null,
    seasonName: str(season?.displayName) ?? num(season?.year)?.toString() ?? null,
    round: str((raw.week as Json | undefined)?.text) ?? str(competition.notes as never) ?? null,
    venue: str(venue?.fullName),
    kickoffAt: new Date(when).toISOString(),
    status,
    providerState: str((competition.status as Json | undefined)?.type && ((competition.status as Json).type as Json).description) ?? status,
    minute,
    extraMinute: extra,
    second: null,
    lengthMin: 90,
    home: {
      providerId: homeId,
      name: homeName,
      shortCode: str(homeTeam?.abbreviation),
      imageUrl: homeLogo,
    },
    away: {
      providerId: awayId,
      name: awayName,
      shortCode: str(awayTeam?.abbreviation),
      imageUrl: awayLogo,
    },
    homeScore: num(homeRow?.score) ?? 0,
    awayScore: num(awayRow?.score) ?? 0,
    htHomeScore: null,
    htAwayScore: null,
    events: eventsFrom(competition, homeId, awayId),
    lineups: [],
    statistics: [],
    broadcasts: broadcastsFrom(competition),
    videos: [],
  };
}

function broadcastsFrom(competition: Json): DomainBroadcast[] {
  const rows = [...asList<Json>(competition.broadcasts as Json[]), ...asList<Json>(competition.geoBroadcasts as Json[])];
  const out: DomainBroadcast[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const media = (row.media as Json | undefined) ?? row;
    const name = str(media.shortName) ?? str(media.name) ?? str(row.market) ?? str((row.type as Json | undefined)?.shortName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, type: str((row.type as Json | undefined)?.shortName) ?? str(row.type), url: str(media.url) ?? str(row.link) });
  }
  return out;
}

function videosFromSummary(body: Json): DomainVideo[] {
  const buckets = [
    ...asList<Json>(((body.highlights as Json | undefined)?.items as Json[]) ?? []),
    ...asList<Json>(((body.news as Json | undefined)?.videos as Json[]) ?? []),
    ...asList<Json>((body.videos as Json[]) ?? []),
  ];
  const out: DomainVideo[] = [];
  for (const row of buckets) {
    const links = asList<Json>(row.links as Json[]);
    const href =
      str((row.links as Json | undefined) && ((row.links as Json).web as Json | undefined)?.href) ??
      str(row.href) ??
      str((links[0] as Json | undefined)?.href);
    const id = str(row.id) ?? href;
    if (!href || !id) continue;
    const title = str(row.headline) ?? str(row.title) ?? "Highlight";
    const youtube = href.match(/(?:youtu\.be\/|v=)([\w-]{6,})/);
    out.push({
      kind: "HIGHLIGHT",
      title,
      url: youtube ? `https://www.youtube.com/watch?v=${youtube[1]}` : href,
      provider: youtube ? "youtube" : "espn",
      externalId: youtube?.[1] ?? id,
    });
  }
  return out;
}

function lineupsFromSummary(body: Json, homeId: string, awayId: string): { lineups: DomainPlayer[]; homeFormation: string | null; awayFormation: string | null } {
  const lineups: DomainPlayer[] = [];
  const box = body.boxscore as Json | undefined;
  const form = asList<Json>(body.rosters as Json[]).length ? asList<Json>(body.rosters as Json[]) : asList<Json>(box?.form as Json[]);
  const rosters = form.length ? form : asList<Json>(box?.players as Json[]);
  let homeFormation: string | null = null;
  let awayFormation: string | null = null;
  for (const roster of rosters) {
    const team = (roster.team as Json | undefined) ?? {};
    const teamId = str(team.id) ?? homeId;
    const homeAway = str(roster.homeAway) ?? (teamId === awayId ? "away" : "home");
    const formation = str(roster.formation);
    if (homeAway === "home") homeFormation = formation ?? homeFormation;
    else awayFormation = formation ?? awayFormation;
    const nestedStats = asList<Json>(roster.statistics as Json[]);
    const fromAthletes = nestedStats.flatMap((stat) => asList<Json>(stat.athletes as Json[]));
    const entries = [
      ...asList<Json>(roster.roster as Json[]),
      ...asList<Json>(roster.entries as Json[]),
      ...fromAthletes,
    ];
    for (const entry of entries) {
      const athlete = (entry.athlete as Json | undefined) ?? (entry.player as Json | undefined) ?? entry;
      const name = str(athlete.displayName) ?? str(athlete.fullName) ?? str(athlete.shortName) ?? str(athlete.name);
      const pid = str(athlete.id) ?? name;
      if (!name || !pid) continue;
      const pos = (entry.position as Json | undefined) ?? (athlete.position as Json | undefined);
      lineups.push({
        providerId: pid,
        name,
        imageUrl: str((athlete.headshot as Json | undefined)?.href) ?? playerHeadshotUrl(pid),
        teamProviderId: teamId,
        jersey: num(entry.jersey) ?? num(athlete.jersey) ?? num(entry.number),
        starter: Boolean(entry.starter) || str(entry.starter) === "true",
        position: str(pos?.abbreviation) ?? str(pos?.displayName) ?? str(pos?.name) ?? str(entry.position),
        grid: str(entry.formationPlace) ?? str(entry.grid),
      });
    }
  }
  return { lineups, homeFormation, awayFormation };
}

function officialName(row: Json) {
  const athlete = (row.athlete as Json | undefined) ?? {};
  return str(row.displayName) ?? str(row.fullName) ?? str(athlete.displayName) ?? str(athlete.fullName);
}

function officialRole(row: Json) {
  const pos = row.position;
  if (typeof pos === "string") return pos;
  const obj = (pos as Json | undefined) ?? {};
  return str(obj.displayName) ?? str(obj.name) ?? str(row.role) ?? str(row.type);
}

function gameInfoFromSummary(body: Json) {
  const game = (body.gameInfo as Json | undefined) ?? {};
  const header = (body.header as Json | undefined) ?? {};
  const headerComp = asList<Json>(header.competitions as Json[])[0] ?? {};
  const venue = (game.venue as Json | undefined) ?? (headerComp.venue as Json | undefined) ?? {};
  const address = (venue.address as Json | undefined) ?? {};
  const rawOfficials = [
    ...asList<Json>(game.officials as Json[]),
    ...asList<Json>(headerComp.officials as Json[]),
    ...asList<Json>(((body.boxscore as Json | undefined)?.officials as Json[]) ?? []),
  ];
  const officials = rawOfficials
    .map((row) => ({ name: officialName(row) ?? "", role: officialRole(row) ?? "Official" }))
    .filter((row) => row.name.length > 1);
  const referee = officials.find((row) => /ref/i.test(row.role))?.name ?? officials[0]?.name ?? null;
  return {
    venue: str(venue.fullName) ?? str(venue.displayName),
    venueCity: [str(address.city), str(address.state), str(address.country)].filter(Boolean).join(", ") || null,
    referee,
    officials,
    attendance: num(game.attendance) ?? num(headerComp.attendance) ?? num(body.attendance),
  };
}

async function readScoreboard(slug: string, dates?: string): Promise<Json> {
  const query = dates ? `?dates=${dates}&limit=100` : "?limit=100";
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard${query}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Touchline/1.0" } });
  } catch {
    throw new FootballProviderUnavailable();
  }
  if (!response.ok) throw new FootballProviderUnavailable(`ESPN returned ${response.status}.`);
  return (await response.json()) as Json;
}

function pickCrest(team: Json | undefined, leagueId: string) {
  if (!team) return null;
  const logos = asList<Json>(team.logos as Json[]);
  const href = logos.map((row) => str(row.href)).find(Boolean) ?? str(team.logo);
  if (href) return href;
  const fromId = soccerCrestUrl(str(team.id));
  if (fromId) return fromId;
  if (leagueId === "uefa.nations") return flagUrl(str(team.abbreviation) ?? str(team.shortDisplayName));
  return null;
}

function fixturesFromBoard(body: Json, fallbackName: string, fallbackId: string): DomainFixture[] {
  const leagues = asList<Json>(body.leagues as Json[]);
  const league = leagues[0];
  const name = str(league?.name) ?? fallbackName;
  const id = str(league?.slug) ?? fallbackId;
  const logos = asList<Json>(league?.logos as Json[]);
  const logo = str(logos[0]?.href);
  const events = asList<Json>(body.events as Json[]);
  return events.map((row) => normalizeEvent(row, name, id, logo)).filter((row): row is DomainFixture => row != null);
}

export class EspnProvider implements FootballDataProvider {
  readonly name = "espn";

  async getFixtures(query?: { from: Date; to: Date }): Promise<DomainFixture[]> {
    const from = query?.from ?? new Date(Date.now() - 3 * 24 * 60 * 60_000);
    const to = query?.to ?? new Date(Date.now() + 21 * 24 * 60 * 60_000);
    const fixtures: DomainFixture[] = [];
    const seen = new Set<string>();
    const add = (rows: DomainFixture[]) => {
      for (const fixture of rows) {
        const kick = new Date(fixture.kickoffAt).getTime();
        if (kick < from.getTime() - 12 * 60 * 60_000 || kick > to.getTime() + 12 * 60 * 60_000) continue;
        if (seen.has(fixture.providerId)) continue;
        seen.add(fixture.providerId);
        fixtures.push(fixture);
      }
    };
    for (const league of ESPN_LEAGUES) {
      try {
        const body = await readScoreboard(league.slug);
        add(fixturesFromBoard(body, league.name, league.id));
        const calendar = asList<string>((asList<Json>(body.leagues as Json[])[0]?.calendar as string[]) ?? []);
        const upcoming = calendar
          .map((stamp) => new Date(stamp))
          .filter((date) => date.getTime() >= from.getTime() && date.getTime() <= to.getTime())
          .slice(0, league.dates);
        for (const date of upcoming) {
          try {
            add(fixturesFromBoard(await readScoreboard(league.slug, ymd(date)), league.name, league.id));
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
    return fixtures;
  }

  async getLiveFixtures() {
    const fixtures: DomainFixture[] = [];
    for (const league of ESPN_LEAGUES) {
      try {
        const body = await readScoreboard(league.slug);
        fixtures.push(...fixturesFromBoard(body, league.name, league.id));
      } catch {
        continue;
      }
    }
    return fixtures.filter((fixture) => fixture.status === "LIVE" || fixture.status === "HALFTIME");
  }

  async getFixture(id: string) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`;
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Touchline/1.0" } });
    } catch {
      throw new FootballProviderUnavailable();
    }
    if (!response.ok) throw new FootballProviderUnavailable(`ESPN returned ${response.status}.`);
    const body = (await response.json()) as Json;
    const header = body.header as Json | undefined;
    const competitions = asList<Json>(header?.competitions as Json[]);
    const event = {
      id,
      date: str(header?.competitions ? (competitions[0]?.date as string) : null) ?? str((body.gameInfo as Json | undefined)?.venue ? undefined : undefined),
      competitions: header?.competitions ?? body.competitions,
      season: header?.season,
      week: header?.week,
    } as Json;
    if (!str(event.date as string)) {
      const comp = competitions[0];
      event.date = str(comp?.date) ?? new Date().toISOString();
    }
    const league = asList<Json>(header?.leagues as Json[])[0];
    const fixture = normalizeEvent(event, str(league?.name) ?? "Football", str(league?.slug) ?? "espn", str(asList<Json>(league?.logos as Json[])[0]?.href));
    if (!fixture) throw new FootballProviderUnavailable("ESPN fixture could not be read.");
    const extra = lineupsFromSummary(body, fixture.home.providerId, fixture.away.providerId);
    fixture.lineups = extra.lineups;
    fixture.homeFormation = extra.homeFormation;
    fixture.awayFormation = extra.awayFormation;
    fixture.videos = videosFromSummary(body);
    const info = gameInfoFromSummary(body);
    fixture.venue = info.venue ?? fixture.venue;
    fixture.venueCity = info.venueCity;
    fixture.referee = info.referee;
    fixture.officials = info.officials;
    fixture.attendance = info.attendance;
    const headerComp = competitions[0];
    if (headerComp) fixture.broadcasts = broadcastsFrom(headerComp);
    return fixture;
  }

  async getEvents(id: string) {
    return (await this.getFixture(id)).events;
  }
  async getLineups(id: string) {
    return (await this.getFixture(id)).lineups;
  }
  async getStatistics(_id: string) {
    return [];
  }
}
