import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

let clientInstance: PrismaClient | null = null;
let d1ClientInstance: PrismaClient | null = null;
let lastD1Ref: any = null;

export function getPrisma(d1?: any): PrismaClient {
  const activeD1 = d1 ?? (globalThis as any).__D1_DATABASE__;
  if (activeD1) {
    if (!d1ClientInstance || lastD1Ref !== activeD1) {
      lastD1Ref = activeD1;
      const adapter = new PrismaD1(activeD1);
      d1ClientInstance = new PrismaClient({ adapter });
    }
    return d1ClientInstance;
  }
  if (!clientInstance) {
    clientInstance = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return clientInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});
