import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Prisma } from "@prisma/client";
import {
  buildBuySchema,
  chatSchema,
  createSquadSchema,
  inviteSchema,
  joinCodeSchema,
  loginSchema,
  muteSchema,
  avatarUploadSchema,
  passwordChangeSchema,
  profileSchema,
  quoteBuySchema,
  registerMarketSchema,
  registerSchema,
  reportSchema,
  submitBuySchema,
  walletVerifySchema,
} from "@touchline/validation";
import { z } from "zod";
import { FEATURED_COMPETITIONS, competitionWeight, isFeaturedCompetition, playerHeadshotUrl } from "../integrations/leagues";
import { parseWatchUrl } from "../integrations/watch";
import { officialWatchFor } from "../integrations/official-watch";
import { enrichMatchDetail } from "../services/football-sync";
import { explorerTxUrl } from "../lib/explorer";
import { avatarDir, avatarPublicUrl } from "../avatars";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  checkPassword,
  cookieOptions,
  hashPassword,
  hashToken,
  newToken,
  requireAdmin,
  requireUser,
} from "../auth";
import { prisma } from "../db";
import { metric, readMetrics, redis } from "../redis";
import { presenceCount } from "../realtime";
import { marketJson, matchJson, userSelect } from "../serialize";
import { postMessage } from "../services/chat";
import { notify } from "../services/notify";
import { beginCreate, buildForUser, buildWinClaimForUser, finishCreate, paperCall, quoteForUser, submitForUser, submitWinClaimForUser, syncPrematch } from "../services/markets";
import { panta } from "../integrations/panta";
import { syncLive, syncWindow } from "../services/football-sync";
import { logger } from "../logger";

const router = Router();
const MONTH = 30 * 24 * 60 * 60 * 1000;

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

function parse<T>(schema: { safeParse(body: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown, res: Response) {
  const result = schema.safeParse(body);
  if (!result.success) {
    fail(res, 400, result.error.issues[0]?.message ?? "Invalid input.");
    return null;
  }
  return result.data;
}

function auth(res: Response) {
  return res.locals.auth as {
    csrfToken: string;
    user: {
      id: string;
      email: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      bio: string | null;
      role: string;
      xp: number;
      streak: number;
      bestStreak: number;
      wallets: { address: string }[];
    };
  };
}

async function issueSession(res: Response, userId: string, req: Request) {
  const token = newToken();
  const csrf = newToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfToken: csrf,
      expiresAt: new Date(Date.now() + MONTH),
      userAgent: req.get("user-agent")?.slice(0, 180),
      ip: req.ip,
    },
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(MONTH), httpOnly: true });
  res.cookie(CSRF_COOKIE, csrf, { ...cookieOptions(MONTH), httpOnly: false });
  return csrf;
}

async function rankOfUser(userId: string, xp: number) {
  const ahead = await prisma.user.count({ where: { bannedAt: null, OR: [{ xp: { gt: xp } }, { xp, id: { lt: userId } }] } });
  return ahead + 1;
}

const matchInclude = {
  competition: true,
  homeTeam: true,
  awayTeam: true,
  matchroom: true,
} satisfies Prisma.MatchInclude;

router.get("/health", async (_req, res) => {
  const [football, panta] = await Promise.all([
    prisma.providerHealth.findUnique({ where: { id: "sportmonks" } }),
    prisma.providerHealth.findUnique({ where: { id: "panta" } }),
  ]);
  res.json({
    ok: true,
    football: football?.status ?? "unconfigured",
    footballDetail: football?.detail ?? null,
    panta: panta?.status ?? "unconfigured",
    pantaDetail: panta?.detail ?? null,
  });
});

router.post("/auth/register", async (req, res) => {
  const body = parse(registerSchema, req.body, res);
  if (!body) return;
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: body.email.toLowerCase() }, { username: body.username }] } });
  if (existing) return fail(res, 409, "That email or username is taken.");
  const recent = await prisma.session.count({
    where: { ip: req.ip, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
    },
  });
  if (recent >= 3) {
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "DUPLICATE_SIGNAL", entity: "User", entityId: user.id, detail: { ip: req.ip } },
    });
  }
  await issueSession(res, user.id, req);
  res.status(201).json({ user: { id: user.id, username: user.username, displayName: user.displayName } });
});

router.post("/auth/login", async (req, res) => {
  const body = parse(loginSchema, req.body, res);
  if (!body) return;
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !(await checkPassword(body.password, user.passwordHash))) return fail(res, 401, "Email or password is wrong.");
  if (user.bannedAt) return fail(res, 403, "This account is banned.");
  await issueSession(res, user.id, req);
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

router.post("/auth/logout", requireUser, async (_req, res) => {
  const token = _req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", async (_req, res) => {
  const session = res.locals.auth ? auth(res) : null;
  if (!session) return res.json({ user: null });
  const rank = await rankOfUser(session.user.id, session.user.xp);
  const unread = await prisma.notification.count({ where: { userId: session.user.id, readAt: null } });
  res.json({
    user: {
      ...session.user,
      passwordHash: undefined,
      rank,
      walletAddress: session.user.wallets[0]?.address ?? null,
      unreadCount: unread,
    },
  });
});

router.post("/auth/wallet/challenge", requireUser, async (_req, res) => {
  const user = auth(res).user;
  const message = `Touchline wants to link this wallet.\nUser: ${user.id}\nNonce: ${newToken()}`;
  await redis.set(`wallet:challenge:${user.id}`, message, "EX", 300);
  res.json({ message });
});

router.post("/auth/wallet/verify", requireUser, async (req, res) => {
  const body = parse(walletVerifySchema, req.body, res);
  if (!body) return;
  const user = auth(res).user;
  const expected = await redis.get(`wallet:challenge:${user.id}`);
  if (!expected || expected !== body.message) return fail(res, 400, "That wallet challenge expired.");
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(new TextEncoder().encode(body.message), bs58.decode(body.signature), new PublicKey(body.address).toBytes());
  } catch {
    ok = false;
  }
  if (!ok) return fail(res, 400, "Wallet signature did not match.");
  const taken = await prisma.wallet.findUnique({ where: { address: body.address } });
  if (taken && taken.userId !== user.id) return fail(res, 409, "That wallet is already linked.");
  await prisma.wallet.upsert({
    where: { address: body.address },
    create: { userId: user.id, address: body.address, verifiedAt: new Date() },
    update: { verifiedAt: new Date() },
  });
  await redis.del(`wallet:challenge:${user.id}`);
  res.json({ address: body.address });
});

