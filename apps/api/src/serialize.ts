import { formatClock, type DomainMatchStatus } from "@touchline/football-domain";
import { displayCompetition, flagUrl, soccerCrestUrl } from "./integrations/leagues";

type Team = { id: string; name: string; shortCode: string | null; imageUrl: string | null; providerId?: string };
type MatchRow = {
  id: string;
  status: string;
  minute: number | null;
  extraMinute: number | null;
  second: number | null;
  kickoffAt: Date;
  venue: string | null;
  venueCity?: string | null;
  referee?: string | null;
  officials?: unknown;
  attendance?: number | null;
  round: string | null;
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  competition: { id: string; name: string; imageUrl: string | null };
  homeTeam: Team;
  awayTeam: Team;
  matchroom?: { id: string } | null;
};

const team = (row: Team) => ({
  id: row.id,
  name: row.name,
  shortCode: row.shortCode,
  imageUrl: row.imageUrl ?? soccerCrestUrl(row.providerId) ?? flagUrl(row.shortCode),
});

export function matchJson(match: MatchRow, watching = 0) {
  const status = match.status as DomainMatchStatus;
  return {
    id: match.id,
    status: match.status,
    minute: match.minute,
    extraMinute: match.extraMinute,
    second: match.second,
    clock: formatClock(match.minute, match.extraMinute, status),
    kickoffAt: (match.kickoffAt instanceof Date ? match.kickoffAt : new Date(match.kickoffAt)).toISOString(),
    venue: match.venue,
    venueCity: match.venueCity ?? null,
    referee: match.referee ?? null,
    officials: Array.isArray(match.officials) ? match.officials : [],
    attendance: match.attendance ?? null,
    round: match.round,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    htHomeScore: match.htHomeScore,
    htAwayScore: match.htAwayScore,
    competition: { ...match.competition, name: displayCompetition(match.competition.name) },
    home: team(match.homeTeam),
    away: team(match.awayTeam),
    watching,
    matchroomId: match.matchroom?.id ?? null,
  };
}

export function marketJson(market: {
  id: string;
  matchId: string;
  question: string;
  category: string;
  status: string;
  marketType: string;
  yesPrice: { toString(): string } | null;
  noPrice: { toString(): string } | null;
  outcome: string | null;
  evidence: string | null;
  pantaMarketId: string | null;
  endTime: Date;
  failureReason: string | null;
  disabled: boolean;
  sourceEventId?: string | null;
  resolutionRule?: string;
  yesCalls?: number;
  noCalls?: number;
  mySide?: string | null;
  squadYes?: number;
  squadNo?: number;
}) {
  const tradable = Boolean(market.pantaMarketId) && !market.disabled && (market.status === "OPEN" || market.status === "TRADING");
  const xpOnly =
    !market.pantaMarketId &&
    !market.disabled &&
    (market.status === "PENDING" || market.status === "OPEN" || market.status === "TRADING" || market.status === "AWAITING_SIGNATURE") &&
    !market.outcome;
  return {
    id: market.id,
    matchId: market.matchId,
    question: market.question,
    category: market.category,
    status: market.status,
    marketType: market.marketType,
    yesPrice: market.yesPrice?.toString() ?? null,
    noPrice: market.noPrice?.toString() ?? null,
    outcome: market.outcome,
    evidence: market.evidence,
    pantaMarketId: market.pantaMarketId,
    closesAt: market.endTime.toISOString(),
    failureReason: tradable || xpOnly ? null : market.failureReason,
    tradable,
    xpOnly,
    sourceEventId: market.sourceEventId ?? null,
    resolutionRule: market.resolutionRule ?? null,
    yesCalls: market.yesCalls ?? 0,
    noCalls: market.noCalls ?? 0,
    mySide: market.mySide ?? null,
    squadYes: market.squadYes ?? 0,
    squadNo: market.squadNo ?? 0,
  };
}

export const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  xp: true,
  streak: true,
  bio: true,
} as const;
