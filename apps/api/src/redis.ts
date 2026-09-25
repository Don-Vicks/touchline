import { Redis } from "ioredis";
import { config } from "./config.js";

const rawRedis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  commandTimeout: 1000,
  retryStrategy() {
    return null;
  },
});
rawRedis.on("error", () => {});

export const redis: Redis = new Proxy(rawRedis as any, {
  get(target, prop, receiver) {
    const val = Reflect.get(target, prop, receiver);
    if (typeof val === "function") {
      return async function (...args: any[]) {
        try {
          return await val.apply(target, args);
        } catch {
          const p = String(prop);
          if (p === "scard" || p === "incr" || p === "incrby" || p === "del") return 0;
          if (p === "keys" || p === "mget") return [];
          if (p === "hgetall") return {};
          if (p === "duplicate") {
            try {
              const dup = target.duplicate();
              dup.on("error", () => {});
              return dup;
            } catch {
              return { on: () => {}, subscribe: () => {} };
            }
          }
          return null;
        }
      };
    }
    return val;
  },
});

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
