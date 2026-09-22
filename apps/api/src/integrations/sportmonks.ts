import {
  FootballProviderUnavailable,
  mapEventType,
  mapProviderState,
  type DomainEvent,
  type DomainFixture,
  type DomainPlayer,
  type DomainStat,
  type DomainTeam,
  type FootballDataProvider,
} from "@touchline/football-domain";
import { config } from "../config";
import { logger } from "../logger";

type Json = Record<string, unknown>;

function asList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function kickoff(raw: Json): string | null {
  const ts = num(raw.starting_at_timestamp);
  if (ts) return new Date(ts * 1000).toISOString();
  const text = str(raw.starting_at);
  if (!text) return null;
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function team(row: Json): DomainTeam | null {
  const id = num(row.id);
  const name = str(row.name);
  if (id == null || !name) return null;
  return {
    providerId: String(id),
    name,
    shortCode: str(row.short_code),
    imageUrl: str(row.image_path),
  };
}

function locationOf(row: Json): "home" | "away" | null {
  const meta = row.meta;
  if (!meta || typeof meta !== "object") return null;
  const location = str((meta as Json).location);
  return location === "home" || location === "away" ? location : null;
}

function goals(scores: Json[], participantId: number, description: string): number | null {
  const row = scores.find(
    (score) => num(score.participant_id) === participantId && str(score.description) === description,
  );
  if (!row) return null;
  const score = row.score;
  if (score && typeof score === "object") return num((score as Json).goals);
  return num(row.score);
}

export function normalizeFixture(raw: Json): DomainFixture | null {
  const id = num(raw.id);
  const when = kickoff(raw);
  if (id == null || !when) return null;
  const participants = asList<Json>(raw.participants as Json[]);
  const homeRow = participants.find((row) => locationOf(row) === "home");
  const awayRow = participants.find((row) => locationOf(row) === "away");
  const home = homeRow ? team(homeRow) : null;
  const away = awayRow ? team(awayRow) : null;
  if (!home || !away) return null;

  const league = (raw.league ?? {}) as Json;
  const season = raw.season as Json | undefined;
  const state = raw.state as Json | undefined;
  const venue = raw.venue as Json | undefined;
  const round = raw.round as Json | undefined;
  const scores = asList<Json>(raw.scores as Json[]);
  const homeId = Number(home.providerId);
  const awayId = Number(away.providerId);
  const periods = asList<Json>(raw.periods as Json[]);
  const ticking = periods.find((period) => period.ticking === true) ?? periods.at(-1);
  const stateName = str(state?.developer_name) ?? str(state?.state) ?? str(state?.short_name);

  const events: DomainEvent[] = [];
  for (const row of asList<Json>(raw.events as Json[])) {
    const eventId = num(row.id);
    const typeRow = row.type as Json | undefined;
    const type = mapEventType(str(typeRow?.developer_name) ?? str(row.developer_name));
    const minute = num(row.minute);
    if (eventId == null || !type || minute == null) continue;
    events.push({
      providerEventId: String(eventId),
      type,
      minute,
      extraMinute: num(row.extra_minute),
      teamProviderId: num(row.participant_id)?.toString() ?? null,
      playerName: str(row.player_name),
      relatedPlayerName: str(row.related_player_name),
      detail: str(row.addition) ?? str(row.info) ?? str(row.result),
    });
  }
  events.sort((a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0));

  const lineups: DomainPlayer[] = [];
  for (const row of asList<Json>(raw.lineups as Json[])) {
    const playerId = num(row.player_id);
    const name = str(row.player_name);
    if (playerId == null || !name) continue;
    lineups.push({
      providerId: String(playerId),
      name,
      imageUrl: null,
      teamProviderId: num(row.team_id)?.toString() ?? num(row.participant_id)?.toString() ?? null,
      jersey: num(row.jersey_number),
    });
  }

  const statistics: DomainStat[] = [];
  for (const row of asList<Json>(raw.statistics as Json[])) {
    const typeRow = row.type as Json | undefined;
    const name = str(typeRow?.developer_name) ?? str(row.type_id?.toString());
    if (!name) continue;
    const data = row.data as Json | undefined;
    statistics.push({
      teamProviderId: num(row.participant_id)?.toString() ?? null,
      name,
      value: num(data?.value) ?? num(row.value),
    });
  }

  return {
    provider: "sportmonks",
    providerId: String(id),
    competitionProviderId: String(num(raw.league_id) ?? num(league.id) ?? "unknown"),
    competitionName: str(league.name) ?? "Competition",
    competitionImage: str(league.image_path),
    seasonProviderId: num(raw.season_id)?.toString() ?? num(season?.id)?.toString() ?? null,
    seasonName: str(season?.name),
    round: str(round?.name),
    venue: str(venue?.name),
    kickoffAt: when,
    status: mapProviderState(stateName, num(raw.state_id)),
    providerState: stateName,
    minute: ticking ? num(ticking.minutes) : null,
    extraMinute: ticking ? num(ticking.extra_minute) ?? num(ticking.time_added) : null,
    second: ticking ? num(ticking.seconds) : null,
    lengthMin: num(raw.length),
    home,
    away,
    homeScore: goals(scores, homeId, "CURRENT") ?? 0,
    awayScore: goals(scores, awayId, "CURRENT") ?? 0,
    htHomeScore: goals(scores, homeId, "1ST_HALF"),
    htAwayScore: goals(scores, awayId, "1ST_HALF"),
    events,
    lineups,
    statistics,
  };
}

export class SportmonksProvider implements FootballDataProvider {
  readonly name = "sportmonks";

  constructor(
    private readonly token: string,
    private readonly base = config.sportmonksBase.replace(/\/$/, ""),
  ) {}

  private async get(path: string, query: Record<string, string> = {}): Promise<Json> {
    const url = path.startsWith("http") ? new URL(path) : new URL(`${this.base}${path}`);
    url.searchParams.set("api_token", this.token);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      logger.warn({ path, err: error instanceof Error ? error.message : "fetch failed" }, "sportmonks unreachable");
      throw new FootballProviderUnavailable();
    }
    if (response.status === 429 || response.status >= 500) {
      logger.warn({ path, status: response.status }, "sportmonks unavailable");
      throw new FootballProviderUnavailable();
    }
    if (!response.ok) {
      logger.warn({ path, status: response.status }, "sportmonks request failed");
      throw new FootballProviderUnavailable(`Football provider returned ${response.status}.`);
    }
    return (await response.json()) as Json;
  }

  private async pages(path: string, query: Record<string, string>): Promise<DomainFixture[]> {
    const fixtures: DomainFixture[] = [];
    let next: string | null = path;
    let guard = 0;
    while (next && guard < 4) {
      guard += 1;
      const body = await this.get(next, next === path ? query : {});
      for (const row of asList<Json>(body.data as Json[])) {
        const fixture = normalizeFixture(row);
        if (fixture) fixtures.push(fixture);
      }
      const pagination = body.pagination as Json | undefined;
      const more = pagination?.has_more === true;
      next = more ? str(pagination?.next_page) : null;
    }
    return fixtures;
  }

  async getFixtures(query?: { from: Date; to: Date; leagueIds?: string[] }): Promise<DomainFixture[]> {
    const from = query?.from ?? new Date();
    const to = query?.to ?? new Date(from.getTime() + 10 * 24 * 60 * 60_000);
    const leagues = query?.leagueIds ?? config.leagueIds;
    const fixtures: DomainFixture[] = [];
    const include = "participants;scores;state;league;season;round;venue;periods";
    for (const leagueId of leagues) {
      let next: string | null = "/fixtures";
      let guard = 0;
      while (next && guard < 6) {
        guard += 1;
        const first = next === "/fixtures";
        const body = await this.get(
          next,
          first
            ? { include, filters: `fixtureLeagues:${leagueId}`, sortBy: "starting_at", order: "desc", per_page: "50" }
            : {},
        );
        let oldest = Number.POSITIVE_INFINITY;
        for (const row of asList<Json>(body.data as Json[])) {
          const fixture = normalizeFixture(row);
          if (!fixture) continue;
          const kick = new Date(fixture.kickoffAt).getTime();
          if (kick < oldest) oldest = kick;
          if (kick >= from.getTime() && kick <= to.getTime()) fixtures.push(fixture);
        }
        if (oldest < from.getTime()) break;
        const pagination = body.pagination as Json | undefined;
        next = pagination?.has_more === true ? str(pagination?.next_page) : null;
      }
    }
    return fixtures;
  }

  async getLiveFixtures(leagueIds?: string[]): Promise<DomainFixture[]> {
    const leagues = (leagueIds ?? config.leagueIds).join(",");
    const body = await this.get("/livescores/inplay", {
      include: "participants;scores;events.type;state;league;season;round;venue;periods;statistics.type;lineups",
      filters: `fixtureLeagues:${leagues}`,
    });
    return asList<Json>(body.data as Json[])
      .map(normalizeFixture)
      .filter((fixture): fixture is DomainFixture => fixture != null);
  }

  async getFixture(id: string): Promise<DomainFixture> {
    const body = await this.get(`/fixtures/${id}`, {
      include: "participants;scores;events.type;state;league;season;round;venue;periods;statistics.type;lineups",
    });
    const row = (body.data ?? body) as Json;
    const fixture = normalizeFixture(row);
    if (!fixture) throw new FootballProviderUnavailable("Fixture payload could not be read.");
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

export function footballProvider(): FootballDataProvider {
  if (!config.sportmonksToken) {
    return {
      name: "unconfigured",
      async getFixtures() {
        throw new FootballProviderUnavailable();
      },
      async getFixture() {
        throw new FootballProviderUnavailable();
      },
      async getLiveFixtures() {
        throw new FootballProviderUnavailable();
      },
      async getEvents() {
        throw new FootballProviderUnavailable();
      },
      async getLineups() {
        throw new FootballProviderUnavailable();
      },
      async getStatistics() {
        throw new FootballProviderUnavailable();
      },
    };
  }
  return new SportmonksProvider(config.sportmonksToken);
}
