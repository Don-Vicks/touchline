import { FootballProviderUnavailable, type DomainFixture, type DomainMatchStatus, type FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";

type Json = Record<string, unknown>;

const COMPETITIONS = "PL,PD,BL1,SA,FL1,CL,EL";

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  return {
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
}

export class FootballDataProviderClient implements FootballDataProvider {
  readonly name = "football-data";

  constructor(private readonly token: string) {}

  private async read(path: string): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(`https://api.football-data.org/v4${path}`, {
        headers: { "X-Auth-Token": this.token, Accept: "application/json" },
      });
    } catch {
      throw new FootballProviderUnavailable();
    }
    if (!response.ok) throw new FootballProviderUnavailable(`football-data.org returned ${response.status}.`);
    return (await response.json()) as Json;
  }

  async getFixtures(query?: { from: Date; to: Date }) {
    const from = (query?.from ?? new Date()).toISOString().slice(0, 10);
    const to = (query?.to ?? new Date(Date.now() + 21 * 24 * 60 * 60_000)).toISOString().slice(0, 10);
    const body = await this.read(`/matches?dateFrom=${from}&dateTo=${to}&competitions=${COMPETITIONS}`);
    const rows = Array.isArray(body.matches) ? (body.matches as Json[]) : [];
    return rows.map(normalize).filter((fixture): fixture is DomainFixture => fixture != null);
  }

  async getLiveFixtures() {
    const fixtures = await this.getFixtures({ from: new Date(Date.now() - 6 * 60 * 60_000), to: new Date(Date.now() + 6 * 60 * 60_000) });
    return fixtures.filter((fixture) => fixture.status === "LIVE" || fixture.status === "HALFTIME");
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
