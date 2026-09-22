export type ProviderState = "up" | "down" | "unconfigured" | string;

export interface Fan {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  xp: number;
  streak: number;
  rank?: number | null;
}

export interface Side {
  id: string;
  name: string;
  shortCode: string | null;
  imageUrl: string | null;
}

export interface MatchCard {
  id: string;
  status: string;
  minute: number | null;
  extraMinute: number | null;
  clock: string;
  kickoffAt: string;
  venue: string | null;
  round: string | null;
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  competition: { id: string; name: string; imageUrl: string | null };
  home: Side;
  away: Side;
  watching: number;
  matchroomId: string | null;
}

export interface MarketCard {
  id: string;
  matchId: string;
  question: string;
  category: string;
  status: string;
  marketType: string;
  yesPrice: string | null;
  noPrice: string | null;
  outcome: string | null;
  evidence: string | null;
  pantaMarketId: string | null;
  closesAt: string;
  failureReason: string | null;
  tradable: boolean;
  sourceEventId?: string | null;
}

export interface ChatLine {
  id: string;
  body: string;
  kind: string;
  createdAt: string;
  user: Fan;
  replyToId?: string | null;
}

export interface FeedEvent {
  id: string;
  providerEventId: string;
  type: string;
  minute: number;
  extraMinute: number | null;
  playerName: string | null;
  teamProviderId: string | null;
  detail: string | null;
}

export interface HomePayload {
  user: { displayName: string; username: string; xp: number; rank: number } | null;
  live: MatchCard[];
  recent: MatchCard[];
  soon: MatchCard[];
  squad: { id: string; name: string; xp: number; rank: number; members: number } | null;
  trending: MarketCard[];
  leaders: Fan[];
  provider: { football: ProviderState; panta: ProviderState };
}

export interface MePayload {
  user: (Fan & { email: string; role: string; walletAddress: string | null; bio: string | null; bestStreak?: number }) | null;
}
