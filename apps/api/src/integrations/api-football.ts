import { FootballProviderUnavailable, type DomainFixture, type DomainMatchStatus, type FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";

type Json = Record<string, unknown>;

const LEAGUES = [
  { id: 39, season: 2026, name: "English Premier League" },
  { id: 140, season: 2026, name: "Spanish La Liga" },
  { id: 78, season: 2026, name: "German Bundesliga" },
  { id: 135, season: 2026, name: "Italian Serie A" },
  { id: 61, season: 2026, name: "French Ligue 1" },
  { id: 2, season: 2026, name: "UEFA Champions League" },
];

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusOf(short: string | null): DomainMatchStatus {
  switch (short) {
    case "1H":
    case "2H":
    case "ET":
    case "LIVE":
    case "P":
      return "LIVE";
    case "HT":
    case "BT":
      return "HALFTIME";
    case "FT":
    case "AET":
    case "PEN":
      return "FINISHED";
    case "PST":
      return "POSTPONED";
    case "CANC":
    case "ABD":
      return "CANCELLED";
    case "NS":
    case "TBD":
      return "SCHEDULED";
    default:
      return "UNKNOWN";
  }
}

function normalize(raw: Json): DomainFixture | null {
  const fixture = raw.fixture as Json | undefined;
  const teams = raw.teams as Json | undefined;
  const goals = raw.goals as Json | undefined;
  const league = raw.league as Json | undefined;
  const id = num(fixture?.id);
  const when = str(fixture?.date);
  const home = teams?.home as Json | undefined;
  const away = teams?.away as Json | undefined;
  const homeName = str(home?.name);
  const awayName = str(away?.name);
  if (id == null || !when || !homeName || !awayName) return null;
  const state = fixture?.status as Json | undefined;
  const score = raw.score as Json | undefined;
  const half = score?.halftime as Json | undefined;
  return {
    provider: "api-football",
    providerId: String(id),
    competitionProviderId: String(num(league?.id) ?? "football"),
    competitionName: str(league?.name) ?? "Football",
    competitionImage: str(league?.logo),
    seasonProviderId: num(league?.season)?.toString() ?? null,
    seasonName: num(league?.season)?.toString() ?? null,
    round: str(league?.round),
    venue: str((fixture?.venue as Json | undefined)?.name),
    kickoffAt: new Date(when).toISOString(),
    status: statusOf(str(state?.short)),
    providerState: str(state?.short),
    minute: num(state?.elapsed),
    extraMinute: null,
    second: null,
    lengthMin: 90,
    home: { providerId: String(num(home?.id) ?? homeName), name: homeName, shortCode: null, imageUrl: str(home?.logo) },
    away: { providerId: String(num(away?.id) ?? awayName), name: awayName, shortCode: null, imageUrl: str(away?.logo) },
    homeScore: num(goals?.home) ?? 0,
    awayScore: num(goals?.away) ?? 0,
    htHomeScore: num(half?.home),
    htAwayScore: num(half?.away),
    events: [],
    lineups: [],
    statistics: [],
  };
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly name = "api-football";

  constructor(private readonly key: string) {}

  private async read(path: string): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(`https://v3.football.api-sports.io${path}`, {
        headers: { "x-apisports-key": this.key, Accept: "application/json" },
      });
    } catch {
      throw new FootballProviderUnavailable();
    }
    if (!response.ok) throw new FootballProviderUnavailable(`API-Football returned ${response.status}.`);
    return (await response.json()) as Json;
  }

  async getFixtures(query?: { from: Date; to: Date }) {
    const from = (query?.from ?? new Date()).toISOString().slice(0, 10);
    const to = (query?.to ?? new Date(Date.now() + 21 * 24 * 60 * 60_000)).toISOString().slice(0, 10);
    const fixtures: DomainFixture[] = [];
    for (const league of LEAGUES) {
      const body = await this.read(`/fixtures?league=${league.id}&season=${league.season}&from=${from}&to=${to}`);
      const rows = Array.isArray(body.response) ? (body.response as Json[]) : [];
      for (const row of rows) {
        const fixture = normalize(row);
        if (fixture) fixtures.push(fixture);
      }
    }
    return fixtures;
  }

  async getLiveFixtures() {
    const body = await this.read("/fixtures?live=all");
    const rows = Array.isArray(body.response) ? (body.response as Json[]) : [];
    return rows
      .map(normalize)
      .filter((fixture): fixture is DomainFixture => fixture != null && LEAGUES.some((league) => fixture.competitionProviderId === String(league.id)));
  }

  async getFixture(id: string) {
    const body = await this.read(`/fixtures?id=${id}`);
    const row = Array.isArray(body.response) ? (body.response as Json[])[0] : null;
    const fixture = row ? normalize(row) : null;
    if (!fixture) throw new FootballProviderUnavailable("API-Football fixture could not be read.");
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
