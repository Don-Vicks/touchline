export type DomainMatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "HALFTIME"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "SUSPENDED"
  | "UNKNOWN";

export type FootballEventType =
  | "KICKOFF"
  | "HALFTIME"
  | "FULLTIME"
  | "GOAL"
  | "OWN_GOAL"
  | "PENALTY"
  | "MISSED_PENALTY"
  | "YELLOW_CARD"
  | "SECOND_YELLOW"
  | "RED_CARD"
  | "SUBSTITUTION"
  | "CORNER"
  | "SHOT"
  | "SHOT_ON_TARGET"
  | "VAR"
  | "FOUL";

export interface DomainTeam {
  providerId: string;
  name: string;
  shortCode: string | null;
  imageUrl: string | null;
}

export interface DomainPlayer {
  providerId: string;
  name: string;
  imageUrl: string | null;
  teamProviderId: string | null;
  jersey: number | null;
  starter?: boolean;
  position?: string | null;
  grid?: string | null;
}

export interface DomainBroadcast {
  name: string;
  type: string | null;
  url: string | null;
}

export interface DomainVideo {
  kind: "HIGHLIGHT" | "LIVE";
  title: string;
  url: string;
  provider: string;
  externalId: string | null;
  channelTitle?: string | null;
}

export interface DomainEvent {
  providerEventId: string;
  type: FootballEventType;
  minute: number;
  extraMinute: number | null;
  teamProviderId: string | null;
  playerName: string | null;
  relatedPlayerName: string | null;
  detail: string | null;
}

export interface DomainStat {
  teamProviderId: string | null;
  name: string;
  value: number | null;
}

export interface DomainFixture {
  provider: string;
  providerId: string;
  competitionProviderId: string;
  competitionName: string;
  competitionImage: string | null;
  seasonProviderId: string | null;
  seasonName: string | null;
  round: string | null;
  venue: string | null;
  venueCity?: string | null;
  referee?: string | null;
  officials?: { name: string; role: string }[];
  attendance?: number | null;
  kickoffAt: string;
  status: DomainMatchStatus;
  providerState: string | null;
  minute: number | null;
  extraMinute: number | null;
  second: number | null;
  lengthMin: number | null;
  home: DomainTeam;
  away: DomainTeam;
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  events: DomainEvent[];
  lineups: DomainPlayer[];
  statistics: DomainStat[];
  broadcasts?: DomainBroadcast[];
  videos?: DomainVideo[];
  homeFormation?: string | null;
  awayFormation?: string | null;
}

export interface FootballDataProvider {
  readonly name: string;
  getFixtures(query?: { from: Date; to: Date; leagueIds?: string[] }): Promise<DomainFixture[]>;
  getFixture(id: string): Promise<DomainFixture>;
  getLiveFixtures(leagueIds?: string[]): Promise<DomainFixture[]>;
  getEvents(id: string): Promise<DomainEvent[]>;
  getLineups(id: string): Promise<DomainPlayer[]>;
  getStatistics(id: string): Promise<DomainStat[]>;
}

export class FootballProviderUnavailable extends Error {
  constructor(message = "Live data temporarily unavailable.") {
    super(message);
    this.name = "FootballProviderUnavailable";
  }
}

const STATE_BY_NAME: Record<string, DomainMatchStatus> = {
  NS: "SCHEDULED",
  TBA: "SCHEDULED",
  PENDING: "SCHEDULED",
  AWAITING_UPDATES: "SCHEDULED",
  LIVE: "LIVE",
  INPLAY_1ST_HALF: "LIVE",
  INPLAY_2ND_HALF: "LIVE",
  INPLAY_ET: "LIVE",
  INPLAY_ET_2ND_HALF: "LIVE",
  INPLAY_PENALTIES: "LIVE",
  HT: "HALFTIME",
  BREAK: "HALFTIME",
  EXTRA_TIME_BREAK: "HALFTIME",
  PEN_BREAK: "HALFTIME",
  FT: "FINISHED",
  AET: "FINISHED",
  FT_PEN: "FINISHED",
  AWARDED: "FINISHED",
  WO: "FINISHED",
  POSTPONED: "POSTPONED",
  DELAYED: "POSTPONED",
  CANCELLED: "CANCELLED",
  ABANDONED: "CANCELLED",
  DELETED: "CANCELLED",
  SUSPENDED: "SUSPENDED",
  INTERRUPTED: "SUSPENDED",
};