router.patch("/users/me", requireUser, async (req, res) => {
  const body = parse(profileSchema, req.body, res);
  if (!body) return;
  const user = await prisma.user.update({ where: { id: auth(res).user.id }, data: body, select: userSelect });
  res.json({ user });
});

router.post("/users/me/password", requireUser, async (req, res) => {
  const body = parse(passwordChangeSchema, req.body, res);
  if (!body) return;
  const user = await prisma.user.findUnique({ where: { id: auth(res).user.id } });
  if (!user || !(await checkPassword(body.currentPassword, user.passwordHash))) {
    return fail(res, 400, "Current password is wrong.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  res.json({ ok: true });
});

router.post("/users/me/avatar", requireUser, async (req, res) => {
  const body = parse(avatarUploadSchema, req.body, res);
  if (!body) return;
  const match = body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return fail(res, 400, "Use a JPEG, PNG, or WebP photo.");
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buf = Buffer.from(match[2] ?? "", "base64");
  if (buf.length > 400_000) return fail(res, 400, "Photo must be under 400KB.");
  const userId = auth(res).user.id;
  for (const file of readdirSync(avatarDir)) {
    if (file.startsWith(`${userId}.`)) unlinkSync(path.join(avatarDir, file));
  }
  writeFileSync(path.join(avatarDir, `${userId}.${ext}`), buf);
  const host = `${req.protocol}://${req.get("host") ?? "localhost:4000"}`;
  const avatarUrl = avatarPublicUrl(host, userId, ext ?? "jpg");
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl }, select: userSelect });
  res.json({ user });
});

router.get("/users/:id", async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: req.params.id }, { username: req.params.id.toLowerCase() }], bannedAt: null },
    select: userSelect,
  });
  if (!user) return fail(res, 404, "No such fan.");
  const [rank, predictions, correct] = await Promise.all([
    rankOfUser(user.id, user.xp),
    prisma.prediction.count({ where: { userId: user.id, status: "CONFIRMED" } }),
    prisma.prediction.count({ where: { userId: user.id, result: "CORRECT" } }),
  ]);
  res.json({ user: { ...user, rank }, predictions, correct, accuracy: predictions ? correct / predictions : null });
});

router.get("/home", async (_req, res) => {
  const user = res.locals.auth ? auth(res).user : null;
  const [live, recent, soon, trending, leaders, health] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: ["LIVE", "HALFTIME"] } },
      include: matchInclude,
      orderBy: { kickoffAt: "desc" },
      take: 20,
    }),
    prisma.match.findMany({
      where: { status: "FINISHED", kickoffAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60_000) } },
      include: matchInclude,
      orderBy: { kickoffAt: "desc" },
      take: 6,
    }),
    prisma.match.findMany({
      where: { status: "SCHEDULED", kickoffAt: { gte: new Date(), lte: new Date(Date.now() + 21 * 24 * 60 * 60_000) } },
      include: matchInclude,
      orderBy: { kickoffAt: "asc" },
      take: 24,
    }),
    prisma.market.findMany({
      where: { status: { in: ["OPEN", "TRADING", "PENDING"] }, disabled: false },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { predictions: { where: { status: { in: ["CONFIRMED", "SUBMITTED"] } }, select: { side: true } } },
    }),
    prisma.user.findMany({ where: { bannedAt: null }, orderBy: [{ xp: "desc" }, { id: "asc" }], take: 8, select: userSelect }),
    prisma.providerHealth.findMany(),
  ]);
  const squad = user
    ? await prisma.squadMember.findFirst({
        where: { userId: user.id },
        include: { squad: true },
        orderBy: { joinedAt: "asc" },
      })
    : null;
  let squadRank: number | null = null;
  if (squad) {
    squadRank = (await prisma.squad.count({ where: { xp: { gt: squad.squad.xp } } })) + 1;
  }
  const withWatching = async (rows: typeof live) =>
    Promise.all(rows.map(async (row) => matchJson(row, row.matchroom ? await presenceCount(row.matchroom.id) : 0)));
  const playable = (rows: typeof live) => rows.filter((row) => isFeaturedCompetition(row.competition.name));
  const byKickoff = (rows: typeof live) =>
    [...rows].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime() || competitionWeight(a.competition.name) - competitionWeight(b.competition.name));
  res.json({
    user: user ? { displayName: user.displayName, username: user.username, xp: user.xp, rank: await rankOfUser(user.id, user.xp) } : null,
    live: await withWatching(byKickoff(playable(live)).slice(0, 6)),
    recent: await withWatching(playable(recent)),
    soon: await withWatching(byKickoff(playable(soon)).slice(0, 8)),
    squad: squad ? { id: squad.squad.id, name: squad.squad.name, xp: squad.squad.xp, rank: squadRank, members: await prisma.squadMember.count({ where: { squadId: squad.squad.id } }) } : null,
    trending: trending.map((row) =>
      marketJson({
        ...row,
        yesCalls: row.predictions.filter((p) => p.side === "YES").length,
        noCalls: row.predictions.filter((p) => p.side === "NO").length,
      }),
    ),
    leaders: leaders.map((row, index) => ({ ...row, rank: index + 1 })),
    provider: {
      football: health.some((row) => row.id !== "panta" && row.status === "up")
        ? "up"
        : health.some((row) => row.id !== "panta")
          ? "down"
          : "unconfigured",
      panta: health.find((row) => row.id === "panta")?.status ?? "unconfigured",
      feeds: health.filter((row) => row.id !== "panta").map((row) => ({ id: row.id, status: row.status, detail: row.detail })),
    },
  });
});

