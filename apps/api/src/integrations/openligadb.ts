import { FootballProviderUnavailable, type DomainEvent, type DomainFixture, type DomainMatchStatus, type FootballDataProvider } from "@touchline/football-domain";

type Json = Record<string, unknown>;

const LEAGUES = ["bl1"];

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function euOffset(day: string) {
  const year = Number(day.slice(0, 4));
  const lastSunday = (month: number) => {
    const date = new Date(Date.UTC(year, month + 1, 0));
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  };
  const summerStart = lastSunday(2);
  const summerEnd = lastSunday(9);
  return day >= summerStart && day < summerEnd ? "+02:00" : "+01:00";
}

function kickoff(raw: string | null) {
  if (!raw) return null;
  if (raw.endsWith("Z") || /[+-]\d\d:\d\d$/.test(raw)) return new Date(raw).toISOString();
  const local = raw.replace(" ", "T").slice(0, 19);
  const date = new Date(`${local}${euOffset(local.slice(0, 10))}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeOpenLiga(raw: Json): DomainFixture | null {
  const id = num(raw.matchID);
  const when = kickoff(str(raw.matchDateTime));
  const home = raw.team1 as Json | undefined;
  const away = raw.team2 as Json | undefined;
  const homeName = str(home?.teamName);
  const awayName = str(away?.teamName);
  if (id == null || !when || !homeName || !awayName) return null;
  const results = asList<Json>(raw.matchResults as Json[]);
  const full = results.find((row) => num(row.resultTypeID) === 2) ?? results.at(-1);
  const half = results.find((row) => num(row.resultTypeID) === 1);
  const finished = raw.matchIsFinished === true;
  const kick = new Date(when).getTime();
  const now = Date.now();
  let status: DomainMatchStatus = "SCHEDULED";
  if (finished) status = "FINISHED";
  else if (kick <= now && now - kick < 3 * 60 * 60_000) status = "LIVE";
  const goals = asList<Json>(raw.goals as Json[]).slice().sort((a, b) => (num(a.matchMinute) ?? 0) - (num(b.matchMinute) ?? 0));
  let prevHome = 0;
  let prevAway = 0;
  const events: DomainEvent[] = goals.map((goal) => {
    const own = goal.isOwnGoal === true;
    const penalty = goal.isPenalty === true;
    const homeGoals = num(goal.scoreTeam1) ?? prevHome;
    const awayGoals = num(goal.scoreTeam2) ?? prevAway;
    const teamId = homeGoals > prevHome ? num(home?.teamId) : awayGoals > prevAway ? num(away?.teamId) : null;
    prevHome = homeGoals;
    prevAway = awayGoals;
    return {
      providerEventId: `olg-${num(goal.goalID) ?? `${id}-${goal.matchMinute}`}`,
      type: own ? "OWN_GOAL" : penalty ? "PENALTY" : "GOAL",
      minute: num(goal.matchMinute) ?? 0,
      extraMinute: null,
      teamProviderId: teamId == null ? null : String(teamId),
      playerName: str(goal.goalGetterName),
      relatedPlayerName: null,
      detail: null,
    };
  });
  const group = raw.group as Json | undefined;
  const location = raw.location as Json | undefined;
  return {
    provider: "openligadb",
    providerId: String(id),
    competitionProviderId: str(raw.leagueShortcut) ?? "bl1",
    competitionName: str(raw.leagueName) ?? "Bundesliga",
    competitionImage: null,
    seasonProviderId: null,
    seasonName: null,
    round: str(group?.groupName),
    venue: str(location?.locationStadium),
    kickoffAt: when,
    status,
    providerState: finished ? "FT" : status,
    minute: status === "FINISHED" ? 90 : null,
    extraMinute: null,
    second: null,
    lengthMin: 90,
    home: {
      providerId: String(num(home?.teamId) ?? homeName),
      name: homeName,
      shortCode: str(home?.shortName),
      imageUrl: str(home?.teamIconUrl),
    },
    away: {
      providerId: String(num(away?.teamId) ?? awayName),
      name: awayName,
      shortCode: str(away?.shortName),
      imageUrl: str(away?.teamIconUrl),
    },
    homeScore: num(full?.pointsTeam1) ?? 0,
    awayScore: num(full?.pointsTeam2) ?? 0,
    htHomeScore: num(half?.pointsTeam1),
    htAwayScore: num(half?.pointsTeam2),
    events,
    lineups: [],
    statistics: [],
  };
}

async function read(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new FootballProviderUnavailable();
  }
  if (response.status === 429 || response.status >= 500) throw new FootballProviderUnavailable();
  if (!response.ok) throw new FootballProviderUnavailable(`OpenLigaDB returned ${response.status}.`);
  return response.json();
}

export class OpenLigaDbProvider implements FootballDataProvider {
  readonly name = "openligadb";

  async getFixtures(query?: { from: Date; to: Date }): Promise<DomainFixture[]> {
    const from = query?.from ?? new Date(Date.now() - 8 * 24 * 60 * 60_000);
    const to = query?.to ?? new Date(Date.now() + 21 * 24 * 60 * 60_000);
    const year = from.getUTCFullYear();
    const fixtures: DomainFixture[] = [];
    for (const league of LEAGUES) {
      const body = await read(`https://api.openligadb.de/getmatchdata/${league}/${year}`);
      for (const row of asList<Json>(body as Json[])) {
        const fixture = normalizeOpenLiga(row);
        if (!fixture) continue;
        const kick = new Date(fixture.kickoffAt).getTime();
        if (kick >= from.getTime() && kick <= to.getTime()) fixtures.push(fixture);
      }
    }
    return fixtures;
  }

  async getLiveFixtures() {
    const now = new Date();
    const fixtures = await this.getFixtures({ from: new Date(now.getTime() - 4 * 60 * 60_000), to: new Date(now.getTime() + 3 * 60 * 60_000) });
    return fixtures.filter((fixture) => fixture.status === "LIVE" || fixture.status === "HALFTIME");
  }

  async getFixture(id: string) {
    const body = await read(`https://api.openligadb.de/getmatchdata/${id}`);
    const row = asList<Json>(body as Json[])[0];
    const fixture = row ? normalizeOpenLiga(row) : null;
    if (!fixture) throw new FootballProviderUnavailable("OpenLigaDB fixture could not be read.");
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
