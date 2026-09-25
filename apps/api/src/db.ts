import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

let prismaClientInstance: PrismaClient | null = null;
let currentConnStr: string | null = null;

export function getPrisma(databaseUrl?: string): PrismaClient {
  const connStr = (
    databaseUrl ||
    (globalThis as any).__DATABASE_URL__ ||
    process.env.DATABASE_URL_POOLED ||
    process.env.DATABASE_URL ||
    ""
  ).trim();

  if (!connStr) {
    if (!prismaClientInstance) {
      prismaClientInstance = new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });
    }
    return prismaClientInstance;
  }

  if (!prismaClientInstance || currentConnStr !== connStr) {
    currentConnStr = connStr;
    const adapter = new PrismaNeonHttp(connStr);
    prismaClientInstance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return prismaClientInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});
