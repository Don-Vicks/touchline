import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

export function bullConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export async function metric(name: string, by = 1) {
  await redis.incrby(`metric:${name}`, by);
}

export async function readMetrics() {
  const keys = await redis.keys("metric:*");
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  const values = await redis.mget(keys);
  keys.forEach((key, i) => {
    out[key.slice("metric:".length)] = Number(values[i] ?? 0);
  });
  return out;
}
