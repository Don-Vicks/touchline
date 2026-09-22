import { readFileSync } from "node:fs";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { Prisma } from "@prisma/client";
import {
  evaluate,
  observeOutcome,
  validateCandidate,
  TEMPLATES,
  type EngineEvent,
  type MatchSnapshot,
  type MarketCandidate,
} from "@touchline/market-engine";
import type { DomainMatchStatus, FootballEventType } from "@touchline/football-domain";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { metric } from "../redis";
import { publish } from "../realtime";
import { PantaNotConfigured, panta } from "../integrations/panta";
import { postMessage } from "./chat";
import { notify } from "./notify";
import { settleMarket } from "./xp";

const OPEN = ["PENDING", "AWAITING_SIGNATURE", "OPEN", "TRADING"] as const;

export async function ensureTemplates() {
  for (const template of TEMPLATES) {
    await prisma.marketTemplate.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        name: template.name,
        category: template.category,
        trigger: template.trigger,
        questionTemplate: template.name,
        resolutionRule: template.trigger,
      },
      update: { name: template.name, category: template.category, trigger: template.trigger },
    });
  }
}

function imageUrl() {
  const url = config.pantaImageUrl;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) return null;
    return url;
  } catch {
    return null;
  }
}

async function disabledTemplates() {
  const rows = await prisma.marketTemplate.findMany({ where: { enabled: false } });
  return new Set(rows.map((row) => row.id));
}

export async function persistCandidates(matchId: string, candidates: MarketCandidate[]) {
  const disabled = await disabledTemplates();
  const openCount = await prisma.market.count({
    where: { matchId, status: { in: [...OPEN] }, disabled: false },
  });
  let created = 0;
  for (const candidate of candidates) {
    if (disabled.has(candidate.templateId)) continue;
    const validation = validateCandidate(candidate);
    if (!validation.ok) {
      await prisma.marketGenerationLog.create({
        data: { matchId, level: "skip", message: validation.reasons.join(" "), detail: { template: candidate.templateId } },
      });
      await metric("markets_failed");
      continue;
    }
    if (candidate.marketType === "breaking" && openCount + created >= 6) continue;
    const clash = await prisma.market.findFirst({
      where: {
        matchId,
        templateId: candidate.templateId,
        subject: candidate.subject ?? null,
        status: { in: ["OPEN", "TRADING", "AWAITING_SIGNATURE", "PENDING"] },
      },
    });
    if (clash) continue;
    try {
      const market = await prisma.market.create({
        data: {
          matchId,
          templateId: candidate.templateId,
          category: candidate.category,
          question: candidate.question,
          resolutionRule: candidate.resolutionRule,
          resolutionSource: candidate.resolutionSource,
          sourceEventId: candidate.sourceEventId,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          resolutionTime: candidate.resolutionTime,
          marketType: candidate.marketType,
          dedupeKey: candidate.dedupeKey,
          subject: candidate.subject,
          deadlineMinute: candidate.deadlineMinute,
          startMinute: candidate.startMinute,
          teamProviderId: candidate.teamId,
          playerName: candidate.playerName,
          status: "PENDING",
        },
      });
      created += 1;
      await metric("markets_created");
      await attachPanta(market.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      logger.error({ err: error instanceof Error ? error.message : "create failed", matchId }, "market create failed");
      await metric("markets_failed");
    }
  }
}

async function snapshotFor(matchId: string): Promise<MatchSnapshot | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, competition: true },
  });
  if (!match) return null;
  return {
    matchId: match.id,
    status: match.status as DomainMatchStatus,
    minute: match.minute ?? 0,
    kickoffAt: match.kickoffAt,
    expectedDurationMin: (match.lengthMin ?? 90) + 25,
    home: { id: match.homeTeam.providerId, name: match.homeTeam.name },
    away: { id: match.awayTeam.providerId, name: match.awayTeam.name },
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    hasCorners: match.competition.hasCorners,
    hasCards: match.competition.hasCards,
    hasShots: match.competition.hasShots,
    hasLineups: true,
  };
}

