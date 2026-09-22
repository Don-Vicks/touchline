export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "HALFTIME"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "SUSPENDED"
  | "UNKNOWN";

export type MarketCategory = "PRE_MATCH" | "PLAYER" | "MATCH_EVENT" | "LIVE";

export type MarketPhase = "pending" | "open" | "trading" | "resolved" | "cancelled" | "unavailable";

export type Side = "yes" | "no";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  xp: number;
  streak: number;
  rank: number | null;
}

export interface Scorebug {
  matchId: string;
  competition: string;
  status: MatchStatus;
  minute: number | null;
  second: number | null;
  home: { name: string; shortCode: string | null; imageUrl: string | null; score: number };
  away: { name: string; shortCode: string | null; imageUrl: string | null; score: number };
  kickoffAt: string;
  watching: number;
}