router.get("/competitions", async (_req, res) => {
  const competitions = await prisma.competition.findMany({ orderBy: { name: "asc" } });
  res.json({
    competitions: [...competitions].sort((a, b) => competitionWeight(a.name) - competitionWeight(b.name)),
    featured: FEATURED_COMPETITIONS.map((row) => ({ id: row.id, label: row.label })),
  });
});

router.get("/teams", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const teams = await prisma.team.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { name: "asc" },
    take: 40,
  });
  res.json({ teams });
});

router.get("/players", async (req, res) => {
  const teamId = String(req.query.teamId ?? "");
  const players = await prisma.player.findMany({
    where: teamId ? { teamId } : undefined,
    orderBy: { name: "asc" },
    take: 80,
  });
  res.json({ players });
});

router.get("/matches", async (req, res) => {
  const tz = Number(req.query.tz ?? 0);
  const shift = Number.isFinite(tz) ? tz * 60_000 : 0;
  const localNow = new Date(Date.now() + shift);
  const start = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - shift);
  const day = 24 * 60 * 60_000;
  const where: Prisma.MatchWhereInput = {};
  const when = String(req.query.when ?? "");
  if (when === "live") where.status = { in: ["LIVE", "HALFTIME"] };
  if (when === "soon" || when === "upcoming") {
    where.status = "SCHEDULED";
    where.kickoffAt = { gte: new Date(Date.now() - 60 * 60_000), lte: new Date(Date.now() + 21 * 24 * 60 * 60_000) };
  }
  if (when === "results") {
    where.status = "FINISHED";
    where.kickoffAt = { gte: new Date(Date.now() - 14 * 24 * 60 * 60_000) };
  }
  if (when === "today") where.kickoffAt = { gte: start, lt: new Date(start.getTime() + day) };
  if (when === "tomorrow") where.kickoffAt = { gte: new Date(start.getTime() + day), lt: new Date(start.getTime() + 2 * day) };
  if (typeof req.query.competitionId === "string") where.competitionId = req.query.competitionId;
  const leagueSlug = typeof req.query.league === "string" ? req.query.league : "";
  const featured = FEATURED_COMPETITIONS.find((row) => row.id === leagueSlug);
  if (typeof req.query.teamId === "string") where.OR = [{ homeTeamId: req.query.teamId }, { awayTeamId: req.query.teamId }];
  const matches = await prisma.match.findMany({ where, include: matchInclude, orderBy: [{ status: "asc" }, { kickoffAt: "asc" }], take: 160 });
  const scoped = matches.filter((row) => {
    if (!isFeaturedCompetition(row.competition.name)) return false;
    if (featured && !featured.match.test(row.competition.name)) return false;
    return true;
  });
  const ranked = [...scoped].sort((a, b) => {
    const weight = (status: string) => (status === "LIVE" || status === "HALFTIME" ? 0 : status === "SCHEDULED" ? 1 : 2);
    return (
      weight(a.status) - weight(b.status) ||
      a.kickoffAt.getTime() - b.kickoffAt.getTime() ||
      competitionWeight(a.competition.name) - competitionWeight(b.competition.name)
    );
  });
  res.json({
    matches: await Promise.all(ranked.slice(0, 80).map(async (row) => matchJson(row, row.matchroom ? await presenceCount(row.matchroom.id) : 0))),
  });
});

router.get("/matches/:id", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: matchInclude });
  if (!match) return fail(res, 404, "No such match.");
  res.json({ match: matchJson(match, match.matchroom ? await presenceCount(match.matchroom.id) : 0) });
});

router.get("/matches/:id/events", async (req, res) => {
  const events = await prisma.footballEvent.findMany({
    where: { matchId: req.params.id },
    orderBy: [{ minute: "desc" }, { extraMinute: "desc" }],
  });
  res.json({
    events: events.map((event) => ({
      id: event.id,
      providerEventId: event.providerEventId,
      type: event.type,
      minute: event.minute,
      extraMinute: event.extraMinute,
      teamProviderId: event.teamProviderId,
      playerName: event.playerName,
      relatedPlayerName: event.relatedPlayerName,
      detail: event.detail,
    })),
  });
});

router.get("/matches/:id/stats", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: { events: true } });
  if (!match) return fail(res, 404, "No such match.");
  res.json({
    score: { home: match.homeScore, away: match.awayScore, htHome: match.htHomeScore, htAway: match.htAwayScore },
    events: match.events.length,
  });
});

