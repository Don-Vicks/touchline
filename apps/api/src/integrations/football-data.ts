import { FootballProviderUnavailable, type DomainFixture, type DomainMatchStatus, type DomainPlayer, type FootballDataProvider } from "@touchline/football-domain";
import { logger } from "../logger";

type Json = Record<string, unknown>;

const COMPETITIONS = "PL,PD,BL1,SA,FL1,CL,EL,PPL,DED,BSA";

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function lineupsFrom(raw: Json, homeId: string, awayId: string): { lineups: DomainPlayer[]; homeFormation: string | null; awayFormation: string | null } {
  const lineups: DomainPlayer[] = [];
  let homeFormation: string | null = null;
  let awayFormation: string | null = null;
  for (const row of asList<Json>(raw.lineups as Json[])) {
    const team = (row.team as Json | undefined) ?? {};
    const teamId = String(num(team.id) ?? str(team.name) ?? "");
    const formation = str(row.formation);
    if (teamId === homeId || str(team.name)?.includes(String(homeId))) homeFormation = formation ?? homeFormation;
    else awayFormation = formation ?? awayFormation;
    const sideId = teamId || (lineups.some((p) => p.teamProviderId === homeId) ? awayId : homeId);
    for (const slot of asList<Json>(row.startXI as Json[])) {
      const player = (slot.player as Json | undefined) ?? slot;
      const name = str(player.name);
      const pid = String(num(player.id) ?? name ?? "");
      if (!name) continue;
      lineups.push({
        providerId: pid,
        name,
        imageUrl: null,
        teamProviderId: sideId || homeId,
        jersey: num(player.shirtNumber) ?? num(player.number),
        starter: true,
        position: str(player.position) ?? str(slot.position),
        grid: null,
      });
    }
    for (const slot of asList<Json>(row.substitutes as Json[])) {
      const player = (slot.player as Json | undefined) ?? slot;
      const name = str(player.name);
      const pid = String(num(player.id) ?? name ?? "");
      if (!name) continue;
      lineups.push({
        providerId: pid,
        name,
        imageUrl: null,
        teamProviderId: sideId || homeId,
        jersey: num(player.shirtNumber) ?? num(player.number),
        starter: false,
        position: str(player.position) ?? str(slot.position),
        grid: null,
      });
    }
  }
  return { lineups, homeFormation, awayFormation };
}

function statusOf(value: string | null): DomainMatchStatus {
  switch (value) {
    case "IN_PLAY":
    case "PAUSED":
      return value === "PAUSED" ? "HALFTIME" : "LIVE";
    case "FINISHED":
    case "AWARDED":
      return "FINISHED";
    case "POSTPONED":
      return "POSTPONED";
    case "CANCELLED":
      return "CANCELLED";
    case "SUSPENDED":
      return "SUSPENDED";
    case "TIMED":
    case "SCHEDULED":
      return "SCHEDULED";
    default:
      return "UNKNOWN";
  }
}

function normalize(raw: Json): DomainFixture | null {
  const id = num(raw.id);
  const utc = str(raw.utcDate);
  const home = raw.homeTeam as Json | undefined;
  const away = raw.awayTeam as Json | undefined;
  const homeName = str(home?.name) ?? str(home?.shortName);
  const awayName = str(away?.name) ?? str(away?.shortName);
  if (id == null || !utc || !homeName || !awayName) return null;
  const score = raw.score as Json | undefined;
  const full = score?.fullTime as Json | undefined;
  const half = score?.halfTime as Json | undefined;
  const competition = raw.competition as Json | undefined;
  const season = raw.season as Json | undefined;
  const fixture: DomainFixture = {
    provider: "football-data",
    providerId: String(id),
    competitionProviderId: str(competition?.code) ?? String(num(competition?.id) ?? "football"),
    competitionName: str(competition?.name) ?? "Football",
    competitionImage: str(competition?.emblem),
    seasonProviderId: num(season?.id)?.toString() ?? null,
    seasonName: season?.startDate && season?.endDate ? `${season.startDate}/${season.endDate}` : null,
    round: num(raw.matchday) != null ? `Matchday ${raw.matchday}` : null,
    venue: null,
    kickoffAt: new Date(utc).toISOString(),
    status: statusOf(str(raw.status)),
    providerState: str(raw.status),
    minute: num(raw.minute),
    extraMinute: null,
    second: null,
    lengthMin: 90,
    home: { providerId: String(num(home?.id) ?? homeName), name: homeName, shortCode: str(home?.tla), imageUrl: str(home?.crest) },
    away: { providerId: String(num(away?.id) ?? awayName), name: awayName, shortCode: str(away?.tla), imageUrl: str(away?.crest) },
    homeScore: num(full?.home) ?? 0,
    awayScore: num(full?.away) ?? 0,
    htHomeScore: num(half?.home),
    htAwayScore: num(half?.away),
    events: [],
    lineups: [],
    statistics: [],
  };
  const extra = lineupsFrom(raw, fixture.home.providerId, fixture.away.providerId);
  fixture.lineups = extra.lineups;
  fixture.homeFormation = extra.homeFormation;
  fixture.awayFormation = extra.awayFormation;
  const refs = asList<Json>(raw.referees as Json[]).map((row) => ({
    name: str(row.name) ?? "",
    role: str(row.type)?.replace(/_/g, " ") ?? "Official",
  })).filter((row) => row.name);
  fixture.officials = refs;
  fixture.referee = refs.find((row) => /ref/i.test(row.role) && !/assistant|fourth/i.test(row.role))?.name ?? refs[0]?.name ?? null;
  fixture.venue = str(raw.venue) ?? fixture.venue;
  return fixture;
}

