import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(root, ".env") });

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string, fallback?: string): string {
  const value = optional(name) ?? fallback;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL", "postgresql://donvicks@localhost:5432/touchline"),
  redisUrl: required("REDIS_URL", "redis://127.0.0.1:6379"),
  sessionSecret: required("SESSION_SECRET", "dev-only-session-secret-change-me"),
  webOrigin: required("WEB_ORIGIN", "http://localhost:3010"),
  port: Number(process.env.API_PORT ?? 4000),
  sportmonksToken: optional("SPORTMONKS_API_TOKEN"),
  sportmonksBase: required("SPORTMONKS_BASE_URL", "https://api.sportmonks.com/v3/football"),
  leagueIds: (optional("FOOTBALL_LEAGUE_IDS") ?? "271,501")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  thesportsdbKey: optional("THESPORTSDB_API_KEY") ?? "3",
  footballDataToken: optional("FOOTBALL_DATA_TOKEN"),
  youtubeApiKey: optional("YOUTUBE_API_KEY"),
  apiFootballKey: optional("API_FOOTBALL_KEY"),
  footballPollMs: Number(process.env.FOOTBALL_POLL_MS ?? 20_000),
  fixturePollMs: Number(process.env.FIXTURE_POLL_MS ?? 120_000),
  pantaApiUrl: required("PANTA_API_URL", "https://live-api.panta.market/api/v1"),
  pantaApiKey: optional("PANTA_API_KEY"),
  pantaImageUrl: optional("PANTA_MARKET_IMAGE_URL") ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Soccerball.svg/512px-Soccerball.svg.png",
  pantaCreatorKeypair: optional("PANTA_CREATOR_KEYPAIR_PATH"),
  pinataJwt: optional("PINATA_JWT"),
  pinataGateway: optional("PINATA_GATEWAY") ?? "https://gateway.pinata.cloud",
  pinataImageCid: optional("PINATA_IMAGE_CID"),
  solanaRpc: required("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
  solanaNetwork: required("SOLANA_NETWORK", "mainnet-beta"),
  webhookSecret: optional("WEBHOOK_SECRET"),
  adminEmail: optional("ADMIN_EMAIL"),
  adminPassword: optional("ADMIN_PASSWORD"),
  embedWorkers: (process.env.EMBED_WORKERS ?? "true") !== "false",
  logLevel: process.env.LOG_LEVEL ?? "info",
  isProd: process.env.NODE_ENV === "production",
};
