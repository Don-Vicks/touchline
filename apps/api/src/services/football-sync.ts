import { Prisma } from "@prisma/client";
import { FootballProviderUnavailable, scoringSide, type DomainFixture } from "@touchline/football-domain";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { metric } from "../redis";
import { publish } from "../realtime";
import { competitionWeight, isFeaturedCompetition } from "../integrations/leagues";
import { mergeFixtures } from "../integrations/merge";
import { footballProviders, providerNamed } from "../integrations/registry";
import { FootballDataProviderClient } from "../integrations/football-data";
import { pickBestHighlight, searchYoutubeVideos, youtubeQuotaBlocked } from "../integrations/youtube";
import { fetchOfficialChannelHighlights } from "../integrations/trusted-highlights";
import { notify } from "./notify";
import { onFootballEvent, refreshEvidence, syncPrematch } from "./markets";

async function setHealth(id: string, status: string, detail: string) {
  await prisma.providerHealth.upsert({
    where: { id },
    create: { id, status, detail, checkedAt: new Date() },
    update: { status, detail, checkedAt: new Date() },
  });
}

async function insertEvent(matchId: string, fixture: DomainFixture, event: DomainFixture["events"][number]) {
  const existing = await prisma.footballEvent.findUnique({
    where: { provider_providerEventId: { provider: fixture.provider, providerEventId: event.providerEventId } },
  });
  if (existing) {
    await metric("duplicate_events");
    return false;
  }
  try {
    await prisma.footballEvent.create({
      data: {
        matchId,
        provider: fixture.provider,
        providerEventId: event.providerEventId,
        type: event.type,
        minute: event.minute,
        extraMinute: event.extraMinute,
        teamProviderId: event.teamProviderId,
        playerName: event.playerName,
        relatedPlayerName: event.relatedPlayerName,
        detail: event.detail,
        payload: { type: event.type, minute: event.minute, player: event.playerName },
      },
    });
    await metric("football_events_processed");
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await metric("duplicate_events");
      return false;
    }
    throw error;
  }
}

