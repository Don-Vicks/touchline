import { formatClock, type DomainMatchStatus } from "@touchline/football-domain";

type Team = { id: string; name: string; shortCode: string | null; imageUrl: string | null };
type MatchRow = {
  id: string;
  status: string;
  minute: number | null;
  extraMinute: number | null;
  second: number | null;
  kickoffAt: Date;
  venue: string | null;
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
  imageUrl: row.imageUrl,
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
    kickoffAt: match.kickoffAt.toISOString(),
    venue: match.venue,
    round: match.round,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    htHomeScore: match.htHomeScore,
    htAwayScore: match.htAwayScore,
    competition: match.competition,
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
}) {
  const tradable = Boolean(market.pantaMarketId) && !market.disabled && (market.status === "OPEN" || market.status === "TRADING");
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
    failureReason: tradable ? null : market.failureReason,
    tradable,
    sourceEventId: market.sourceEventId ?? null,
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
