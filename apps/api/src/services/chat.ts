import { prisma } from "../db";
import { metric, redis } from "../redis";
import { publish } from "../realtime";
import { notify } from "./notify";

const mention = /@([a-z0-9_]{3,20})/g;

export async function postMessage(input: {
  userId: string;
  channel: "MATCHROOM" | "SQUAD";
  matchroomId?: string;
  squadId?: string;
  body: string;
  replyToId?: string;
  kind?: string;
  meta?: unknown;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.bannedAt) throw new Error("You can't post right now.");
  if (user.mutedUntil && user.mutedUntil > new Date() && (input.kind ?? "message") === "message") {
    throw new Error("You're muted.");
  }

  if ((input.kind ?? "message") === "message") {
    const burst = await redis.incr(`chat:burst:${user.id}`);
    if (burst === 1) await redis.expire(`chat:burst:${user.id}`, 10);
    const slow = await redis.set(`chat:slow:${user.id}`, "1", "EX", 1, "NX");
    if (slow !== "OK" || burst > 8) throw new Error("Slow down a moment.");
  }

  if (input.channel === "MATCHROOM" && input.matchroomId) {
    const member = await prisma.matchroomMember.findUnique({
      where: { matchroomId_userId: { matchroomId: input.matchroomId, userId: user.id } },
    });
    if (!member) throw new Error("Join the matchroom first.");
    const room = await prisma.matchroom.findUnique({ where: { id: input.matchroomId } });
    if (room?.disabled) throw new Error("This matchroom is paused.");
  }

  if (input.channel === "SQUAD" && input.squadId) {
    const member = await prisma.squadMember.findUnique({
      where: { squadId_userId: { squadId: input.squadId, userId: user.id } },
    });
    if (!member) throw new Error("Join the squad first.");
  }

  const message = await prisma.chatMessage.create({
    data: {
      channel: input.channel,
      matchroomId: input.matchroomId,
      squadId: input.squadId,
      userId: user.id,
      body: input.body,
      replyToId: input.replyToId,
      kind: input.kind ?? "message",
      meta: input.meta ?? undefined,
    },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  const payload = {
    id: message.id,
    channel: message.channel,
    matchroomId: message.matchroomId,
    squadId: message.squadId,
    body: message.body,
    kind: message.kind,
    replyToId: message.replyToId,
    meta: message.meta,
    createdAt: message.createdAt.toISOString(),
    user: message.user,
  };
  const room = input.matchroomId ? `matchroom:${input.matchroomId}` : `squad:${input.squadId}`;
  await publish(room, "message:new", payload);
  await publish(room, "chat:new", payload);
  if ((input.kind ?? "message") === "message") await metric("chat_messages");

  const names = new Set<string>();
  for (const hit of input.body.matchAll(mention)) names.add(hit[1]!);
  if (names.size) {
    const people = await prisma.user.findMany({ where: { username: { in: [...names] } } });
    for (const person of people) {
      if (person.id === user.id) continue;
      await notify(person.id, {
        type: "REPLY",
        title: `@${user.username}`,
        body: input.body.slice(0, 140),
        href: input.matchroomId ? `/match/${input.matchroomId}` : undefined,
      });
    }
  }

  if (input.replyToId) {
    const parent = await prisma.chatMessage.findUnique({ where: { id: input.replyToId } });
    if (parent && parent.userId !== user.id) {
      await notify(parent.userId, {
        type: "REPLY",
        title: `${user.displayName} replied`,
        body: input.body.slice(0, 140),
      });
    }
  }

  return payload;
}
