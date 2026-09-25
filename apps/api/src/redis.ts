import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  commandTimeout: 1000,
  retryStrategy() {
    return null;
  },
});
redis.on("error", () => {});

export function bullConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export async function metric(name: string, by = 1) {
  try {
    await redis.incrby(`metric:${name}`, by);
  } catch {}
}

export async function readMetrics() {
  try {
    const keys = await redis.keys("metric:*");
    const out: Record<string, number> = {};
    if (keys.length === 0) return out;
    const values = await redis.mget(keys);
    keys.forEach((key, i) => {
      out[key.slice("metric:".length)] = Number(values[i] ?? 0);
    });
    return out;
  } catch {
    return {};
  }
}