router.get("/matches/:id/room", async (req, res) => {
  await enrichMatchDetail(req.params.id).catch(() => undefined);
  const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: { ...matchInclude, events: { orderBy: [{ minute: "asc" }] }, lineups: { include: { player: true } }, videos: true } });
  if (!match?.matchroom) return fail(res, 404, "No matchroom yet.");
  const viewer = res.locals.auth ? auth(res).user.id : null;
  const blocks = viewer
    ? await prisma.block.findMany({ where: { blockerId: viewer }, select: { blockedId: true } })
    : [];
  const hidden = new Set(blocks.map((row) => row.blockedId));
  if (match.status === "SCHEDULED") await syncPrematch(match.id).catch(() => undefined);
  const [markets, messages, members] = await Promise.all([
    prisma.market.findMany({
      where: { matchId: match.id, disabled: false },
      orderBy: { createdAt: "desc" },
      take: 16,
      include: { predictions: { where: { status: { in: ["CONFIRMED", "SUBMITTED"] } }, select: { side: true, userId: true, result: true } } },
    }),
    prisma.chatMessage.findMany({
      where: { matchroomId: match.matchroom.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: { select: userSelect } },
    }),
    prisma.matchroomMember.findMany({
      where: { matchroomId: match.matchroom.id },
      include: { user: { select: userSelect } },
      orderBy: { user: { xp: "desc" } },
      take: 20,
    }),
  ]);
  const visible = messages.filter((message) => !hidden.has(message.userId)).reverse();
  const parentIds = [...new Set(visible.map((row) => row.replyToId).filter((id): id is string => Boolean(id)))];
  const parents = parentIds.length
    ? await prisma.chatMessage.findMany({
        where: { id: { in: parentIds } },
        include: { user: { select: { displayName: true } } },
      })
    : [];
  const parentById = new Map(parents.map((row) => [row.id, row]));
  let squadIds = new Set<string>();
  if (viewer) {
    const membership = await prisma.squadMember.findFirst({ where: { userId: viewer }, select: { squadId: true } });
    if (membership) {
      const mates = await prisma.squadMember.findMany({ where: { squadId: membership.squadId }, select: { userId: true } });
      squadIds = new Set(mates.map((row) => row.userId));
    }
  }
  res.json({
    match: matchJson(match, await presenceCount(match.matchroom.id)),
    disabled: match.matchroom.disabled,
    events: match.events.map((event) => ({
      ...event,
      teamName:
        event.teamProviderId === match.homeTeam.providerId
          ? match.homeTeam.name
          : event.teamProviderId === match.awayTeam.providerId
            ? match.awayTeam.name
            : null,
    })),
    markets: markets.map((row) =>
      marketJson({
        ...row,
        yesCalls: row.predictions.filter((p) => p.side === "YES").length,
        noCalls: row.predictions.filter((p) => p.side === "NO").length,
        mySide: viewer ? (row.predictions.find((p) => p.userId === viewer && p.result === "PENDING")?.side ?? null) : null,
        squadYes: row.predictions.filter((p) => squadIds.has(p.userId) && p.side === "YES").length,
        squadNo: row.predictions.filter((p) => squadIds.has(p.userId) && p.side === "NO").length,
      }),
    ),
    messages: visible.map((message) => {
      const parent = message.replyToId ? parentById.get(message.replyToId) : null;
      return {
        ...message,
        replyTo: parent ? { id: parent.id, body: parent.body, user: { displayName: parent.user.displayName } } : null,
      };
    }),
    members: members.map((member) => member.user),
    joined: viewer ? members.some((member) => member.user.id === viewer) || (await prisma.matchroomMember.findUnique({ where: { matchroomId_userId: { matchroomId: match.matchroom.id, userId: viewer } } })) != null : false,
    matchroomId: match.matchroom.id,
    watch: match.matchroom.watchUrl ? parseWatchUrl(match.matchroom.watchUrl) : null,
    broadcasts: match.broadcasts,
    officialWatch: officialWatchFor(match.competition.name),
    videos: [...match.videos]
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        url: row.url,
        provider: row.provider,
        externalId: row.externalId,
        embeddable: row.embeddable,
        featured: row.featured,
      })),
    formations: { home: match.homeFormation, away: match.awayFormation },
    lineups: {
      home: match.lineups.filter((row) => row.teamId === match.homeTeamId).map(lineupJson),
      away: match.lineups.filter((row) => row.teamId === match.awayTeamId).map(lineupJson),
    },
  });
});

function lineupJson(row: { starter: boolean; position: string | null; jersey: number | null; grid: string | null; player: { id: string; name: string; imageUrl: string | null; providerId?: string } }) {
  return {
    id: row.player.id,
    name: row.player.name,
    imageUrl: row.player.imageUrl ?? playerHeadshotUrl(row.player.providerId),
    starter: row.starter,
    position: row.position,
    jersey: row.jersey,
    grid: row.grid,
  };
}

router.post("/matchrooms/:id/watch", requireUser, async (req, res) => {
  const body = parse(z.object({ url: z.string().url().max(500) }), req.body, res);
  if (!body) return;
  const parsed = parseWatchUrl(body.url);
  if (!parsed) return fail(res, 400, "Use an official YouTube or Twitch link.");
  const room = await prisma.matchroom.findUnique({ where: { id: req.params.id } });
  if (!room || room.disabled) return fail(res, 404, "Matchroom is unavailable.");
  const member = await prisma.matchroomMember.findUnique({
    where: { matchroomId_userId: { matchroomId: room.id, userId: auth(res).user.id } },
  });
  if (!member) return fail(res, 403, "Join the terrace first.");
  await prisma.matchroom.update({ where: { id: room.id }, data: { watchUrl: parsed.source } });
  res.json({ watch: parsed });
});

