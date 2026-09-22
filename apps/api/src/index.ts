import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { attachUser, hashPassword, requireCsrf } from "./auth";
import { config } from "./config";
import { prisma } from "./db";
import { logger } from "./logger";
import { redis } from "./redis";
import api from "./routes/api";
import webhooks from "./routes/webhooks";
import { startRealtimeBridge } from "./realtime";
import { attachSocket } from "./socket";
import { ensureTemplates } from "./services/markets";
import { startWorkers } from "./workers";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.webOrigin,
    credentials: true,
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  }),
);
app.use(cookieParser());
app.use((req, res, next) => {
  const id = randomUUID();
  res.setHeader("x-request-id", id);
  res.locals.requestId = id;
  if (req.path !== "/api/v1/health") logger.info({ id, method: req.method, path: req.path }, "request");
  next();
});
app.use("/api/v1/webhooks", express.raw({ type: "application/json", limit: "1mb" }), webhooks);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1", async (req, res, next) => {
  const key = `rl:ip:${req.ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 300) return res.status(429).json({ error: "Slow down a moment." });
  next();
});
app.use("/api/v1/auth", async (req, res, next) => {
  if (req.method === "GET") return next();
  const key = `rl:auth:${req.ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 15) return res.status(429).json({ error: "Too many sign-in attempts." });
  next();
});
app.use("/api/v1", attachUser, requireCsrf, api);

async function bootstrapAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existing) return;
  const username = "touchline";
  await prisma.user.create({
    data: {
      email: config.adminEmail.toLowerCase(),
      username,
      displayName: "Touchline",
      passwordHash: await hashPassword(config.adminPassword),
      role: "ADMIN",
    },
  });
  logger.info("bootstrapped admin user");
}

const server = createServer(app);
attachSocket(server);
startRealtimeBridge();

server.listen(config.port, () => {
  logger.info({ port: config.port }, "touchline api listening");
});

await ensureTemplates();
await bootstrapAdmin();
if (config.embedWorkers) await startWorkers();
