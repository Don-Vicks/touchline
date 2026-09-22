import { scoreXp } from "@touchline/market-engine";
import { prisma } from "../db";
import { publish } from "../realtime";
import { postMessage } from "./chat";
import { notify } from "./notify";

export async function settleMarket(marketId: string, outcome: "yes" | "no") {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    include: { match: { include: { matchroom: true, season: true } } },
  });
  if (!market || market.outcome === outcome && market.status === "RESOLVED") return;
  const seasonKey = market.match.season?.name ?? "all";
  const predictions = await prisma.prediction.findMany({
    where: { marketId, status: "CONFIRMED", result: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const byUser = new Map<string, typeof predictions>();
  for (const prediction of predictions) {
    const list = byUser.get(prediction.userId) ?? [];
    list.push(prediction);
    byUser.set(prediction.userId, list);
  }

  for (const [userId, rows] of byUser) {
    const correctRow = rows.find((row) => row.side.toLowerCase() === outcome);
    const chosen = correctRow ?? rows[0]!;
    const correct = Boolean(correctRow);
    const user = chosen.user;
    const scored = scoreXp({
      correct,
      entryPrice: chosen.avgPrice ? Number(chosen.avgPrice) : null,
      isLive: chosen.isLive,
      streakBefore: user.streak,
    });
    await prisma.$transaction(async (tx) => {
      await tx.prediction.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { result: correct ? "CORRECT" : "INCORRECT" },
      });
      if (correct && scored.xp > 0) {
        await tx.prediction.update({ where: { id: chosen.id }, data: { xpAwarded: scored.xp } });
        await tx.xPTransaction.create({
          data: {
            userId,
            amount: scored.xp,
            reason: scored.parts.join(" · "),
            seasonKey,
            marketId,
            predictionId: chosen.id,
          },
        });
        const streak = user.streak + 1;
        await tx.user.update({
          where: { id: userId },
          data: {
            xp: { increment: scored.xp },
            streak,
            bestStreak: Math.max(user.bestStreak, streak),
          },
        });
        const memberships = await tx.squadMember.findMany({ where: { userId } });
        for (const membership of memberships) {
          await tx.squad.update({ where: { id: membership.squadId }, data: { xp: { increment: scored.xp } } });
        }
      } else {
        await tx.user.update({ where: { id: userId }, data: { streak: 0 } });
      }
    });

    const roomId = market.match.matchroom?.id;
    if (roomId) {
      await postMessage({
        userId,
        channel: "MATCHROOM",
        matchroomId: roomId,
        kind: "resolution",
        body: correct
          ? `${user.displayName} called it. ${market.question.replace(/\?$/, "")} — YES side ${outcome === "yes" ? "lands" : "misses"}. +${scored.xp} XP`
          : `${user.displayName} said “${market.question.replace(/\?$/, "")}”. Wrong.`,
        meta: { outcome, correct, xp: scored.xp },
      }).catch(() => undefined);
    }
    await notify(userId, {
      type: "MARKET_RESOLVED",
      title: correct ? `+${scored.xp} XP` : "Wrong call",
      body: market.question,
      href: `/match/${market.matchId}`,
    });
    if (correct && user.streak + 1 >= 3) {
      await notify(userId, {
        type: "STREAK",
        title: `${user.streak + 1} in a row`,
        body: "Your prediction streak is up.",
        href: "/rankings",
      });
    }
  }

  await prisma.market.update({
    where: { id: marketId },
    data: { outcome, status: "RESOLVED", phase: "resolved" },
  });
  if (market.evidence && market.evidence !== "pending" && market.evidence !== outcome) {
    await prisma.auditLog.create({
      data: {
        action: "RESOLUTION_MISMATCH",
        entity: "Market",
        entityId: marketId,
        detail: { evidence: market.evidence, panta: outcome },
      },
    });
  }
  const roomId = market.match.matchroom?.id;
  if (roomId) {
    await publish(`matchroom:${roomId}`, "market:update", { id: marketId, outcome, status: "RESOLVED" });
    await publish(`matchroom:${roomId}`, "leaderboard:update", { matchId: market.matchId });
  }
}