router.post("/matchrooms/:id/join", requireUser, async (req, res) => {
  const room = await prisma.matchroom.findUnique({ where: { id: req.params.id }, include: { match: { include: { homeTeam: true, awayTeam: true } } } });
  if (!room || room.disabled) return fail(res, 404, "Matchroom is unavailable.");
  const user = auth(res).user;
  await prisma.matchroomMember.upsert({
    where: { matchroomId_userId: { matchroomId: room.id, userId: user.id } },
    create: { matchroomId: room.id, userId: user.id },
    update: { lastSeenAt: new Date() },
  });
  await metric("active_matchrooms", 0);
  res.json({ matchroomId: room.id, matchId: room.matchId });
});

router.post("/matchrooms/:id/leave", requireUser, async (req, res) => {
  await prisma.matchroomMember.deleteMany({ where: { matchroomId: req.params.id, userId: auth(res).user.id } });
  res.json({ ok: true });
});

router.get("/matchrooms/:id", async (req, res) => {
  const room = await prisma.matchroom.findUnique({ where: { id: req.params.id }, include: { match: { include: matchInclude } } });
  if (!room) return fail(res, 404, "No matchroom.");
  res.json({ matchroom: { id: room.id, disabled: room.disabled, match: matchJson(room.match, await presenceCount(room.id)) } });
});

router.post("/matchrooms/:id/messages", requireUser, async (req, res) => {
  const body = parse(chatSchema, { ...req.body, channel: "MATCHROOM", matchroomId: req.params.id }, res);
  if (!body?.matchroomId) return;
  try {
    const message = await postMessage({ ...body, matchroomId: body.matchroomId, userId: auth(res).user.id });
    res.status(201).json({ message });
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : "Could not send.");
  }
});

router.post("/squads/:id/messages", requireUser, async (req, res) => {
  const body = parse(chatSchema, { ...req.body, channel: "SQUAD", squadId: req.params.id }, res);
  if (!body?.squadId) return;
  try {
    const message = await postMessage({ ...body, squadId: body.squadId, userId: auth(res).user.id });
    res.status(201).json({ message });
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : "Could not send.");
  }
});

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "squad";
  return `${base}-${newToken().slice(0, 4).toLowerCase()}`;
}

async function squadStats(squadId: string) {
  const squad = await prisma.squad.findUnique({ where: { id: squadId }, include: { members: { include: { user: { select: userSelect } } } } });
  if (!squad) return null;
  const ids = squad.members.map((member) => member.userId);
  const [predictions, correct, rank] = await Promise.all([
    prisma.prediction.count({ where: { userId: { in: ids }, status: "CONFIRMED" } }),
    prisma.prediction.count({ where: { userId: { in: ids }, result: "CORRECT" } }),
    prisma.squad.count({ where: { xp: { gt: squad.xp } } }),
  ]);
  const top = [...squad.members].sort((a, b) => b.user.xp - a.user.xp)[0];
  return {
    id: squad.id,
    name: squad.name,
    slug: squad.slug,
    logoUrl: squad.logoUrl,
    description: squad.description,
    inviteCode: squad.inviteCode,
    xp: squad.xp,
    members: squad.members.length,
    rank: rank + 1,
    predictions,
    correct,
    accuracy: predictions ? correct / predictions : null,
    topPredictor: top ? { username: top.user.username, displayName: top.user.displayName, xp: top.user.xp } : null,
    roster: squad.members
      .map((member) => ({ ...member.user, role: member.role }))
      .sort((a, b) => b.xp - a.xp),
  };
}

router.get("/squads", async (req, res) => {
  const mine = req.query.mine === "1";
  const user = res.locals.auth ? auth(res).user : null;
  if (mine && !user) return fail(res, 401, "Sign in required.");
  const squads = await prisma.squad.findMany({
    where: mine && user ? { members: { some: { userId: user.id } } } : undefined,
    orderBy: { xp: "desc" },
    take: 40,
    include: { _count: { select: { members: true } } },
  });
  res.json({
    squads: await Promise.all(
      squads.map(async (squad) => ({
        id: squad.id,
        name: squad.name,
        xp: squad.xp,
        members: squad._count.members,
        rank: (await prisma.squad.count({ where: { xp: { gt: squad.xp } } })) + 1,
      })),
    ),
  });
});

router.post("/squads", requireUser, async (req, res) => {
  const body = parse(createSquadSchema, req.body, res);
  if (!body) return;
  const user = auth(res).user;
  const squad = await prisma.squad.create({
    data: {
      name: body.name,
      slug: slugify(body.name),
      description: body.description,
      logoUrl: body.logoUrl,
      inviteCode: newToken().slice(0, 8),
      createdById: user.id,
      members: { create: { userId: user.id, role: "owner" } },
    },
  });
  res.status(201).json({ squad });
});