export async function ingest(fixture: DomainFixture, opts: { generate: boolean }) {
  const hasCorners = fixture.events.some((event) => event.type === "CORNER") || fixture.statistics.some((stat) => stat.name.includes("CORNER"));
  const hasCards =
    fixture.events.some((event) => event.type === "YELLOW_CARD" || event.type === "RED_CARD") ||
    fixture.statistics.some((stat) => stat.name.includes("CARD"));
  const hasShots =
    fixture.events.some((event) => event.type === "SHOT" || event.type === "SHOT_ON_TARGET") ||
    fixture.statistics.some((stat) => stat.name.includes("SHOT"));

  const competition = await prisma.competition.upsert({
    where: { provider_providerId: { provider: fixture.provider, providerId: fixture.competitionProviderId } },
    create: {
      provider: fixture.provider,
      providerId: fixture.competitionProviderId,
      name: fixture.competitionName,
      imageUrl: fixture.competitionImage,
      hasCorners,
      hasCards,
      hasShots,
    },
    update: {
      name: fixture.competitionName,
      imageUrl: fixture.competitionImage,
      hasCorners: hasCorners ? true : undefined,
      hasCards: hasCards ? true : undefined,
      hasShots: hasShots ? true : undefined,
    },
  });

  let seasonId: string | null = null;
  if (fixture.seasonProviderId) {
    const season = await prisma.season.upsert({
      where: { provider_providerId: { provider: fixture.provider, providerId: fixture.seasonProviderId } },
      create: {
        provider: fixture.provider,
        providerId: fixture.seasonProviderId,
        competitionId: competition.id,
        name: fixture.seasonName ?? fixture.seasonProviderId,
        isCurrent: true,
      },
      update: { name: fixture.seasonName ?? fixture.seasonProviderId },
    });
    seasonId = season.id;
  }

  const home = await prisma.team.upsert({
    where: { provider_providerId: { provider: fixture.provider, providerId: fixture.home.providerId } },
    create: { provider: fixture.provider, providerId: fixture.home.providerId, name: fixture.home.name, shortCode: fixture.home.shortCode, imageUrl: fixture.home.imageUrl },
    update: { name: fixture.home.name, shortCode: fixture.home.shortCode, imageUrl: fixture.home.imageUrl },
  });
  const away = await prisma.team.upsert({
    where: { provider_providerId: { provider: fixture.provider, providerId: fixture.away.providerId } },
    create: { provider: fixture.provider, providerId: fixture.away.providerId, name: fixture.away.name, shortCode: fixture.away.shortCode, imageUrl: fixture.away.imageUrl },
    update: { name: fixture.away.name, shortCode: fixture.away.shortCode, imageUrl: fixture.away.imageUrl },
  });

  const previous = await prisma.match.findUnique({
    where: { provider_providerId: { provider: fixture.provider, providerId: fixture.providerId } },
  });
  const match = await prisma.match.upsert({
    where: { provider_providerId: { provider: fixture.provider, providerId: fixture.providerId } },
    create: {
      provider: fixture.provider,
      providerId: fixture.providerId,
      competitionId: competition.id,
      seasonId,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date(fixture.kickoffAt),
      status: fixture.status,
      minute: fixture.minute,
      extraMinute: fixture.extraMinute,
      second: fixture.second,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      htHomeScore: fixture.htHomeScore,
      htAwayScore: fixture.htAwayScore,
      venue: fixture.venue,
      venueCity: fixture.venueCity ?? undefined,
      referee: fixture.referee ?? undefined,
      officials: fixture.officials ?? undefined,
      attendance: fixture.attendance ?? undefined,
      round: fixture.round,
      lengthMin: fixture.lengthMin,
      providerState: fixture.providerState,
      lastSyncedAt: new Date(),
      broadcasts: JSON.stringify((fixture.broadcasts ?? []).map((row) => row.name)),
      homeFormation: fixture.homeFormation ?? undefined,
      awayFormation: fixture.awayFormation ?? undefined,
    },
    update: {
      status: fixture.status,
      minute: fixture.minute,
      extraMinute: fixture.extraMinute,
      second: fixture.second,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      htHomeScore: fixture.htHomeScore,
      htAwayScore: fixture.htAwayScore,
      venue: fixture.venue,
      venueCity: fixture.venueCity ?? undefined,
      referee: fixture.referee ?? undefined,
      officials: fixture.officials ?? undefined,
      attendance: fixture.attendance ?? undefined,
      round: fixture.round,
      providerState: fixture.providerState,
      lastSyncedAt: new Date(),
      seasonId: seasonId ?? undefined,
      broadcasts: fixture.broadcasts?.length ? JSON.stringify(fixture.broadcasts.map((row) => row.name)) : undefined,
      homeFormation: fixture.homeFormation ?? undefined,
      awayFormation: fixture.awayFormation ?? undefined,
    },
  });

  for (const player of fixture.lineups) {
    const teamId = player.teamProviderId === home.providerId ? home.id : player.teamProviderId === away.providerId ? away.id : null;
    const row = await prisma.player.upsert({
      where: { provider_providerId: { provider: fixture.provider, providerId: player.providerId } },
      create: { provider: fixture.provider, providerId: player.providerId, name: player.name, teamId, imageUrl: player.imageUrl },
      update: { name: player.name, teamId: teamId ?? undefined, imageUrl: player.imageUrl ?? undefined },
    });
    if (!teamId) continue;
    await prisma.matchLineup.upsert({
      where: { matchId_playerId: { matchId: match.id, playerId: row.id } },
      create: {
        matchId: match.id,
        teamId,
        playerId: row.id,
        starter: player.starter ?? false,
        position: player.position ?? null,
        jersey: player.jersey,
        grid: player.grid ?? null,
      },
      update: { starter: player.starter ?? false, position: player.position ?? undefined, jersey: player.jersey ?? undefined, grid: player.grid ?? undefined, teamId },
    });
  }

  const videos = [...(fixture.videos ?? [])];
  if (fixture.status === "FINISHED") {
    const haveYt = await prisma.matchVideo.count({ where: { matchId: match.id, provider: "youtube", embeddable: true } });
    if (haveYt === 0 && !match.highlightSearchedAt) {
      videos.push(...(await fetchOfficialChannelHighlights(fixture.home.name, fixture.away.name, fixture.competitionName)));
    }
  }
  await persistMatchClips(match.id, videos, fixture.home.name, fixture.away.name);

  let room = await prisma.matchroom.findUnique({ where: { matchId: match.id } });
  if (!room) {
    try {
      room = await prisma.matchroom.create({ data: { matchId: match.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        room = await prisma.matchroom.findUnique({ where: { matchId: match.id } });
      } else {
        throw error;
      }
    }
  }
  if (!room) throw new Error("Matchroom could not be opened.");

  if (previous && previous.status !== "LIVE" && fixture.status === "LIVE") {
    const members = await prisma.matchroomMember.findMany({ where: { matchroomId: room.id } });
    for (const member of members) {
      await notify(member.userId, {
        type: "MATCH_STARTING",
        title: "Kickoff",
        body: `${fixture.home.name} vs ${fixture.away.name} is live.`,
        href: `/match/${match.id}`,
      });
    }
    if (opts.generate) {
      await onFootballEvent(
        match.id,
        { id: `kickoff:${match.id}`, type: "KICKOFF", minute: 0 },
        { home: fixture.homeScore, away: fixture.awayScore, minute: fixture.minute ?? 0 },
      );
    }
  }

  let homeScore = 0;
  let awayScore = 0;
  const fresh: DomainFixture["events"] = [];
  for (const event of fixture.events) {
    const side = scoringSide(event.type, event.teamProviderId, fixture.home.providerId, fixture.away.providerId);
    if (side === "home") homeScore += 1;
    if (side === "away") awayScore += 1;
    const created = await insertEvent(match.id, fixture, event);
    if (!created) continue;
    fresh.push(event);
    if (opts.generate && (fixture.status === "LIVE" || fixture.status === "HALFTIME")) {
      await onFootballEvent(
        match.id,
        {
          id: event.providerEventId,
          type: event.type,
          minute: event.minute,
          extraMinute: event.extraMinute,
          teamId: event.teamProviderId,
          playerName: event.playerName,
        },
        { home: homeScore, away: awayScore, minute: event.minute },
      );
    }
  }

  if (opts.generate && fixture.status === "SCHEDULED") await syncPrematch(match.id);

  if (opts.generate) {
    const markers =
      fixture.status === "LIVE"
        ? [{ type: "KICKOFF" as const, id: `status:kickoff:${fixture.providerId}`, minute: 0 }]
        : fixture.status === "HALFTIME"
          ? [{ type: "HALFTIME" as const, id: `status:ht:${fixture.providerId}`, minute: 45 }]
          : fixture.status === "FINISHED"
            ? [{ type: "FULLTIME" as const, id: `status:ft:${fixture.providerId}`, minute: fixture.minute ?? 90 }]
            : [];
    for (const marker of markers) {
      const created = await insertEvent(match.id, fixture, {
        providerEventId: marker.id,
        type: marker.type,
        minute: marker.minute,
        extraMinute: null,
        teamProviderId: null,
        playerName: null,
        relatedPlayerName: null,
        detail: marker.type,
      });
      if (created && (fixture.status === "LIVE" || fixture.status === "HALFTIME")) {
        await onFootballEvent(
          match.id,
          { id: marker.id, type: marker.type, minute: marker.minute },
          { home: fixture.homeScore, away: fixture.awayScore, minute: marker.minute },
        );
      }
    }
  }

  await refreshEvidence(match.id);
  await publish(`matchroom:${room.id}`, "match:update", {
    matchId: match.id,
    status: fixture.status,
    minute: fixture.minute,
    extraMinute: fixture.extraMinute,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
  });
  for (const event of fresh) {
    await publish(`matchroom:${room.id}`, "match:event", {
      id: event.providerEventId,
      type: event.type,
      minute: event.minute,
      extraMinute: event.extraMinute,
      playerName: event.playerName,
      teamProviderId: event.teamProviderId,
      detail: event.detail,
    });
  }
  return match.id;
}

export async function syncLive() {
  const collected = [];
  let anyUp = false;
  for (const provider of footballProviders()) {
    try {
      const live = await provider.getLiveFixtures();
      collected.push(...live);
      anyUp = true;
      await setHealth(provider.name, "up", `${live.length} live`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live sync failed";
      await setHealth(provider.name, error instanceof FootballProviderUnavailable ? "down" : "down", message);
      logger.warn({ provider: provider.name, err: message }, "live provider failed");
    }
  }
  const live = mergeFixtures(collected).slice(0, 30);
  const seen = new Set(live.map((fixture) => `${fixture.provider}:${fixture.providerId}`));
  for (const fixture of live) await ingest(fixture, { generate: true });
  const lingering = await prisma.match.findMany({
    where: { status: { in: ["LIVE", "HALFTIME"] } },
    take: 12,
  });
  for (const match of lingering) {
    if (seen.has(`${match.provider}:${match.providerId}`)) continue;
    const source = providerNamed(match.provider);
    if (!source) continue;
    try {
      const fixture = await source.getFixture(match.providerId);
      await ingest(fixture, { generate: fixture.status === "LIVE" || fixture.status === "HALFTIME" });
    } catch (error) {
      logger.warn({ provider: match.provider, err: error instanceof Error ? error.message : "refresh failed" }, "live refresh failed");
    }
  }
  if (!anyUp) await setHealth("football", "down", "Every football feed failed");
  await metricReset("live_matches", await prisma.match.count({ where: { status: { in: ["LIVE", "HALFTIME"] } } }));
}

async function metricReset(name: string, value: number) {
  const { redis } = await import("../redis");
  await redis.set(`metric:${name}`, value);
}

export async function syncWindow() {
  const now = new Date();
  const query = {
    from: new Date(now.getTime() - 8 * 24 * 60 * 60_000),
    to: new Date(now.getTime() + 21 * 24 * 60 * 60_000),
    leagueIds: config.leagueIds,
  };
  const collected = [];
  for (const provider of footballProviders()) {
    try {
      const rows = await provider.getFixtures(query);
      collected.push(...rows);
      await setHealth(provider.name, "up", `${rows.length} fixtures`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture sync failed";
      await setHealth(provider.name, "down", message);
      logger.warn({ provider: provider.name, err: message }, "fixture provider failed");
    }
  }
  const fixtures = mergeFixtures(collected)
    .filter((fixture) => isFeaturedCompetition(fixture.competitionName) || fixture.status === "LIVE" || fixture.status === "HALFTIME")
    .sort((a, b) => competitionWeight(a.competitionName) - competitionWeight(b.competitionName) || new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  for (const fixture of fixtures) {
    await ingest(fixture, { generate: true });
  }
  logger.info({ fixtures: fixtures.length }, "fixture window synced");
}

async function persistMatchClips(
  matchId: string,
  clips: { kind: string; title: string; url: string; provider: string; externalId: string | null; channelTitle?: string | null }[],
  home: string,
  away: string,
) {
  if (!clips.length) return;
  const best = pickBestHighlight(clips, home, away);
  await prisma.matchVideo.updateMany({ where: { matchId }, data: { featured: false } });
  for (const video of clips) {
    const featured = Boolean(best && video.url === best.url);
    await prisma.matchVideo.upsert({
      where: { matchId_provider_url: { matchId, provider: video.provider, url: video.url } },
      create: {
        matchId,
        kind: video.kind,
        provider: video.provider,
        externalId: video.externalId,
        title: video.title,
        url: video.url,
        embeddable: video.provider === "youtube",
        featured,
      },
      update: {
        title: video.title,
        kind: video.kind,
        externalId: video.externalId ?? undefined,
        embeddable: video.provider === "youtube",
        featured,
      },
    });
  }
}

export async function enrichMatchDetail(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { _count: { select: { lineups: true, videos: true } } },
  });
  if (!match) return;
  const needsLineups = match._count.lineups === 0;
  const needsOfficials = !match.referee;
  const yt = match.status === "FINISHED" ? await prisma.matchVideo.count({ where: { matchId, provider: "youtube", embeddable: true } }) : 1;
  const needsVideo = match.status === "FINISHED" && yt === 0 && !match.highlightSearchedAt;
  if (!needsLineups && !needsVideo && !needsOfficials) return;
  const loaded = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, competition: true },
  });
  if (loaded?.status === "FINISHED" && yt === 0) {
    const rss = await fetchOfficialChannelHighlights(loaded.homeTeam.name, loaded.awayTeam.name, loaded.competition.name);
    let clips = rss;
    if (!rss.length && !loaded.highlightSearchedAt && config.youtubeUseSearch && !(await youtubeQuotaBlocked())) {
      clips = await searchYoutubeVideos(`${loaded.homeTeam.name} vs ${loaded.awayTeam.name} ${loaded.competition.name} highlights`);
      if (!(await youtubeQuotaBlocked())) {
        await prisma.match.update({ where: { id: matchId }, data: { highlightSearchedAt: new Date() } });
      }
    } else if (rss.length) {
      await prisma.match.update({ where: { id: matchId }, data: { highlightSearchedAt: new Date() } });
    }
    await persistMatchClips(matchId, clips, loaded.homeTeam.name, loaded.awayTeam.name);
  }
  const source = providerNamed(match.provider);
  if (source) {
    try {
      const fixture = await source.getFixture(match.providerId);
      await ingest(fixture, { generate: false });
    } catch (error) {
      logger.warn({ matchId, err: error instanceof Error ? error.message : "enrich failed" }, "match detail enrich failed");
    }
  }
  if (!config.footballDataToken) return;
  const again = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, _count: { select: { lineups: true } } },
  });
  if (!again || again._count.lineups > 0) return;
  try {
    const client = new FootballDataProviderClient(config.footballDataToken);
    const day = new Date(again.kickoffAt);
    const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const rows = await client.getFixtures({ from, to: new Date(from.getTime() + 24 * 60 * 60_000) });
    const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = rows.find(
      (row) =>
        (fold(row.home.name).includes(fold(again.homeTeam.name).slice(0, 6)) || fold(again.homeTeam.name).includes(fold(row.home.name).slice(0, 6))) &&
        (fold(row.away.name).includes(fold(again.awayTeam.name).slice(0, 6)) || fold(again.awayTeam.name).includes(fold(row.away.name).slice(0, 6))),
    );
    if (!hit?.lineups.length) return;
    if (hit.homeFormation || hit.awayFormation || hit.referee || hit.venue) {
      await prisma.match.update({
        where: { id: again.id },
        data: {
          homeFormation: hit.homeFormation ?? undefined,
          awayFormation: hit.awayFormation ?? undefined,
          referee: hit.referee ?? undefined,
          officials: hit.officials ?? undefined,
          venue: hit.venue ?? undefined,
        },
      });
    }
    for (const player of hit.lineups) {
      const side = fold(player.teamProviderId ?? "") === fold(hit.home.providerId) ? again.homeTeamId : again.awayTeamId;
      const row = await prisma.player.upsert({
        where: { provider_providerId: { provider: "football-data", providerId: player.providerId } },
        create: { provider: "football-data", providerId: player.providerId, name: player.name, teamId: side },
        update: { name: player.name, teamId: side },
      });
      await prisma.matchLineup.upsert({
        where: { matchId_playerId: { matchId: again.id, playerId: row.id } },
        create: {
          matchId: again.id,
          teamId: side,
          playerId: row.id,
          starter: player.starter ?? false,
          position: player.position ?? null,
          jersey: player.jersey,
        },
        update: { starter: player.starter ?? false, position: player.position ?? undefined, jersey: player.jersey ?? undefined, teamId: side },
      });
    }
  } catch (error) {
    logger.warn({ matchId, err: error instanceof Error ? error.message : "fd lineups" }, "football-data lineups skipped");
  }
}