const STATE_BY_ID: Record<number, DomainMatchStatus> = {
  1: "SCHEDULED",
  2: "LIVE",
  3: "HALFTIME",
  4: "HALFTIME",
  5: "FINISHED",
  6: "LIVE",
  7: "FINISHED",
  8: "FINISHED",
  9: "LIVE",
  10: "POSTPONED",
  11: "SUSPENDED",
  12: "CANCELLED",
  13: "SCHEDULED",
  16: "POSTPONED",
  17: "FINISHED",
  18: "SUSPENDED",
  21: "HALFTIME",
  22: "LIVE",
  25: "HALFTIME",
  26: "SCHEDULED",
};

export function mapProviderState(name: string | null | undefined, stateId?: number | null): DomainMatchStatus {
  if (name) {
    const mapped = STATE_BY_NAME[name.toUpperCase()];
    if (mapped) return mapped;
  }
  if (stateId != null && STATE_BY_ID[stateId]) return STATE_BY_ID[stateId];
  return "UNKNOWN";
}

const EVENT_BY_NAME: Record<string, FootballEventType> = {
  GOAL: "GOAL",
  OWNGOAL: "OWN_GOAL",
  OWN_GOAL: "OWN_GOAL",
  PENALTY: "PENALTY",
  PENALTY_GOAL: "PENALTY",
  MISSED_PENALTY: "MISSED_PENALTY",
  MISSEDPENALTY: "MISSED_PENALTY",
  YELLOWCARD: "YELLOW_CARD",
  YELLOW_CARD: "YELLOW_CARD",
  YELLOWREDCARD: "SECOND_YELLOW",
  YELLOWRED: "SECOND_YELLOW",
  REDCARD: "RED_CARD",
  RED_CARD: "RED_CARD",
  SUBSTITUTION: "SUBSTITUTION",
  CORNER: "CORNER",
  SHOT: "SHOT",
  SHOT_OFF_TARGET: "SHOT",
  SHOT_ON_TARGET: "SHOT_ON_TARGET",
  SHOTONTARGET: "SHOT_ON_TARGET",
  VAR: "VAR",
  VAR_CARD: "VAR",
  FOUL: "FOUL",
};

export function mapEventType(developerName: string | null | undefined): FootballEventType | null {
  if (!developerName) return null;
  const key = developerName.toUpperCase().replace(/[\s-]+/g, "_");
  return EVENT_BY_NAME[key] ?? EVENT_BY_NAME[key.replace(/_/g, "")] ?? null;
}

export function formatClock(minute: number | null, extra: number | null, status: DomainMatchStatus): string {
  if (status === "HALFTIME") return "HT";
  if (status === "FINISHED") return "FT";
  if (status === "SCHEDULED" || minute == null) return "—";
  if (extra && extra > 0) return `${minute}+${extra}`;
  return `${minute}'`;
}

export function scoringSide(
  type: FootballEventType,
  teamProviderId: string | null,
  homeId: string,
  awayId: string,
): "home" | "away" | null {
  if (!teamProviderId) return null;
  const own = type === "OWN_GOAL";
  const isGoal = type === "GOAL" || type === "PENALTY" || own;
  if (!isGoal) return null;
  const byHome = teamProviderId === homeId;
  const byAway = teamProviderId === awayId;
  if (!byHome && !byAway) return null;
  if (own) return byHome ? "away" : "home";
  return byHome ? "home" : "away";
}
