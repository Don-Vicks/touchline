import type { DomainMatchStatus, FootballEventType } from "@touchline/football-domain";

export type { DomainMatchStatus, FootballEventType };

export interface EngineTeam {
  id: string;
  name: string;
}

export interface EngineEvent {
  id: string;
  type: FootballEventType;
  minute: number;
  extraMinute?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  playerName?: string | null;
}

export interface MatchSnapshot {
  matchId: string;
  status: DomainMatchStatus;
  minute: number;
  kickoffAt: Date;
  expectedDurationMin: number;
  home: EngineTeam;
  away: EngineTeam;
  homeScore: number;
  awayScore: number;
  hasCorners: boolean;
  hasCards: boolean;
  hasShots: boolean;
  hasLineups: boolean;
}

export interface MarketCandidate {
  templateId: string;
  name: string;
  category: "PRE_MATCH" | "PLAYER" | "MATCH_EVENT" | "LIVE";
  trigger: string;
  question: string;
  resolutionRule: string;
  resolutionSource: string;
  startTime: Date;
  endTime: Date;
  resolutionTime: Date;
  marketType: "standard" | "breaking";
  eventInProgress: boolean;
  dedupeKey: string;
  sourceEventId?: string;
  priority: number;
  subject?: string;
  deadlineMinute: number | null;
  startMinute: number;
  teamId?: string;
  playerName?: string;
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

export type Observed = "yes" | "no" | "pending";

const SOURCE = "Sportmonks football fixture events";

const BANNED =
  /\b(embarrass(?:es|ed|ing)?|dominate[sd]?|unlucky|beautiful|disgrace|bottle[sd]?|deserved|momentum|classy|worldie)\b/i;

export interface TemplateDef {
  id: string;
  name: string;
  category: MarketCandidate["category"];
  trigger: string;
  priority: number;
}

export const TEMPLATES: TemplateDef[] = [
  { id: "MATCH_WINNER_HOME", name: "Home win", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 10 },
  { id: "MATCH_WINNER_AWAY", name: "Away win", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 11 },
  { id: "BOTH_TEAMS_SCORE", name: "Both teams score", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 12 },
  { id: "OVER_25_GOALS", name: "Over 2.5 goals", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 13 },
  { id: "HOME_CLEAN_SHEET", name: "Home clean sheet", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 20 },
  { id: "AWAY_CLEAN_SHEET", name: "Away clean sheet", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 21 },
  { id: "OVER_85_CORNERS", name: "Over 8.5 corners", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 30 },
  { id: "OVER_35_CARDS", name: "Over 3.5 cards", category: "PRE_MATCH", trigger: "PRE_MATCH", priority: 31 },
  { id: "SCORE_WITHIN_5", name: "Score within 5", category: "LIVE", trigger: "AFTER_CORNER", priority: 1 },
  { id: "ANOTHER_CORNER_5", name: "Another corner in 5", category: "LIVE", trigger: "AFTER_CORNER", priority: 4 },
  { id: "ANOTHER_GOAL_5", name: "Goal in next 5", category: "LIVE", trigger: "AFTER_GOAL", priority: 1 },
  { id: "ANOTHER_GOAL_FT", name: "Another goal before FT", category: "MATCH_EVENT", trigger: "AFTER_GOAL", priority: 2 },
  { id: "TRAILING_SCORES_NEXT", name: "Trailing team scores next", category: "LIVE", trigger: "AFTER_GOAL", priority: 3 },
  { id: "YELLOW_BEFORE_80", name: "Another yellow before 80", category: "LIVE", trigger: "AFTER_YELLOW", priority: 2 },
  { id: "TEAM_ANOTHER_CARD", name: "Booked team carded again", category: "LIVE", trigger: "AFTER_YELLOW", priority: 3 },
  { id: "PENALTY_BEFORE_FT", name: "Penalty before FT", category: "MATCH_EVENT", trigger: "KICKOFF", priority: 8 },
  { id: "VAR_BEFORE_FT", name: "Another VAR review", category: "MATCH_EVENT", trigger: "AFTER_VAR", priority: 5 },
  { id: "ANOTHER_SUB_FT", name: "Another substitution", category: "MATCH_EVENT", trigger: "AFTER_SUB", priority: 6 },
  { id: "PLAYER_SHOT_BEFORE", name: "Player another shot", category: "PLAYER", trigger: "AFTER_SHOT", priority: 4 },
  { id: "PLAYER_SOT_BEFORE", name: "Player shot on target", category: "PLAYER", trigger: "AFTER_SHOT_ON_TARGET", priority: 4 },
  { id: "PLAYER_CARD_FT", name: "Player card before FT", category: "PLAYER", trigger: "AFTER_FOUL", priority: 7 },
];

function addMin(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function fullTimeEnd(snapshot: MatchSnapshot): Date {
  return addMin(snapshot.kickoffAt, snapshot.expectedDurationMin);
}

function candidateBase(
  snapshot: MatchSnapshot,
  template: TemplateDef,
  question: string,
  resolutionRule: string,
  now: Date,
  opts: {
    live: boolean;
    dedupeKey: string;
    sourceEventId?: string;
    deadlineMinute: number | null;
    startMinute: number;
    subject?: string;
    teamId?: string;
    playerName?: string;
    endTime?: Date;
  },
): MarketCandidate {
  const endTime = opts.endTime ?? fullTimeEnd(snapshot);
  const startTime = opts.live ? now : new Date(now.getTime() + 3_630_000);
  const resolutionTime = addMin(endTime, 30);
  return {
    templateId: template.id,
    name: template.name,
    category: template.category,
    trigger: template.trigger,
    question,
    resolutionRule,
    resolutionSource: SOURCE,
    startTime,
    endTime,
    resolutionTime,
    marketType: opts.live ? "breaking" : "standard",
    eventInProgress: opts.live,
    dedupeKey: opts.dedupeKey,
    sourceEventId: opts.sourceEventId,
    priority: template.priority,
    subject: opts.subject,
    deadlineMinute: opts.deadlineMinute,
    startMinute: opts.startMinute,
    teamId: opts.teamId,
    playerName: opts.playerName,
  };
}

function tpl(id: string): TemplateDef {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Missing template ${id}`);
  return found;
}

function otherTeam(snapshot: MatchSnapshot, teamId: string | null | undefined): EngineTeam | null {
  if (teamId === snapshot.home.id) return snapshot.away;
  if (teamId === snapshot.away.id) return snapshot.home;
  return null;
}

function namedTeam(snapshot: MatchSnapshot, teamId: string | null | undefined): EngineTeam | null {
  if (teamId === snapshot.home.id) return snapshot.home;
  if (teamId === snapshot.away.id) return snapshot.away;
  return null;
}

export function evaluate(snapshot: MatchSnapshot, event: EngineEvent | null, now = new Date()): MarketCandidate[] {
  if (snapshot.status === "FINISHED" || snapshot.status === "CANCELLED") return [];
  const out: MarketCandidate[] = [];
  const live = snapshot.status === "LIVE" || snapshot.status === "HALFTIME";

  if (!event && !live && snapshot.status === "SCHEDULED") {
    const end = fullTimeEnd(snapshot);
    const earliestStart = now.getTime() + 3_630_000;
    if (snapshot.kickoffAt.getTime() > earliestStart && end.getTime() > earliestStart) {
      const pushPrematch = (id: string, question: string, rule: string) => {
        out.push(
          candidateBase(snapshot, tpl(id), question, rule, now, {
            live: false,
            dedupeKey: `${snapshot.matchId}:${id}`,
            deadlineMinute: null,
            startMinute: 0,
            endTime: end,
          }),
        );
      };
      pushPrematch(
        "MATCH_WINNER_HOME",
        `Will ${snapshot.home.name} win?`,
        `YES if the official fixture result records ${snapshot.home.name} as the winner after full-time, including a awarded result. A draw is NO.`,
      );
      pushPrematch(
        "MATCH_WINNER_AWAY",
        `Will ${snapshot.away.name} win?`,
        `YES if the official fixture result records ${snapshot.away.name} as the winner after full-time. A draw is NO.`,
      );
      pushPrematch(
        "BOTH_TEAMS_SCORE",
        "Will both teams score?",
        "YES if the official fixture records at least one goal for each team before full-time. Own goals count for the opposing team.",
      );
      pushPrematch(
        "OVER_25_GOALS",
        "Will there be over 2.5 goals?",
        "YES if the official fixture records 3 or more goals before full-time. Own goals count.",
      );
      pushPrematch(
        "HOME_CLEAN_SHEET",
        `Will ${snapshot.home.name} keep a clean sheet?`,
        `YES if the official fixture records zero goals for ${snapshot.away.name} at full-time.`,
      );
      pushPrematch(
        "AWAY_CLEAN_SHEET",
        `Will ${snapshot.away.name} keep a clean sheet?`,
        `YES if the official fixture records zero goals for ${snapshot.home.name} at full-time.`,
      );
      if (snapshot.hasCorners) {
        pushPrematch(
          "OVER_85_CORNERS",
          "Will there be over 8.5 corners?",
          "YES if the official fixture statistics record 9 or more corners at full-time.",
        );
      }
      if (snapshot.hasCards) {
        pushPrematch(
          "OVER_35_CARDS",
          "Will there be over 3.5 cards?",
          "YES if the official fixture records 4 or more yellow or red cards before full-time. A second yellow counts as one additional card.",
        );
      }
    }
    return out;
  }

  if (!event || !live) return out;

  const minute = event.minute;
  const deadline5 = minute + 5;
  const team = namedTeam(snapshot, event.teamId);
  const key = (id: string, subject = "") => `${snapshot.matchId}:${id}:${subject}:${event.id}`;

  if ((event.type === "CORNER" || event.type === "SHOT" || event.type === "SHOT_ON_TARGET") && team && deadline5 <= 95) {
    out.push(
      candidateBase(
        snapshot,
        tpl("SCORE_WITHIN_5"),
        `Will ${team.name} score before ${deadline5}:00?`,
        `YES if the official match event feed records a goal for ${team.name} after this event and before the match clock reaches ${deadline5}:00. Own goals by the opponent count. The window starts at event ${event.id}.`,
        now,
        {
          live: true,
          dedupeKey: key("SCORE_WITHIN_5", team.id),
          sourceEventId: event.id,
          deadlineMinute: deadline5,
          startMinute: minute,
          subject: team.id,
          teamId: team.id,
          endTime: new Date(now.getTime() + 5 * 60_000),
        },
      ),
    );
  }

  if (event.type === "CORNER" && team && deadline5 <= 95) {
    out.push(
      candidateBase(
        snapshot,
        tpl("ANOTHER_CORNER_5"),
        `Will ${team.name} get another corner before ${deadline5}:00?`,
        `YES if the official match event feed records another corner for ${team.name} after event ${event.id} and before the match clock reaches ${deadline5}:00.`,
        now,
        {
          live: true,
          dedupeKey: key("ANOTHER_CORNER_5", team.id),
          sourceEventId: event.id,
          deadlineMinute: deadline5,
          startMinute: minute,
          subject: team.id,
          teamId: team.id,
          endTime: new Date(now.getTime() + 5 * 60_000),
        },
      ),
    );
  }

  const isGoal = event.type === "GOAL" || event.type === "PENALTY" || event.type === "OWN_GOAL";
  if (isGoal) {
    const scoring = event.type === "OWN_GOAL" ? otherTeam(snapshot, event.teamId) : team;
    out.push(
      candidateBase(
        snapshot,
        tpl("ANOTHER_GOAL_FT"),
        "Will there be another goal before full-time?",
        `YES if the official match event feed records a goal after event ${event.id} and before full-time. Own goals count.`,
        now,
        {
          live: true,
          dedupeKey: key("ANOTHER_GOAL_FT"),
          sourceEventId: event.id,
          deadlineMinute: null,
          startMinute: minute,
          endTime: fullTimeEnd(snapshot),
        },
      ),
    );
    if (deadline5 <= 90) {
      out.push(
        candidateBase(
          snapshot,
          tpl("ANOTHER_GOAL_5"),
          "Will there be another goal in the next 5 minutes?",
          `YES if the official match event feed records a goal after event ${event.id} and before the match clock reaches ${deadline5}:00.`,
          now,
          {
            live: true,
            dedupeKey: key("ANOTHER_GOAL_5"),
            sourceEventId: event.id,
            deadlineMinute: deadline5,
            startMinute: minute,
            endTime: new Date(now.getTime() + 5 * 60_000),
          },
        ),
      );
    }
    if (scoring && snapshot.homeScore !== snapshot.awayScore) {
      const trailing = snapshot.homeScore < snapshot.awayScore ? snapshot.home : snapshot.away;
      if (trailing.id !== scoring.id) {
        out.push(
          candidateBase(
            snapshot,
            tpl("TRAILING_SCORES_NEXT"),
            `Will ${trailing.name} score next?`,
            `YES if the next goal in the official match event feed, after event ${event.id}, is scored by ${trailing.name}. Full-time with no further goal is NO.`,
            now,
            {
              live: true,
              dedupeKey: key("TRAILING_SCORES_NEXT", trailing.id),
              sourceEventId: event.id,
              deadlineMinute: null,
              startMinute: minute,
              subject: trailing.id,
              teamId: trailing.id,
              endTime: fullTimeEnd(snapshot),
            },
          ),
        );
      }
    }
  }

  if ((event.type === "YELLOW_CARD" || event.type === "SECOND_YELLOW" || event.type === "RED_CARD") && minute < 80) {
    out.push(
      candidateBase(
        snapshot,
        tpl("YELLOW_BEFORE_80"),
        "Will another yellow card occur before 80:00?",
        `YES if the official match event feed records a yellow card or second yellow after event ${event.id} and before the match clock reaches 80:00.`,
        now,
        {
          live: true,
          dedupeKey: key("YELLOW_BEFORE_80"),
          sourceEventId: event.id,
          deadlineMinute: 80,
          startMinute: minute,
          endTime: new Date(now.getTime() + Math.max(1, 80 - minute) * 60_000),
        },
      ),
    );
    if (team) {
      out.push(
        candidateBase(
          snapshot,
          tpl("TEAM_ANOTHER_CARD"),
          `Will ${team.name} receive another card before full-time?`,
          `YES if the official match event feed records a yellow, second yellow, or red card for ${team.name} after event ${event.id} and before full-time.`,
          now,
          {
            live: true,
            dedupeKey: key("TEAM_ANOTHER_CARD", team.id),
            sourceEventId: event.id,
            deadlineMinute: null,
            startMinute: minute,
            subject: team.id,
            teamId: team.id,
            endTime: fullTimeEnd(snapshot),
          },
        ),
      );
    }
  }

  if (event.type === "KICKOFF" || event.type === "HALFTIME") {
    out.push(
      candidateBase(
        snapshot,
        tpl("PENALTY_BEFORE_FT"),
        "Will there be a penalty before full-time?",
        "YES if the official match event feed records a penalty awarded, scored or missed, before full-time.",
        now,
        {
          live: true,
          dedupeKey: `${snapshot.matchId}:PENALTY_BEFORE_FT`,
          sourceEventId: event.id,
          deadlineMinute: null,
          startMinute: minute,
          endTime: fullTimeEnd(snapshot),
        },
      ),
    );
  }

  if (event.type === "VAR") {
    out.push(
      candidateBase(
        snapshot,
        tpl("VAR_BEFORE_FT"),
        "Will there be another VAR review before full-time?",
        `YES if the official match event feed records another VAR event after event ${event.id} and before full-time.`,
        now,
        {
          live: true,
          dedupeKey: key("VAR_BEFORE_FT"),
          sourceEventId: event.id,
          deadlineMinute: null,
          startMinute: minute,
          endTime: fullTimeEnd(snapshot),
        },
      ),
    );
  }

  if ((event.type === "YELLOW_CARD" || event.type === "SECOND_YELLOW") && event.playerName) {
    const player = event.playerName;
    out.push(
      candidateBase(
        snapshot,
        tpl("PLAYER_CARD_FT"),
        `Will ${player} receive another card before full-time?`,
        `YES if the official match event feed records a yellow, second yellow, or red card for ${player} after event ${event.id} and before full-time.`,
        now,
        {
          live: true,
          dedupeKey: key("PLAYER_CARD_FT", player.toLowerCase()),
          sourceEventId: event.id,
          deadlineMinute: null,
          startMinute: minute,
          subject: player.toLowerCase(),
          playerName: player,
          endTime: fullTimeEnd(snapshot),
        },
      ),
    );
  }

  if (event.type === "SUBSTITUTION") {
    out.push(
      candidateBase(
        snapshot,
        tpl("ANOTHER_SUB_FT"),
        "Will there be another substitution before full-time?",
        `YES if the official match event feed records a substitution after event ${event.id} and before full-time.`,
        now,
        {
          live: true,
          dedupeKey: key("ANOTHER_SUB_FT"),
          sourceEventId: event.id,
          deadlineMinute: null,
          startMinute: minute,
          endTime: fullTimeEnd(snapshot),
        },
      ),
    );
  }

  if ((event.type === "SHOT" || event.type === "SHOT_ON_TARGET") && event.playerName && deadline5 <= 95 && snapshot.hasShots) {
    const player = event.playerName;
    out.push(
      candidateBase(
        snapshot,
        tpl("PLAYER_SHOT_BEFORE"),
        `Will ${player} have another shot before ${deadline5}:00?`,
        `YES if the official match event feed records another shot or shot on target by ${player} after event ${event.id} and before the match clock reaches ${deadline5}:00.`,
        now,
        {
          live: true,
          dedupeKey: key("PLAYER_SHOT_BEFORE", player.toLowerCase()),
          sourceEventId: event.id,
          deadlineMinute: deadline5,
          startMinute: minute,
          subject: player.toLowerCase(),
          playerName: player,
          endTime: new Date(now.getTime() + 5 * 60_000),
        },
      ),
    );
  }

  if (event.type === "SHOT_ON_TARGET" && event.playerName && deadline5 <= 95) {
    const player = event.playerName;
    out.push(
      candidateBase(
        snapshot,
        tpl("PLAYER_SOT_BEFORE"),
        `Will ${player} have a shot on target before ${deadline5}:00?`,
        `YES if the official match event feed records a shot on target by ${player} after event ${event.id} and before the match clock reaches ${deadline5}:00.`,
        now,
        {
          live: true,
          dedupeKey: key("PLAYER_SOT_BEFORE", player.toLowerCase()),
          sourceEventId: event.id,
          deadlineMinute: deadline5,
          startMinute: minute,
          subject: player.toLowerCase(),
          playerName: player,
          endTime: new Date(now.getTime() + 5 * 60_000),
        },
      ),
    );
  }

  return out.sort((a, b) => a.priority - b.priority);
}

export function validateCandidate(candidate: MarketCandidate, now = new Date()): ValidationResult {
  const reasons: string[] = [];
  const q = candidate.question.trim();
  if (!q.endsWith("?")) reasons.push("Question must end with a question mark.");
  if (!/^Will\b/i.test(q)) reasons.push("Question must be a binary Will-question.");
  if (BANNED.test(q) || BANNED.test(candidate.resolutionRule)) reasons.push("Subjective language is not allowed.");
  if (!candidate.resolutionRule.trim()) reasons.push("Missing resolution rule.");
  if (!candidate.resolutionSource.trim()) reasons.push("Missing source of truth.");
  if (!(candidate.startTime < candidate.endTime)) reasons.push("startTime must be before endTime.");
  if (candidate.endTime > candidate.resolutionTime) reasons.push("endTime must be at or before resolutionTime.");
  if (candidate.endTime.getTime() <= now.getTime() + 30_000) reasons.push("The window has already closed.");
  if (q.length > 512) reasons.push("Question exceeds 512 characters.");
  if (candidate.resolutionRule.length > 2048) reasons.push("Resolution rule exceeds 2048 characters.");
  if (candidate.marketType === "standard" && candidate.startTime.getTime() < now.getTime() + 3_600_000) {
    reasons.push("Standard markets must start at least 3600 seconds from now.");
  }
  if (candidate.marketType === "breaking" && !candidate.eventInProgress) {
    reasons.push("Breaking football markets must be marked eventInProgress.");
  }
  if (candidate.category === "PLAYER" && !candidate.playerName) reasons.push("Player markets need a named player.");
  return { ok: reasons.length === 0, reasons };
}

function clockPassed(events: EngineEvent[], deadline: number | null, status: DomainMatchStatus, minute: number): boolean {
  if (status === "FINISHED") return true;
  if (deadline == null) return false;
  if (minute > deadline) return true;
  return events.some((e) => e.minute > deadline);
}

function sideOfGoal(event: EngineEvent, homeId: string, awayId: string): "home" | "away" | null {
  if (!event.teamId) return null;
  if (event.type === "GOAL" || event.type === "PENALTY") {
    if (event.teamId === homeId) return "home";
    if (event.teamId === awayId) return "away";
  }
  if (event.type === "OWN_GOAL") {
    if (event.teamId === homeId) return "away";
    if (event.teamId === awayId) return "home";
  }
  return null;
}

export interface ObserveInput {
  templateId: string;
  sourceEventId?: string | null;
  deadlineMinute: number | null;
  teamId?: string | null;
  playerName?: string | null;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  status: DomainMatchStatus;
  minute: number;
  cornerCount?: number | null;
  cardCount?: number | null;
  events: EngineEvent[];
}

export function observeOutcome(input: ObserveInput): Observed {
  const later = input.events.filter((e) => !input.sourceEventId || e.id !== input.sourceEventId);
  const afterSource = (() => {
    if (!input.sourceEventId) return input.events;
    const idx = input.events.findIndex((e) => e.id === input.sourceEventId);
    return idx === -1 ? input.events : input.events.slice(idx + 1);
  })();
  const passed = clockPassed(input.events, input.deadlineMinute, input.status, input.minute);

  const beforeDeadline = (e: EngineEvent) => {
    if (input.deadlineMinute == null) return true;
    return e.minute < input.deadlineMinute;
  };

  switch (input.templateId) {
    case "MATCH_WINNER_HOME":
      if (input.status !== "FINISHED") return "pending";
      return input.homeScore > input.awayScore ? "yes" : "no";
    case "MATCH_WINNER_AWAY":
      if (input.status !== "FINISHED") return "pending";
      return input.awayScore > input.homeScore ? "yes" : "no";
    case "BOTH_TEAMS_SCORE":
      if (input.homeScore > 0 && input.awayScore > 0) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    case "OVER_25_GOALS":
      if (input.homeScore + input.awayScore >= 3) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    case "HOME_CLEAN_SHEET":
      if (input.awayScore > 0) return "no";
      if (input.status === "FINISHED") return "yes";
      return "pending";
    case "AWAY_CLEAN_SHEET":
      if (input.homeScore > 0) return "no";
      if (input.status === "FINISHED") return "yes";
      return "pending";
    case "OVER_85_CORNERS":
      if (input.cornerCount == null) return "pending";
      if (input.cornerCount >= 9) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    case "OVER_35_CARDS":
      if (input.cardCount != null && input.cardCount >= 4) return "yes";
      if (input.status === "FINISHED") return input.cardCount != null && input.cardCount >= 4 ? "yes" : "no";
      return "pending";
    case "SCORE_WITHIN_5": {
      const scored = afterSource.some(
        (e) => beforeDeadline(e) && sideOfGoal(e, input.homeId, input.awayId) === (input.teamId === input.homeId ? "home" : input.teamId === input.awayId ? "away" : null),
      );
      if (scored) return "yes";
      if (passed || input.status === "FINISHED") return "no";
      return "pending";
    }
    case "ANOTHER_GOAL_5":
    case "ANOTHER_GOAL_FT": {
      const goal = afterSource.some((e) => beforeDeadline(e) && sideOfGoal(e, input.homeId, input.awayId));
      if (goal) return "yes";
      if (input.templateId === "ANOTHER_GOAL_FT") return input.status === "FINISHED" ? "no" : "pending";
      if (passed || input.status === "FINISHED") return "no";
      return "pending";
    }
    case "TRAILING_SCORES_NEXT": {
      const next = afterSource.find((e) => sideOfGoal(e, input.homeId, input.awayId));
      if (!next) return input.status === "FINISHED" ? "no" : "pending";
      const side = sideOfGoal(next, input.homeId, input.awayId);
      const wanted = input.teamId === input.homeId ? "home" : "away";
      return side === wanted ? "yes" : "no";
    }
    case "YELLOW_BEFORE_80": {
      const hit = afterSource.some(
        (e) => beforeDeadline(e) && (e.type === "YELLOW_CARD" || e.type === "SECOND_YELLOW"),
      );
      if (hit) return "yes";
      if (passed || input.status === "FINISHED") return "no";
      return "pending";
    }
    case "TEAM_ANOTHER_CARD": {
      const hit = afterSource.some(
        (e) => e.teamId === input.teamId && (e.type === "YELLOW_CARD" || e.type === "SECOND_YELLOW" || e.type === "RED_CARD"),
      );
      if (hit) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    }
    case "PENALTY_BEFORE_FT": {
      const hit = later.some((e) => e.type === "PENALTY" || e.type === "MISSED_PENALTY");
      if (hit) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    }
    case "VAR_BEFORE_FT": {
      const hit = afterSource.some((e) => e.type === "VAR");
      if (hit) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    }
    case "ANOTHER_SUB_FT": {
      const hit = afterSource.some((e) => e.type === "SUBSTITUTION");
      if (hit) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    }
    case "PLAYER_SHOT_BEFORE": {
      const name = input.playerName?.toLowerCase();
      const hit = afterSource.some(
        (e) => beforeDeadline(e) && e.playerName?.toLowerCase() === name && (e.type === "SHOT" || e.type === "SHOT_ON_TARGET"),
      );
      if (hit) return "yes";
      if (passed || input.status === "FINISHED") return "no";
      return "pending";
    }
    case "PLAYER_CARD_FT": {
      const name = input.playerName?.toLowerCase();
      const hit = afterSource.some(
        (e) =>
          e.playerName?.toLowerCase() === name &&
          (e.type === "YELLOW_CARD" || e.type === "SECOND_YELLOW" || e.type === "RED_CARD"),
      );
      if (hit) return "yes";
      if (input.status === "FINISHED") return "no";
      return "pending";
    }
    case "PLAYER_SOT_BEFORE": {
      const name = input.playerName?.toLowerCase();
      const hit = afterSource.some(
        (e) => beforeDeadline(e) && e.playerName?.toLowerCase() === name && e.type === "SHOT_ON_TARGET",
      );
      if (hit) return "yes";
      if (passed || input.status === "FINISHED") return "no";
      return "pending";
    }
    default:
      return "pending";
  }
}

export function scoreXp(input: {
  correct: boolean;
  entryPrice: number | null;
  isLive: boolean;
  streakBefore: number;
}): { xp: number; parts: string[] } {
  if (!input.correct) return { xp: 0, parts: [] };
  let xp = 100;
  const parts = ["Correct call +100"];
  if (input.entryPrice != null && input.entryPrice <= 0.35) {
    xp += 50;
    parts.push("Difficult call +50");
  }
  if (input.isLive) {
    xp += 50;
    parts.push("Live call +50");
  }
  if (input.streakBefore >= 2) {
    const bonus = 10 * Math.min(input.streakBefore, 10);
    xp += bonus;
    parts.push(`Streak +${bonus}`);
  }
  return { xp, parts };
}
