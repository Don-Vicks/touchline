import { FootballProviderUnavailable, mapProviderState, type DomainFixture, type FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";

type Json = Record<string, unknown>;

const LEAGUES = [
  { id: "4328", name: "English Premier League" },
  { id: "4335", name: "Spanish La Liga" },
  { id: "4332", name: "Italian Serie A" },
  { id: "4334", name: "French Ligue 1" },
  { id: "4331", name: "German Bundesliga" },
  { id: "4480", name: "UEFA Champions League" },
  { id: "4481", name: "UEFA Europa League" },
];

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

function kickoff(raw: Json) {
  const stamp = str(raw.strTimestamp);
  if (stamp) {
    const date = new Date(stamp.includes("T") ? stamp : stamp.replace(" ", "T") + "Z");
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const day = str(raw.dateEvent);
  const time = str(raw.strTime) ?? "15:00:00";
  if (!day) return null;
  const date = new Date(`${day}T${time}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeSportsDb(raw: Json): DomainFixture | null {
  if (str(raw.strSport) && str(raw.strSport) !== "Soccer") return null;
  const id = str(raw.idEvent);
  const when = kickoff(raw);
  const home = str(raw.strHomeTeam);
  const away = str(raw.strAwayTeam);
  if (!id || !when || !home || !away) return null;
  const status = mapProviderState(str(raw.strStatus));
  return {
    provider: "thesportsdb",
    providerId: id,
    competitionProviderId: str(raw.idLeague) ?? "4328",
    competitionName: str(raw.strLeague) ?? "Football",
    competitionImage: str(raw.strLeagueBadge),
    seasonProviderId: null,
    seasonName: str(raw.strSeason),
    round: str(raw.intRound),
    venue: str(raw.strVenue),
    kickoffAt: when,
    status: status === "UNKNOWN" ? "SCHEDULED" : status,
    providerState: str(raw.strStatus),
    minute: null,
    extraMinute: null,
    second: null,
    lengthMin: 90,
    home: {
      providerId: str(raw.idHomeTeam) ?? home,
      name: home,
      shortCode: null,
      imageUrl: str(raw.strHomeTeamBadge),
    },
    away: {
      providerId: str(raw.idAwayTeam) ?? away,
      name: away,
      shortCode: null,
      imageUrl: str(raw.strAwayTeamBadge),
    },
    homeScore: num(raw.intHomeScore) ?? 0,
    awayScore: num(raw.intAwayScore) ?? 0,
    htHomeScore: null,
    htAwayScore: null,
    events: [],
    lineups: [],
    statistics: [],
  };
}

async function read(path: string): Promise<Json> {
  const url = `https://www.thesportsdb.com/api/v1/json/${config.thesportsdbKey}/${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new FootballProviderUnavailable();
  }
  if (!response.ok) throw new FootballProviderUnavailable(`TheSportsDB returned ${response.status}.`);
  return (await response.json()) as Json;
}

export class TheSportsDbProvider implements FootballDataProvider {
  readonly name = "thesportsdb";

  async getFixtures(query?: { from: Date; to: Date }): Promise<DomainFixture[]> {
    const from = query?.from?.getTime() ?? Date.now() - 2 * 24 * 60 * 60_000;
    const to = query?.to?.getTime() ?? Date.now() + 21 * 24 * 60 * 60_000;
    const fixtures: DomainFixture[] = [];
    for (const league of LEAGUES) {
      const body = await read(`eventsnextleague.php?id=${league.id}`);
      const rows = Array.isArray(body.events) ? (body.events as Json[]) : [];
      for (const row of rows) {
        const fixture = normalizeSportsDb(row);
        if (!fixture) continue;
        const kick = new Date(fixture.kickoffAt).getTime();
        if (kick >= from && kick <= to) fixtures.push(fixture);
      }
    }
    return fixtures;
  }

  async getLiveFixtures() {
    const body = await read("livescore.php?s=Soccer");
    const rows = Array.isArray(body.events) ? (body.events as Json[]) : [];
    return rows.map(normalizeSportsDb).filter((fixture): fixture is DomainFixture => fixture != null && (fixture.status === "LIVE" || fixture.status === "HALFTIME"));
  }

  async getFixture(id: string) {
    const body = await read(`lookupevent.php?id=${id}`);
    const row = Array.isArray(body.events) ? (body.events as Json[])[0] : null;
    const fixture = row ? normalizeSportsDb(row) : null;
    if (!fixture) throw new FootballProviderUnavailable("TheSportsDB fixture could not be read.");
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
