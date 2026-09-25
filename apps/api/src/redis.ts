import { Redis } from "ioredis";
import { config } from "./config.js";

function createFallbackRedis(): any {
  const dummy: any = {
    on: () => dummy,
    once: () => dummy,
    off: () => dummy,
    emit: () => false,
    addListener: () => dummy,
    removeListener: () => dummy,
    removeAllListeners: () => dummy,
    duplicate: () => createFallbackRedis(),
    subscribe: async () => {},
    unsubscribe: async () => {},
    publish: async () => 0,
    disconnect: () => {},
    quit: async () => "OK",
  };
  return new Proxy(dummy, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });
}

function wrapRedis(client: Redis): Redis {
  return new Proxy(client as any, {
    get(target, prop, receiver) {
      if (prop === "duplicate") {
        return function (...args: any[]) {
          try {
            const dup = target.duplicate(...args);
            dup.on("error", () => {});
            return wrapRedis(dup);
          } catch {
            return createFallbackRedis();
          }
        };
      }

      if (
        prop === "on" ||
        prop === "once" ||
        prop === "off" ||
        prop === "emit" ||
        prop === "addListener" ||
        prop === "removeListener" ||
        prop === "removeAllListeners"
      ) {
        return function (...args: any[]) {
          try {
            return target[prop](...args);
          } catch {
            return target;
          }
        };
      }

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
            return null;
          }
        };
      }
      return val;
    },
  });
}

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

export const redis: Redis = wrapRedis(rawRedis);

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
