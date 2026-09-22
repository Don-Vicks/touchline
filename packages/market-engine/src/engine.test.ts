import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, observeOutcome, scoreXp, validateCandidate, type MatchSnapshot } from "./index.ts";

const kickoff = new Date("2026-09-26T14:00:00Z");

function snap(over: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    matchId: "m1",
    status: "LIVE",
    minute: 73,
    kickoffAt: kickoff,
    expectedDurationMin: 115,
    home: { id: "ars", name: "Arsenal" },
    away: { id: "che", name: "Chelsea" },
    homeScore: 2,
    awayScore: 1,
    hasCorners: true,
    hasCards: true,
    hasShots: true,
    hasLineups: true,
    ...over,
  };
}

test("a 73rd-minute corner opens an Arsenal score-before-78 market", () => {
  const now = new Date("2026-09-26T15:13:00Z");
  const [first] = evaluate(
    snap(),
    { id: "corner-73", type: "CORNER", minute: 73, teamId: "ars", teamName: "Arsenal" },
    now,
  );
  assert.equal(first?.templateId, "SCORE_WITHIN_5");
  assert.equal(first?.question, "Will Arsenal score before 78:00?");
  assert.equal(first?.marketType, "breaking");
  assert.equal(validateCandidate(first!, now).ok, true);
});

test("subjective questions are rejected", () => {
  const now = new Date("2026-09-26T15:13:00Z");
  const [first] = evaluate(
    snap(),
    { id: "corner-73", type: "CORNER", minute: 73, teamId: "ars", teamName: "Arsenal" },
    now,
  );
  const bad = { ...first!, question: "Will Arsenal embarrass Chelsea?" };
  const result = validateCandidate(bad, now);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.includes("Subjective")));
});

test("pre-match markets are standard and skipped when kickoff is too soon", () => {
  const soon = new Date(kickoff.getTime() - 20 * 60_000);
  const none = evaluate(snap({ status: "SCHEDULED", minute: 0 }), null, soon);
  assert.equal(none.length, 0);

  const early = new Date(kickoff.getTime() - 6 * 60 * 60_000);
  const markets = evaluate(snap({ status: "SCHEDULED", minute: 0 }), null, early);
  assert.ok(markets.some((m) => m.templateId === "BOTH_TEAMS_SCORE"));
  assert.ok(markets.every((m) => validateCandidate(m, early).ok));
  assert.equal(markets[0]?.marketType, "standard");
});

test("corner markets do not include corners when the feed has no corner coverage on pre-match", () => {
  const early = new Date(kickoff.getTime() - 6 * 60 * 60_000);
  const markets = evaluate(snap({ status: "SCHEDULED", minute: 0, hasCorners: false, hasCards: false }), null, early);
  assert.equal(markets.some((m) => m.templateId === "OVER_85_CORNERS"), false);
});

test("an Arsenal goal inside the window resolves yes, and full-time without one resolves no", () => {
  const yes = observeOutcome({
    templateId: "SCORE_WITHIN_5",
    sourceEventId: "corner-73",
    deadlineMinute: 78,
    teamId: "ars",
    homeId: "ars",
    awayId: "che",
    homeScore: 3,
    awayScore: 1,
    status: "LIVE",
    minute: 76,
    events: [
      { id: "corner-73", type: "CORNER", minute: 73, teamId: "ars" },
      { id: "goal-76", type: "GOAL", minute: 76, teamId: "ars", playerName: "Saka" },
    ],
  });
  assert.equal(yes, "yes");

  const no = observeOutcome({
    templateId: "SCORE_WITHIN_5",
    sourceEventId: "corner-73",
    deadlineMinute: 78,
    teamId: "ars",
    homeId: "ars",
    awayId: "che",
    homeScore: 2,
    awayScore: 1,
    status: "FINISHED",
    minute: 94,
    events: [{ id: "corner-73", type: "CORNER", minute: 73, teamId: "ars" }],
  });
  assert.equal(no, "no");
});

test("a Chelsea own goal counts as an Arsenal goal", () => {
  const yes = observeOutcome({
    templateId: "SCORE_WITHIN_5",
    sourceEventId: "corner-73",
    deadlineMinute: 78,
    teamId: "ars",
    homeId: "ars",
    awayId: "che",
    homeScore: 3,
    awayScore: 1,
    status: "LIVE",
    minute: 76,
    events: [
      { id: "corner-73", type: "CORNER", minute: 73, teamId: "ars" },
      { id: "og-76", type: "OWN_GOAL", minute: 76, teamId: "che" },
    ],
  });
  assert.equal(yes, "yes");
});

test("xp rewards the call, not the stake", () => {
  const hard = scoreXp({ correct: true, entryPrice: 0.31, isLive: true, streakBefore: 3 });
  assert.equal(hard.xp, 100 + 50 + 50 + 30);
  const wrong = scoreXp({ correct: false, entryPrice: 0.1, isLive: true, streakBefore: 4 });
  assert.equal(wrong.xp, 0);
});

test("a goal opens another-goal and trailing-team markets", () => {
  const now = new Date("2026-09-26T15:20:00Z");
  const markets = evaluate(
    snap({ minute: 76, homeScore: 3, awayScore: 1 }),
    { id: "goal-76", type: "GOAL", minute: 76, teamId: "ars", teamName: "Arsenal" },
    now,
  );
  assert.ok(markets.some((m) => m.question === "Will there be another goal before full-time?"));
  assert.ok(markets.some((m) => m.question === "Will Chelsea score next?"));
});
