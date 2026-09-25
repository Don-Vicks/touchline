import { createServer } from "node:http";
// @ts-ignore
import { handleAsNodeRequest } from "cloudflare:node";
import { app } from "./app";
import { getPrisma } from "./db";

export interface Env {
  DATABASE_URL?: string;
  DATABASE_URL_POOLED?: string;
  JWT_SECRET?: string;
  SESSION_SECRET?: string;
  WEB_ORIGIN?: string;
  PANTA_API_URL?: string;
  PANTA_API_KEY?: string;
  SOLANA_RPC_URL?: string;
  SOLANA_NETWORK?: string;
}

const PORT = 4000;
const server = createServer(app);
server.listen(PORT);

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const dbUrl = env.DATABASE_URL_POOLED || env.DATABASE_URL;
    if (dbUrl) {
      (globalThis as any).__DATABASE_URL__ = dbUrl;
      process.env.DATABASE_URL = env.DATABASE_URL || dbUrl;
      process.env.DATABASE_URL_POOLED = env.DATABASE_URL_POOLED || dbUrl;
      getPrisma(dbUrl);
    }

    if (env.JWT_SECRET) process.env.JWT_SECRET = env.JWT_SECRET;
    if (env.SESSION_SECRET) process.env.SESSION_SECRET = env.SESSION_SECRET;
    if (env.WEB_ORIGIN) process.env.WEB_ORIGIN = env.WEB_ORIGIN;
    if (env.PANTA_API_URL) process.env.PANTA_API_URL = env.PANTA_API_URL;
    if (env.PANTA_API_KEY) process.env.PANTA_API_KEY = env.PANTA_API_KEY;
    if (env.SOLANA_RPC_URL) process.env.SOLANA_RPC_URL = env.SOLANA_RPC_URL;
    if (env.SOLANA_NETWORK) process.env.SOLANA_NETWORK = env.SOLANA_NETWORK;

    return handleAsNodeRequest(PORT, request);
  },
};