function headerInt(response: Response, name: string) {
  const raw = response.headers.get(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FootballDataProviderClient implements FootballDataProvider {
  readonly name = "football-data";
  private waitUntil = 0;

  constructor(private readonly token: string) {}

  private noteThrottle(response: Response) {
    const available = headerInt(response, "X-Requests-Available-Minute");
    const reset = headerInt(response, "X-RequestCounter-Reset");
    const retryAfter = headerInt(response, "Retry-After");
    if (available != null && available <= 1 && reset != null && reset > 0) {
      this.waitUntil = Math.max(this.waitUntil, Date.now() + reset * 1000);
      logger.info({ available, reset }, "football-data.org throttle");
    }
    if (retryAfter != null && retryAfter > 0) {
      this.waitUntil = Math.max(this.waitUntil, Date.now() + retryAfter * 1000);
    }
  }

  private async gate() {
    const wait = this.waitUntil - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 60_000));
  }

  private async read(path: string, attempt = 0): Promise<Json> {
    await this.gate();
    let response: Response;
    try {
      response = await fetch(`https://api.football-data.org/v4${path}`, {
        headers: { "X-Auth-Token": this.token, Accept: "application/json" },
      });
    } catch {
      throw new FootballProviderUnavailable();
    }
    this.noteThrottle(response);
    if (response.status === 429 && attempt < 2) {
      const retryAfter = headerInt(response, "Retry-After") ?? headerInt(response, "X-RequestCounter-Reset") ?? 12;
      await sleep(retryAfter * 1000);
      return this.read(path, attempt + 1);
    }
    if (!response.ok) throw new FootballProviderUnavailable(`football-data.org returned ${response.status}.`);
    return (await response.json()) as Json;
  }

  async getFixtures(query?: { from: Date; to: Date }) {
    const start = query?.from ?? new Date();
    const maxSpan = 10 * 24 * 60 * 60_000;
    const end = query?.to ?? new Date(start.getTime() + maxSpan);
    const to = new Date(Math.min(end.getTime(), start.getTime() + maxSpan));
    const from = start.toISOString().slice(0, 10);
    const until = to.toISOString().slice(0, 10);
    let body: Json;
    try {
      body = await this.read(`/matches?dateFrom=${from}&dateTo=${until}&competitions=${COMPETITIONS}`);
    } catch {
      body = await this.read(`/matches?dateFrom=${from}&dateTo=${until}&competitions=PL,PD,BL1,SA,FL1,CL,EL`);
    }
    const rows = Array.isArray(body.matches) ? (body.matches as Json[]) : [];
    return rows.map(normalize).filter((fixture): fixture is DomainFixture => fixture != null);
  }

  async getLiveFixtures() {
    const body = await this.read(`/matches?status=IN_PLAY,PAUSED&competitions=${COMPETITIONS}`);
    const rows = Array.isArray(body.matches) ? (body.matches as Json[]) : [];
    return rows.map(normalize).filter((fixture): fixture is DomainFixture => fixture != null && (fixture.status === "LIVE" || fixture.status === "HALFTIME"));
  }

  async getFixture(id: string) {
    const body = await this.read(`/matches/${id}`);
    const fixture = normalize(body);
    if (!fixture) throw new FootballProviderUnavailable("football-data.org fixture could not be read.");
    return fixture;
  }

  async getEvents(id: string) {
    return (await this.getFixture(id)).events;
  }
  async getLineups(id: string) {
    return (await this.getFixture(id)).lineups;
  }
  async getStatistics(id: string) {
    return (await this.getFixture(id)).statistics;
  }
}