router.post("/squads/join", requireUser, async (req, res) => {
  const body = parse(joinCodeSchema, req.body, res);
  if (!body) return;
  const squad = await prisma.squad.findUnique({ where: { inviteCode: body.inviteCode } });
  if (!squad) return fail(res, 404, "Invite code not found.");
  const count = await prisma.squadMember.count({ where: { squadId: squad.id } });
  if (count >= 50) return fail(res, 400, "That squad is full.");
  await prisma.squadMember.upsert({
    where: { squadId_userId: { squadId: squad.id, userId: auth(res).user.id } },
    create: { squadId: squad.id, userId: auth(res).user.id },
    update: {},
  });
  const others = await prisma.squadMember.findMany({ where: { squadId: squad.id, userId: { not: auth(res).user.id } } });
  for (const member of others) {
    await notify(member.userId, {
      type: "SQUAD_JOIN",
      title: `${auth(res).user.displayName} joined`,
      body: squad.name,
      href: `/squads/${squad.id}`,
    });
  }
  res.json({ squadId: squad.id });
});

router.get("/squads/:id", async (req, res) => {
  const stats = await squadStats(req.params.id);
  if (!stats) return fail(res, 404, "No such squad.");
  const viewer = res.locals.auth ? auth(res).user.id : null;
  const messages = await prisma.chatMessage.findMany({
    where: { squadId: req.params.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { user: { select: userSelect } },
  });
  res.json({ squad: stats, joined: viewer ? stats.roster.some((member) => member.id === viewer) : false, messages: messages.reverse() });
});

router.post("/squads/:id/invites", requireUser, async (req, res) => {
  const body = parse(inviteSchema, req.body, res);
  if (!body) return;
  const member = await prisma.squadMember.findUnique({
    where: { squadId_userId: { squadId: req.params.id, userId: auth(res).user.id } },
  });
  if (!member) return fail(res, 403, "Join the squad first.");
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const sent = await prisma.squadInvite.count({ where: { squadId: req.params.id, createdAt: { gt: since } } });
  if (sent >= 20) return fail(res, 429, "Invite limit reached for today.");
  const invite = await prisma.squadInvite.create({
    data: { squadId: req.params.id, invitedById: auth(res).user.id, username: body.username },
  });
  const target = await prisma.user.findUnique({ where: { username: body.username } });
  if (target) {
    await notify(target.id, {
      type: "SQUAD_JOIN",
      title: "Squad invite",
      body: `${auth(res).user.displayName} invited you.`,
      href: `/squads/${req.params.id}`,
    });
  }
  res.status(201).json({ invite });
});

router.post("/squads/:id/leave", requireUser, async (req, res) => {
  const userId = auth(res).user.id;
  const member = await prisma.squadMember.findUnique({ where: { squadId_userId: { squadId: req.params.id, userId } } });
  if (!member) return fail(res, 404, "You are not in that squad.");
  await prisma.squadMember.delete({ where: { id: member.id } });
  const remaining = await prisma.squadMember.findMany({ where: { squadId: req.params.id }, orderBy: { joinedAt: "asc" } });
  if (remaining.length === 0) await prisma.squad.delete({ where: { id: req.params.id } });
  else if (member.role === "owner") {
    await prisma.squadMember.update({ where: { id: remaining[0]!.id }, data: { role: "owner" } });
  }
  res.json({ ok: true });
});

router.get("/squads/:id/members", async (req, res) => {
  const stats = await squadStats(req.params.id);
  if (!stats) return fail(res, 404, "No such squad.");
  res.json({ members: stats.roster });
});

router.get("/squads/:id/leaderboard", async (req, res) => {
  const stats = await squadStats(req.params.id);
  if (!stats) return fail(res, 404, "No such squad.");
  res.json({ leaderboard: stats.roster.map((member, index) => ({ rank: index + 1, ...member })) });
});

router.get("/squads/:id/compare", async (req, res) => {
  const other = String(req.query.other ?? "");
  const [left, right] = await Promise.all([squadStats(req.params.id), squadStats(other)]);
  if (!left || !right) return fail(res, 404, "Need two squads to compare.");
  res.json({ squads: [left, right] });
});

router.get("/markets", async (req, res) => {
  const matchId = typeof req.query.matchId === "string" ? req.query.matchId : undefined;
  const markets = await prisma.market.findMany({
    where: { disabled: false, ...(matchId ? { matchId } : { status: { in: ["OPEN", "TRADING", "PENDING", "AWAITING_SIGNATURE"] } }) },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  res.json({ markets: markets.map(marketJson) });
});

router.get("/markets/:id", async (req, res) => {
  const market = await prisma.market.findUnique({ where: { id: req.params.id } });
  if (!market) return fail(res, 404, "No such market.");
  res.json({ market: marketJson(market) });
});

router.post("/markets/:id/call", requireUser, async (req, res) => {
  const body = parse(z.object({ side: z.enum(["yes", "no"]) }), req.body, res);
  if (!body) return;
  try {
    const prediction = await paperCall({ userId: auth(res).user.id, marketId: req.params.id, side: body.side });
    res.json({ predictionId: prediction.id, side: prediction.side });
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : "Could not take a side.");
  }
});

router.post("/markets/:id/quote", requireUser, async (req, res) => {
  const body = parse(quoteBuySchema, req.body, res);
  if (!body) return;
  const user = auth(res).user;
  const wallet = user.wallets[0]?.address;
  if (!wallet) return fail(res, 400, "Connect a wallet to take a side.");
  const amount = Number(body.amountUsdc);
  if (!Number.isFinite(amount) || amount < 1 || amount > 500) return fail(res, 400, "Amount must be between 1 and 500 USDC.");
  const gate = await redis.set(`predict:${user.id}`, "1", "EX", 2, "NX");
  if (gate !== "OK") return fail(res, 429, "Slow down a moment.");
  try {
    const quote = await quoteForUser({ userId: user.id, marketId: req.params.id, side: body.side, amountUsdc: body.amountUsdc, wallet });
    res.json(quote);
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : "Markets temporarily unavailable.");
  }
});

router.post("/markets/:id/build", requireUser, async (req, res) => {
  const body = parse(buildBuySchema, req.body, res);
  if (!body) return;
  const wallet = auth(res).user.wallets[0]?.address;
  if (!wallet) return fail(res, 400, "Connect a wallet to take a side.");
  try {
    const built = await buildForUser({ userId: auth(res).user.id, quoteId: body.quoteId, wallet, maxSlippageBps: body.maxSlippageBps });
    res.json(built);
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : "Markets temporarily unavailable.");
  }
});