export async function onFootballEvent(
  matchId: string,
  event: EngineEvent,
  score: { home: number; away: number; minute: number },
) {
  const base = await snapshotFor(matchId);
  if (!base) return;
  if (base.status !== "LIVE" && base.status !== "HALFTIME") return;
  const candidates = evaluate(
    { ...base, minute: score.minute, homeScore: score.home, awayScore: score.away },
    event,
  );
  await persistCandidates(matchId, candidates);
}

export async function syncPrematch(matchId: string) {
  const base = await snapshotFor(matchId);
  if (!base || base.status !== "SCHEDULED") return;
  await persistCandidates(matchId, evaluate(base, null));
}

export async function refreshEvidence(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, events: { orderBy: { minute: "asc" } }, markets: true },
  });
  if (!match) return;
  const events: EngineEvent[] = match.events.map((event) => ({
    id: event.providerEventId,
    type: event.type as FootballEventType,
    minute: event.minute,
    extraMinute: event.extraMinute,
    teamId: event.teamProviderId,
    playerName: event.playerName,
  }));
  const cornerCount = events.filter((event) => event.type === "CORNER").length;
  const cardCount = events.filter((event) =>
    event.type === "YELLOW_CARD" || event.type === "SECOND_YELLOW" || event.type === "RED_CARD",
  ).length;
  for (const market of match.markets) {
    if (market.status === "RESOLVED" || market.status === "CANCELLED" || market.disabled) continue;
    const evidence = observeOutcome({
      templateId: market.templateId,
      sourceEventId: market.sourceEventId,
      deadlineMinute: market.deadlineMinute,
      teamId: market.teamProviderId,
      playerName: market.playerName,
      homeId: match.homeTeam.providerId,
      awayId: match.awayTeam.providerId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status as DomainMatchStatus,
      minute: match.minute ?? 0,
      cornerCount,
      cardCount,
      events,
    });
    if (evidence !== market.evidence) {
      await prisma.market.update({ where: { id: market.id }, data: { evidence } });
    }
  }
}

