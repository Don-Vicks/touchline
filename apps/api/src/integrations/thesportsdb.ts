import { FootballProviderUnavailable, mapProviderState, type DomainFixture, type FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";
import { currentSoccerSeason } from "./leagues";

type Json = Record<string, unknown>;

const LEAGUES = [
  { id: "4328", name: "English Premier League" },
  { id: "4329", name: "English League Championship" },
  { id: "4330", name: "Scottish Premier League" },
  { id: "4335", name: "Spanish La Liga" },
  { id: "4332", name: "Italian Serie A" },
  { id: "4334", name: "French Ligue 1" },
  { id: "4331", name: "German Bundesliga" },
  { id: "4337", name: "Dutch Eredivisie" },
  { id: "4344", name: "Portuguese Primeira Liga" },
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
    referee: str(raw.strOfficial),
    officials: str(raw.strOfficial) ? [{ name: str(raw.strOfficial) as string, role: "Referee" }] : [],
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
    const season = currentSoccerSeason();
    const fixtures: DomainFixture[] = [];
    const seen = new Set<string>();
    for (const league of LEAGUES) {
      const paths = [`eventsnextleague.php?id=${league.id}`, `eventspastleague.php?id=${league.id}`];
      if (league.id === "4328" || league.id === "4329" || league.id === "4480") paths.push(`eventsseason.php?id=${league.id}&s=${season}`);
      for (const path of paths) {
        let body: Json;
        try {
          body = await read(path);
        } catch {
          continue;
        }
        const rows = Array.isArray(body.events) ? (body.events as Json[]) : [];
        for (const row of rows) {
          const fixture = normalizeSportsDb(row);
          if (!fixture || seen.has(fixture.providerId)) continue;
          const kick = new Date(fixture.kickoffAt).getTime();
          if (kick >= from && kick <= to) {
            seen.add(fixture.providerId);
            fixtures.push(fixture);
          }
        }
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
    try {
      const lineupBody = await read(`lookuplineup.php?id=${id}`);
      const rows = Array.isArray(lineupBody.lineup) ? (lineupBody.lineup as Record<string, unknown>[]) : [];
      fixture.lineups = rows
        .map((entry) => {
          const name = typeof entry.strPlayer === "string" ? entry.strPlayer : null;
          if (!name) return null;
          const home = String(entry.strHome ?? "") === "Yes" || String(entry.strHome ?? "") === "1";
          const jersey = Number(entry.intSquadNumber);
          return {
            providerId: String(entry.idPlayer ?? name),
            name,
            imageUrl: typeof entry.strCutout === "string" ? entry.strCutout : null,
            teamProviderId: home ? fixture.home.providerId : fixture.away.providerId,
            jersey: Number.isFinite(jersey) ? jersey : null,
            starter: true,
            position: typeof entry.strPosition === "string" ? entry.strPosition : null,
            grid: null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
    } catch {
      /* lineup optional */
    }
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