router.post("/markets/:id/submit", requireUser, async (req, res) => {
  const body = parse(submitBuySchema, req.body, res);
  if (!body) return;
  const wallet = auth(res).user.wallets[0]?.address;
  if (!wallet) return fail(res, 400, "Connect a wallet to take a side.");
  try {
    const submitted = await submitForUser({ userId: auth(res).user.id, orderId: body.orderId, signature: body.signature, wallet });
    res.json(submitted);
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : "Markets temporarily unavailable.");
  }
});

router.get("/predictions", requireUser, async (req, res) => {
  const user = auth(res).user;
  const rows = await prisma.prediction.findMany({
    where: { userId: user.id },
    include: { market: { include: { match: { include: { homeTeam: true, awayTeam: true, competition: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const wallet = user.wallets[0]?.address;
  const positions = wallet && panta.configured ? await panta.getPositions(wallet).catch(() => []) : [];
  const byMarket = new Map(positions.map((row) => [`${row.marketId}:${row.side}`, row]));
  res.json({
    predictions: rows.map((row) => {
      const pos = row.market.pantaMarketId
        ? byMarket.get(`${row.market.pantaMarketId}:${row.side.toLowerCase()}`)
        : undefined;
      const claimable = Boolean(pos?.claimable) && !row.claimedAt && row.result !== "INCORRECT";
      return {
        id: row.id,
        side: row.side,
        status: row.status,
        result: row.result,
        amountUsdc: row.amountUsdc.toString(),
        shares: row.shares?.toString() ?? pos?.shares ?? null,
        avgPrice: row.avgPrice?.toString() ?? null,
        xpAwarded: row.xpAwarded,
        signature: row.signature,
        explorerUrl: row.signature ? explorerTxUrl(row.signature) : null,
        claimExplorerUrl: row.claimSignature ? explorerTxUrl(row.claimSignature) : null,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        claimable,
        createdAt: row.createdAt.toISOString(),
        match: {
          id: row.market.matchId,
          home: row.market.match.homeTeam.name,
          away: row.market.match.awayTeam.name,
          competition: row.market.match.competition.name,
        },
        market: marketJson(row.market),
      };
    }),
  });
});

router.post("/predictions/:id/claim/build", requireUser, async (req, res) => {
  const wallet = auth(res).user.wallets[0]?.address;
  if (!wallet) return fail(res, 400, "Connect a wallet to claim.");
  try {
    const built = await buildWinClaimForUser({ userId: auth(res).user.id, predictionId: req.params.id, wallet });
    res.json(built);
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : "Could not build the claim.");
  }
});

router.post("/predictions/:id/claim/submit", requireUser, async (req, res) => {
  const body = parse(z.object({ signature: z.string().min(32) }), req.body, res);
  if (!body) return;
  const wallet = auth(res).user.wallets[0]?.address;
  if (!wallet) return fail(res, 400, "Connect a wallet to claim.");
  try {
    const done = await submitWinClaimForUser({
      userId: auth(res).user.id,
      predictionId: req.params.id,
      signature: body.signature,
      wallet,
    });
    res.json(done);
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : "Could not record the claim.");
  }
});

router.get("/leaderboards", async (req, res) => {
  const scope = String(req.query.scope ?? "global");
  if (scope === "squad" && typeof req.query.squadId === "string") {
    const stats = await squadStats(req.query.squadId);
    return res.json({ leaderboard: stats?.roster.map((member, index) => ({ rank: index + 1, ...member })) ?? [] });
  }
  if (scope === "match" && typeof req.query.matchId === "string") {
    const grouped = await prisma.prediction.groupBy({
      by: ["userId"],
      where: { market: { matchId: req.query.matchId }, xpAwarded: { gt: 0 } },
      _sum: { xpAwarded: true },
      orderBy: { _sum: { xpAwarded: "desc" } },
      take: 30,
    });
    const users = await prisma.user.findMany({ where: { id: { in: grouped.map((row) => row.userId) } }, select: userSelect });
    const byId = new Map(users.map((user) => [user.id, user]));
    return res.json({
      leaderboard: grouped.map((row, index) => ({ rank: index + 1, xp: row._sum.xpAwarded ?? 0, ...byId.get(row.userId) })),
    });
  }
  if (scope === "season") {
    const season = String(req.query.season ?? "all");
    const rows = await prisma.xPTransaction.groupBy({
      by: ["userId"],
      where: { seasonKey: season },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 50,
    });
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: userSelect });
    const byId = new Map(users.map((user) => [user.id, user]));
    return res.json({ leaderboard: rows.map((row, index) => ({ rank: index + 1, xp: row._sum.amount ?? 0, ...byId.get(row.userId) })) });
  }
  const users = await prisma.user.findMany({
    where: { bannedAt: null },
    orderBy: [{ xp: "desc" }, { id: "asc" }],
    take: 50,
    select: userSelect,
  });
  res.json({ leaderboard: users.map((user, index) => ({ rank: index + 1, ...user })) });
});

router.get("/rankings", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { bannedAt: null },
    orderBy: [{ xp: "desc" }, { id: "asc" }],
    take: 50,
    select: { ...userSelect, bestStreak: true },
  });
  const settled = await prisma.prediction.findMany({
    where: { userId: { in: users.map((row) => row.id) }, result: { in: ["CORRECT", "INCORRECT"] } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, result: true },
  });
  const formByUser = new Map<string, string[]>();
  for (const row of settled) {
    const list = formByUser.get(row.userId) ?? [];
    if (list.length >= 5) continue;
    list.push(row.result === "CORRECT" ? "W" : "L");
    formByUser.set(row.userId, list);
  }
  const squads = await prisma.squad.findMany({ orderBy: { xp: "desc" }, take: 20 });
  res.json({
    users: users.map((user, index) => ({ rank: index + 1, ...user, form: formByUser.get(user.id) ?? [] })),
    squads: squads.map((squad, index) => ({ rank: index + 1, id: squad.id, name: squad.name, xp: squad.xp })),
    season: req.query.season ?? null,
  });
});