function creatorKeypair() {
  if (!config.pantaCreatorKeypair) return null;
  const secret = JSON.parse(readFileSync(config.pantaCreatorKeypair, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export async function beginCreate(marketId: string, wallet: string) {
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market || market.disabled) throw new Error("Market is not available.");
  if (market.pantaMarketId) return { already: true as const, marketId: market.pantaMarketId };
  const image = imageUrl();
  if (!panta.configured || !image) throw new PantaNotConfigured();
  const quoted = market.pantaCreateId
    ? { createId: market.pantaCreateId }
    : await panta.quoteCreate({
        wallet,
        question: market.question,
        resolutionRule: market.resolutionRule,
        sourcesOfTruth: ["https://www.sportmonks.com"],
        startTime: Math.floor(market.startTime.getTime() / 1000),
        endTime: Math.floor(market.endTime.getTime() / 1000),
        resolutionTime: Math.floor(market.resolutionTime.getTime() / 1000),
        marketType: market.marketType === "breaking" ? "breaking" : "standard",
        eventInProgress: market.marketType === "breaking",
        title: market.question,
        description: market.resolutionRule,
        imageUrl: image,
      });
  await prisma.market.update({
    where: { id: market.id },
    data: { pantaCreateId: quoted.createId, status: "AWAITING_SIGNATURE" },
  });
  const built = await panta.buildCreate(quoted.createId, wallet);
  return { already: false as const, ...built };
}

export async function finishCreate(marketId: string, createId: string, signature: string) {
  const registered = await panta.registerCreate(createId, signature);
  const market = await prisma.market.update({
    where: { id: marketId },
    data: {
      pantaMarketId: registered.marketId,
      pantaCreateId: createId,
      status: "OPEN",
      failureReason: null,
    },
    include: { match: { include: { matchroom: true } } },
  });
  const payload = { id: market.id, question: market.question, pantaMarketId: registered.marketId, status: "OPEN" };
  const roomId = market.match.matchroom?.id;
  if (roomId) {
    await publish(`matchroom:${roomId}`, "market:new", payload);
    const members = await prisma.matchroomMember.findMany({ where: { matchroomId: roomId } });
    for (const member of members) {
      await notify(member.userId, {
        type: "MARKET_NEW",
        title: "New call in the room",
        body: market.question,
        href: `/match/${market.matchId}`,
      });
    }
  }
  await prisma.marketGenerationLog.create({
    data: { marketId, matchId: market.matchId, level: "open", message: "Registered on Panta", detail: { pantaMarketId: registered.marketId } },
  });
  return market;
}

export async function attachPanta(marketId: string) {
  const market = await prisma.market.findUnique({ where: { id: marketId }, include: { match: { include: { matchroom: true } } } });
  if (!market) return;
  const image = imageUrl();
  if (!panta.configured || !image) {
    await prisma.market.update({
      where: { id: marketId },
      data: { failureReason: "Markets temporarily unavailable.", status: "PENDING" },
    });
    await prisma.marketGenerationLog.create({
      data: { marketId, matchId: market.matchId, level: "waiting", message: "Panta adapter is not configured." },
    });
    return;
  }
  const signer = creatorKeypair();
  if (!signer) {
    await prisma.market.update({ where: { id: marketId }, data: { status: "AWAITING_SIGNATURE", failureReason: null } });
    return;
  }
  try {
    const built = await beginCreate(marketId, signer.publicKey.toBase58());
    if (built.already) return;
    const tx = VersionedTransaction.deserialize(Buffer.from(built.transaction, "base64"));
    tx.sign([signer]);
    const connection = new Connection(config.solanaRpc, "confirmed");
    const signature = await connection.sendRawTransaction(tx.serialize());
    const confirmed = await connection.confirmTransaction(
      { signature, blockhash: built.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight },
      "confirmed",
    );
    if (confirmed.value.err) throw new Error("Create transaction failed on-chain");
    await finishCreate(marketId, built.createId, signature);
  } catch (error) {
    const message = error instanceof PantaNotConfigured ? error.message : error instanceof Error ? error.message : "Create failed";
    logger.warn({ marketId, err: message }, "panta create failed");
    await prisma.market.update({
      where: { id: marketId },
      data: { failureReason: message, status: message.includes("unavailable") ? "PENDING" : "FAILED" },
    });
    await prisma.marketGenerationLog.create({
      data: { marketId, matchId: market.matchId, level: "error", message },
    });
    await metric("markets_failed");
  }
}

export async function syncPantaMarkets() {
  if (!panta.configured) {
    await prisma.providerHealth.upsert({
      where: { id: "panta" },
      create: { id: "panta", status: "unconfigured", detail: "PANTA_API_KEY is not set", checkedAt: new Date() },
      update: { status: "unconfigured", detail: "PANTA_API_KEY is not set", checkedAt: new Date() },
    });
    return;
  }
  try {
    await panta.whoami();
    await prisma.providerHealth.upsert({
      where: { id: "panta" },
      create: { id: "panta", status: "up", detail: "whoami ok", checkedAt: new Date() },
      update: { status: "up", detail: "whoami ok", checkedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "down";
    await prisma.providerHealth.upsert({
      where: { id: "panta" },
      create: { id: "panta", status: "down", detail: message, checkedAt: new Date() },
      update: { status: "down", detail: message, checkedAt: new Date() },
    });
    return;
  }

  const markets = await prisma.market.findMany({
    where: { pantaMarketId: { not: null }, status: { in: ["OPEN", "TRADING"] }, disabled: false },
    include: { predictions: { where: { status: { in: ["SUBMITTED", "CONFIRMED"] } }, include: { user: { include: { wallets: true } } } } },
  });
  for (const market of markets) {
    if (!market.pantaMarketId) continue;
    try {
      const remote = await panta.getMarket(market.pantaMarketId);
      let outcome = remote.outcome;
      if (remote.resolved && !outcome) {
        for (const prediction of market.predictions) {
          const wallet = prediction.user.wallets[0]?.address;
          if (!wallet) continue;
          const positions = await panta.getPositions(wallet);
          const hit = positions.find((position) => position.marketId === market.pantaMarketId && position.outcome);
          if (hit?.outcome) {
            outcome = hit.outcome;
            break;
          }
          const held = positions.find((position) => position.marketId === market.pantaMarketId);
          if (held && prediction.status === "SUBMITTED") {
            await prisma.prediction.update({
              where: { id: prediction.id },
              data: { status: "CONFIRMED", shares: held.shares },
            });
          }
        }
      }
      await prisma.market.update({
        where: { id: market.id },
        data: {
          yesPrice: remote.yesPrice,
          noPrice: remote.noPrice,
          phase: remote.phase,
          status: remote.resolved ? "RESOLVED" : remote.phase === "secondary" ? "TRADING" : "OPEN",
        },
      });
      await publish(`matchroom:market:${market.id}`, "market:update", {
        id: market.id,
        yesPrice: remote.yesPrice,
        noPrice: remote.noPrice,
        phase: remote.phase,
        outcome,
      });
      const room = await prisma.matchroom.findUnique({ where: { matchId: market.matchId } });
      if (room) {
        await publish(`matchroom:${room.id}`, "market:update", {
          id: market.id,
          yesPrice: remote.yesPrice,
          noPrice: remote.noPrice,
          phase: remote.phase,
          status: remote.resolved ? "RESOLVED" : "OPEN",
          outcome,
        });
      }
      if (remote.resolved && (outcome === "yes" || outcome === "no")) {
        const started = Date.now();
        await settleMarket(market.id, outcome);
        await metric("market_resolution_latency", Date.now() - started);
      }
    } catch (error) {
      logger.warn({ marketId: market.id, err: error instanceof Error ? error.message : "sync failed" }, "panta sync failed");
    }
  }
}

export async function quoteForUser(input: {
  userId: string;
  marketId: string;
  side: "yes" | "no";
  amountUsdc: string;
  wallet: string;
}) {
  const market = await prisma.market.findUnique({ where: { id: input.marketId } });
  if (!market?.pantaMarketId || market.disabled || (market.status !== "OPEN" && market.status !== "TRADING")) {
    throw new PantaNotConfigured();
  }
  const quoted = await panta.quoteBuy({
    wallet: input.wallet,
    marketId: market.pantaMarketId,
    side: input.side,
    amountUsdc: input.amountUsdc,
    userId: input.userId,
  });
  const prediction = await prisma.prediction.create({
    data: {
      userId: input.userId,
      marketId: market.id,
      side: input.side === "yes" ? "YES" : "NO",
      amountUsdc: input.amountUsdc,
      shares: quoted.shares,
      avgPrice: quoted.avgPrice,
      status: "QUOTED",
      pantaQuoteId: quoted.quoteId,
      isLive: market.marketType === "breaking",
    },
  });
  await metric("predictions_created");
  return { predictionId: prediction.id, ...quoted };
}

export async function buildForUser(input: { userId: string; quoteId: string; wallet: string; maxSlippageBps?: number }) {
  const prediction = await prisma.prediction.findFirst({
    where: { pantaQuoteId: input.quoteId, userId: input.userId },
  });
  if (!prediction) throw new Error("Quote not found.");
  const built = await panta.buildBuy({
    quoteId: input.quoteId,
    wallet: input.wallet,
    userId: input.userId,
    maxSlippageBps: input.maxSlippageBps ?? 100,
  });
  await prisma.prediction.update({
    where: { id: prediction.id },
    data: { status: "BUILT", pantaOrderId: built.orderId, shares: built.expectedShares ?? prediction.shares },
  });
  return built;
}

export async function submitForUser(input: { userId: string; orderId: string; signature: string; wallet: string }) {
  const prediction = await prisma.prediction.findFirst({
    where: { pantaOrderId: input.orderId, userId: input.userId },
    include: { market: { include: { match: { include: { matchroom: true } } } }, user: true },
  });
  if (!prediction) throw new Error("Order not found.");
  const submitted = await panta.submitBuy({ orderId: input.orderId, signature: input.signature, wallet: input.wallet });
  await prisma.prediction.update({
    where: { id: prediction.id },
    data: { status: "SUBMITTED", signature: input.signature },
  });
  const roomId = prediction.market.match.matchroom?.id;
  const side = prediction.side === "YES" ? "YES" : "NO";
  if (roomId) {
    await postMessage({
      userId: input.userId,
      channel: "MATCHROOM",
      matchroomId: roomId,
      kind: "receipt",
      body: `${prediction.user.displayName} — ${side} · ${prediction.market.question}`,
      meta: { predictionId: prediction.id, side, signature: input.signature },
    }).catch(() => undefined);
    await publish(`matchroom:${roomId}`, "prediction:new", {
      id: prediction.id,
      user: prediction.user.displayName,
      side,
      question: prediction.market.question,
    });
  }
  return submitted;
}
