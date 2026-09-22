import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config";
import { SESSION_COOKIE, loadAuth } from "./auth";
import { prisma } from "./db";
import { logger } from "./logger";
import { metric } from "./redis";
import { bumpReaction, presenceJoin, presenceLeave, publish, setIo } from "./realtime";
import { postMessage } from "./services/chat";

function cookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(/; */)) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return undefined;
}

const EMOJI = new Set(["🔥", "😂", "😭", "👀", "🤯", "💀", "👏", "😡"]);

export function attachSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: config.webOrigin, credentials: true },
  });
  setIo(io);
  io.use(async (socket, next) => {
    const session = await loadAuth(cookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!session) return next(new Error("Unauthorized"));
    socket.data.userId = session.user.id;
    socket.data.displayName = session.user.displayName;
    next();
  });

  io.on("connection", (socket) => {
    void metric("websocket_connections");
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("user:join", async (input: { matchroomId?: string; squadId?: string }) => {
      if (input?.matchroomId) {
        const member = await prisma.matchroomMember.findUnique({
          where: { matchroomId_userId: { matchroomId: input.matchroomId, userId } },
        });
        if (!member) return;
        socket.join(`matchroom:${input.matchroomId}`);
        await presenceJoin(input.matchroomId, userId);
        await publish(`matchroom:${input.matchroomId}`, "user:join", { userId, displayName: socket.data.displayName });
        await publish(`matchroom:${input.matchroomId}`, "presence:update", { matchroomId: input.matchroomId });
      }
      if (input?.squadId) {
        const member = await prisma.squadMember.findUnique({
          where: { squadId_userId: { squadId: input.squadId, userId } },
        });
        if (!member) return;
        socket.join(`squad:${input.squadId}`);
      }
    });

    socket.on("user:leave", async (input: { matchroomId?: string }) => {
      if (!input?.matchroomId) return;
      socket.leave(`matchroom:${input.matchroomId}`);
      await presenceLeave(input.matchroomId, userId);
      await publish(`matchroom:${input.matchroomId}`, "user:leave", { userId });
      await publish(`matchroom:${input.matchroomId}`, "presence:update", { matchroomId: input.matchroomId });
    });

    socket.on("message:send", async (input: { channel?: "MATCHROOM" | "SQUAD"; matchroomId?: string; squadId?: string; body?: string; replyToId?: string }) => {
      if (!input?.body || !input.channel) return;
      try {
        await postMessage({
          userId,
          channel: input.channel,
          matchroomId: input.matchroomId,
          squadId: input.squadId,
          body: input.body,
          replyToId: input.replyToId,
        });
      } catch (error) {
        socket.emit("message:error", { error: error instanceof Error ? error.message : "Could not send." });
      }
    });

    socket.on("message:delete", async (input: { id?: string }) => {
      if (!input?.id) return;
      const message = await prisma.chatMessage.findUnique({ where: { id: input.id } });
      if (!message || message.userId !== userId) return;
      await prisma.chatMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), body: "" } });
      const room = message.matchroomId ? `matchroom:${message.matchroomId}` : `squad:${message.squadId}`;
      await publish(room, "message:delete", { id: message.id });
    });

    socket.on("reaction:add", async (input: { emoji?: string; matchId?: string; messageId?: string }) => {
      if (!input?.emoji || !EMOJI.has(input.emoji)) return;
      if (input.matchId) {
        const counts = await bumpReaction(input.matchId, input.emoji);
        const room = await prisma.matchroom.findUnique({ where: { matchId: input.matchId } });
        if (room) await publish(`matchroom:${room.id}`, "reaction:new", { matchId: input.matchId, emoji: input.emoji, counts });
      }
      if (input.messageId) {
        await prisma.reaction.upsert({
          where: { messageId_userId_emoji: { messageId: input.messageId, userId, emoji: input.emoji } },
          create: { messageId: input.messageId, userId, emoji: input.emoji },
          update: {},
        });
        await publish(`user:${userId}`, "reaction:add", { messageId: input.messageId, emoji: input.emoji });
      }
    });

    socket.on("disconnect", async () => {
      const rooms = [...socket.rooms].filter((room) => room.startsWith("matchroom:"));
      for (const room of rooms) {
        const id = room.slice("matchroom:".length);
        await presenceLeave(id, userId);
        await publish(room, "user:leave", { userId });
      }
    });
  });

  logger.info("socket.io ready");
  return io;
}