router.get("/notifications", requireUser, async (_req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: auth(res).user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  res.json({ notifications });
});

router.post("/notifications/read", requireUser, async (_req, res) => {
  await prisma.notification.updateMany({ where: { userId: auth(res).user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

router.post("/reports", requireUser, async (req, res) => {
  const body = parse(reportSchema, req.body, res);
  if (!body) return;
  const report = await prisma.report.create({
    data: { reporterId: auth(res).user.id, reason: body.reason, messageId: body.messageId, targetUserId: body.targetUserId },
  });
  res.status(201).json({ report });
});

router.post("/blocks", requireUser, async (req, res) => {
  const body = parse(z.object({ userId: z.string().cuid() }), req.body, res);
  if (!body) return;
  if (body.userId === auth(res).user.id) return fail(res, 400, "You can't block yourself.");
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: auth(res).user.id, blockedId: body.userId } },
    create: { blockerId: auth(res).user.id, blockedId: body.userId },
    update: {},
  });
  res.json({ ok: true });
});

router.delete("/messages/:id", requireUser, async (req, res) => {
  const message = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!message || message.userId !== auth(res).user.id) return fail(res, 404, "Message not found.");
  await prisma.chatMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), body: "" } });
  res.json({ ok: true });
});

const admin = Router();
admin.use(requireAdmin);

admin.get("/overview", async (_req, res) => {
  const [live, rooms, markets, reports, health, logs, metrics] = await Promise.all([
    prisma.match.findMany({ where: { status: { in: ["LIVE", "HALFTIME"] } }, include: matchInclude, take: 20 }),
    prisma.matchroom.count({ where: { disabled: false } }),
    prisma.market.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.report.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 30, include: { reporter: { select: userSelect } } }),
    prisma.providerHealth.findMany(),
    prisma.marketGenerationLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    readMetrics(),
  ]);
  const users = await prisma.user.count();
  res.json({
    live: live.map((row) => matchJson(row)),
    activeMatchrooms: rooms,
    activeUsers: users,
    markets: markets.map(marketJson),
    reports,
    health,
    logs,
    metrics,
  });
});

admin.post("/markets/:id/disable", async (req, res) => {
  await prisma.market.update({ where: { id: req.params.id }, data: { disabled: true, status: "DISABLED" } });
  await prisma.auditLog.create({ data: { actorId: auth(res).user.id, action: "DISABLE_MARKET", entity: "Market", entityId: req.params.id } });
  res.json({ ok: true });
});

admin.post("/matchrooms/:id/disable", async (req, res) => {
  await prisma.matchroom.update({ where: { id: req.params.id }, data: { disabled: true } });
  await prisma.auditLog.create({ data: { actorId: auth(res).user.id, action: "DISABLE_ROOM", entity: "Matchroom", entityId: req.params.id } });
  res.json({ ok: true });
});

admin.post("/users/:id/ban", async (req, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { bannedAt: new Date() } });
  await prisma.session.deleteMany({ where: { userId: req.params.id } });
  await prisma.auditLog.create({ data: { actorId: auth(res).user.id, action: "BAN", entity: "User", entityId: req.params.id } });
  res.json({ ok: true });
});

admin.post("/users/:id/mute", async (req, res) => {
  const body = parse(muteSchema, req.body, res);
  if (!body) return;
  await prisma.user.update({
    where: { id: req.params.id },
    data: { mutedUntil: new Date(Date.now() + body.minutes * 60_000) },
  });
  res.json({ ok: true });
});

admin.post("/markets/:id/prepare", async (req, res) => {
  const wallet = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).safeParse(req.body?.wallet);
  if (!wallet.success) return fail(res, 400, "Wallet address required.");
  try {
    const built = await beginCreate(req.params.id, wallet.data);
    res.json(built);
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : "prepare failed" }, "admin prepare");
    fail(res, 503, error instanceof Error ? error.message : "Markets temporarily unavailable.");
  }
});

admin.post("/markets/:id/register", async (req, res) => {
  const body = parse(registerMarketSchema, req.body, res);
  if (!body) return;
  try {
    const market = await finishCreate(req.params.id, body.createId, body.signature);
    res.json({ pantaMarketId: market.pantaMarketId });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : "Register failed.");
  }
});

admin.post("/sync", async (_req, res) => {
  await syncWindow();
  await syncLive();
  res.json({ ok: true });
});

router.use("/admin", admin);

export default router;
