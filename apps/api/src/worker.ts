import { createServer } from "node:http";
// @ts-ignore
import { handleAsNodeRequest } from "cloudflare:node";
import { app } from "./app";
import { getPrisma } from "./db";

export interface Env {
  DB: any;
  DATABASE_URL?: string;
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
    if (env.DB) {
      (globalThis as any).__D1_DATABASE__ = env.DB;
      getPrisma(env.DB);
    }

    return handleAsNodeRequest(PORT, request);
  },
};
