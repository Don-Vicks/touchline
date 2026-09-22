import type { Server } from "socket.io";
import { redis } from "./redis";
import { logger } from "./logger";

let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export async function publish(room: string, event: string, payload: unknown) {
  await redis.publish("touchline:events", JSON.stringify({ room, event, payload }));
}

export function startRealtimeBridge() {
  const sub = redis.duplicate();
  sub.on("error", (err: Error) => logger.warn({ err: err.message }, "realtime redis error"));
  void sub.subscribe("touchline:events");
  sub.on("message", (_channel: string, raw: string) => {
    try {
      const message = JSON.parse(raw) as { room: string; event: string; payload: unknown };
      io?.to(message.room).emit(message.event, message.payload);
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : "bad payload" }, "realtime drop");
    }
  });
}

export async function presenceCount(matchroomId: string) {
  const count = await redis.scard(`presence:${matchroomId}`);
  return count;
}

export async function presenceJoin(matchroomId: string, userId: string) {
  await redis.sadd(`presence:${matchroomId}`, userId);
  await redis.expire(`presence:${matchroomId}`, 60 * 60 * 6);
}

export async function presenceLeave(matchroomId: string, userId: string) {
  await redis.srem(`presence:${matchroomId}`, userId);
}

export async function bumpReaction(matchId: string, emoji: string) {
  const key = `reactions:${matchId}`;
  await redis.hincrby(key, emoji, 1);
  await redis.expire(key, 60 * 60 * 8);
  return redis.hgetall(key);
}
