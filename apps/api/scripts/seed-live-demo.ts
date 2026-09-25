import { prisma } from "../src/db";
import { ensureTemplates } from "../src/services/markets";

const PROVIDER = "mock";
const FIXTURE = "touchline-live-demo";

async function team(providerId: string, name: string, shortCode: string, imageUrl: string) {
  return prisma.team.upsert({
    where: { provider_providerId: { provider: PROVIDER, providerId } },
    create: { provider: PROVIDER, providerId, name, shortCode, imageUrl },
    update: { name, shortCode, imageUrl },
  });
}

async function player(teamId: string, providerId: string, name: string, jersey: number, starter: boolean, position: string) {
  return prisma.player.upsert({
    where: { provider_providerId: { provider: PROVIDER, providerId } },
    create: { provider: PROVIDER, providerId, name, teamId },
    update: { name, teamId },
  }).then((row) => ({ ...row, jersey, starter, position }));
}

async function main() {
  await ensureTemplates();
  const competition = await prisma.competition.upsert({
    where: { provider_providerId: { provider: PROVIDER, providerId: "epl" } },
    create: {
      provider: PROVIDER,
      providerId: "epl",
      name: "Premier League",
      country: "England",
      hasCorners: true,
      hasCards: true,
      hasShots: true,
    },
    update: { name: "Premier League", hasCorners: true, hasCards: true, hasShots: true },
  });
  const arsenal = await team("ars", "Arsenal", "ARS", "https://a.espncdn.com/i/teamlogos/soccer/500/359.png");
  const chelsea = await team("che", "Chelsea", "CHE", "https://a.espncdn.com/i/teamlogos/soccer/500/363.png");

  const match = await prisma.match.upsert({
    where: { provider_providerId: { provider: PROVIDER, providerId: FIXTURE } },
    create: {
      provider: PROVIDER,
      providerId: FIXTURE,
      competitionId: competition.id,
      homeTeamId: arsenal.id,
      awayTeamId: chelsea.id,
      kickoffAt: new Date(Date.now() - 64 * 60_000),
      status: "LIVE",
      minute: 64,
      homeScore: 1,
      awayScore: 1,
      htHomeScore: 1,
      htAwayScore: 0,
      venue: "Emirates Stadium",
      venueCity: "London, England",
      referee: "Michael Oliver",
      officials: [
        { name: "Michael Oliver", role: "Referee" },
        { name: "Stuart Burt", role: "Assistant" },
        { name: "Simon Bennett", role: "Assistant" },
        { name: "John Brooks", role: "Fourth official" },
      ],
      attendance: 60383,
      round: "Matchweek 6",
      lengthMin: 90,
      providerState: "in",
      broadcasts: ["Sky Sports", "Peacock"],
      homeFormation: "4-3-3",
      awayFormation: "4-2-3-1",
      lastSyncedAt: new Date(),
    },
    update: {
      status: "LIVE",
      minute: 64,
      homeScore: 1,
      awayScore: 1,
      htHomeScore: 1,
      htAwayScore: 0,
      venue: "Emirates Stadium",
      venueCity: "London, England",
      referee: "Michael Oliver",
      officials: [
        { name: "Michael Oliver", role: "Referee" },
        { name: "Stuart Burt", role: "Assistant" },
        { name: "Simon Bennett", role: "Assistant" },
        { name: "John Brooks", role: "Fourth official" },
      ],
      attendance: 60383,
      broadcasts: ["Sky Sports", "Peacock"],
      homeFormation: "4-3-3",
      awayFormation: "4-2-3-1",
      lastSyncedAt: new Date(),
    },
  });

  const room = await prisma.matchroom.upsert({
    where: { matchId: match.id },
    create: { matchId: match.id, watchUrl: "https://www.youtube.com/watch?v=8jLOxbgIc2k" },
    update: { watchUrl: "https://www.youtube.com/watch?v=8jLOxbgIc2k" },
  });

  await prisma.matchVideo.deleteMany({ where: { matchId: match.id } });
  await prisma.matchVideo.create({
    data: {
      matchId: match.id,
      kind: "LIVE",
      provider: "youtube",
      externalId: "8jLOxbgIc2k",
      title: "Demo watch — Arsenal v Chelsea",
      url: "https://www.youtube.com/watch?v=8jLOxbgIc2k",
      embeddable: true,
      featured: true,
    },
  });

  const homeXi = [
    [1, "David Raya", "GK"],
    [4, "Ben White", "RB"],
    [2, "William Saliba", "CB"],
    [6, "Gabriel", "CB"],
    [12, "Jurrien Timber", "LB"],
    [41, "Declan Rice", "CM"],
    [5, "Thomas Partey", "CM"],
    [8, "Martin Ødegaard", "CM"],
    [7, "Bukayo Saka", "RW"],
    [14, "Kai Havertz", "ST"],
    [11, "Gabriel Martinelli", "LW"],
  ] as const;
  const awayXi = [
    [1, "Robert Sánchez", "GK"],
    [27, "Malo Gusto", "RB"],
    [6, "Levi Colwill", "CB"],
    [5, "Benoît Badiashile", "CB"],
    [3, "Marc Cucurella", "LB"],
    [25, "Moisés Caicedo", "CDM"],
    [8, "Enzo Fernández", "CDM"],
    [20, "Cole Palmer", "CAM"],
    [11, "Noni Madueke", "RW"],
    [15, "Nicolas Jackson", "ST"],
    [7, "Pedro Neto", "LW"],
  ] as const;

  await prisma.matchLineup.deleteMany({ where: { matchId: match.id } });
  for (const [jersey, name, position] of homeXi) {
    const row = await player(arsenal.id, `ars-${jersey}`, name, jersey, true, position);
    await prisma.matchLineup.create({
      data: { matchId: match.id, teamId: arsenal.id, playerId: row.id, starter: true, jersey, position },
    });
  }
  for (const [jersey, name, position] of awayXi) {
    const row = await player(chelsea.id, `che-${jersey}`, name, jersey, true, position);
    await prisma.matchLineup.create({
      data: { matchId: match.id, teamId: chelsea.id, playerId: row.id, starter: true, jersey, position },
    });
  }

  const events = [
    { id: "ko", type: "KICKOFF", minute: 0, detail: "Kickoff" },
    { id: "g1", type: "GOAL", minute: 12, team: "ars", player: "Bukayo Saka", detail: "Arsenal 1-0" },
    { id: "y1", type: "YELLOW_CARD", minute: 28, team: "che", player: "Moisés Caicedo", detail: "Foul" },
    { id: "ht", type: "HALFTIME", minute: 45, detail: "Half-time" },
    { id: "g2", type: "GOAL", minute: 51, team: "che", player: "Cole Palmer", detail: "Arsenal 1-1" },
    { id: "c1", type: "CORNER", minute: 64, team: "ars", player: "Bukayo Saka", detail: "Arsenal corner" },
  ];
  for (const event of events) {
    await prisma.footballEvent.upsert({
      where: { provider_providerEventId: { provider: PROVIDER, providerEventId: `${FIXTURE}-${event.id}` } },
      create: {
        matchId: match.id,
        provider: PROVIDER,
        providerEventId: `${FIXTURE}-${event.id}`,
        type: event.type,
        minute: event.minute,
        teamProviderId: "team" in event ? event.team : null,
        playerName: "player" in event ? event.player : null,
        detail: event.detail,
        payload: {},
      },
      update: { minute: event.minute, detail: event.detail, playerName: "player" in event ? event.player : null },
    });
  }

  const now = new Date();
  const liveEnd = new Date(now.getTime() + 5 * 60_000);
  const ft = new Date(now.getTime() + 40 * 60_000);
  const markets = [
    {
      templateId: "SCORE_WITHIN_5",
      category: "LIVE" as const,
      question: "Will Arsenal score before 69:00?",
      resolutionRule: "YES if Arsenal score before 69:00 on the official clock.",
      sourceEventId: `${FIXTURE}-c1`,
      endTime: liveEnd,
      marketType: "breaking",
      dedupeKey: `demo-${FIXTURE}-score5`,
      subject: "Arsenal",
      deadlineMinute: 69,
    },
    {
      templateId: "ANOTHER_GOAL_FT",
      category: "MATCH_EVENT" as const,
      question: "Will there be another goal before full time?",
      resolutionRule: "YES if the score is no longer 1-1 at full time.",
      sourceEventId: `${FIXTURE}-g2`,
      endTime: ft,
      marketType: "breaking",
      dedupeKey: `demo-${FIXTURE}-goal-ft`,
      subject: "match",
      deadlineMinute: 90,
    },
    {
      templateId: "BOTH_TEAMS_SCORE",
      category: "PRE_MATCH" as const,
      question: "Will both teams score?",
      resolutionRule: "YES if both Arsenal and Chelsea have at least one goal at FT.",
      sourceEventId: null,
      endTime: ft,
      marketType: "standard",
      dedupeKey: `demo-${FIXTURE}-btts`,
      subject: "match",
      deadlineMinute: 90,
    },
  ];
  for (const row of markets) {
    await prisma.market.upsert({
      where: { dedupeKey: row.dedupeKey },
      create: {
        matchId: match.id,
        templateId: row.templateId,
        category: row.category,
        question: row.question,
        resolutionRule: row.resolutionRule,
        resolutionSource: "Official match event feed",
        sourceEventId: row.sourceEventId,
        startTime: now,
        endTime: row.endTime,
        resolutionTime: ft,
        status: "OPEN",
        marketType: row.marketType,
        subject: row.subject,
        deadlineMinute: row.deadlineMinute,
        startMinute: 64,
        teamProviderId: row.subject === "Arsenal" ? "ars" : null,
        dedupeKey: row.dedupeKey,
      },
      update: { status: "OPEN", question: row.question, endTime: row.endTime, disabled: false },
    });
  }

  console.log(JSON.stringify({ matchId: match.id, roomId: room.id, path: `/match/${match.id}` }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
