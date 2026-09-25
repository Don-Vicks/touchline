import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { attachUser, requireCsrf } from "./auth";
import { config } from "./config";
import { logger } from "./logger";
import { redis } from "./redis";
import api from "./routes/api";
import webhooks from "./routes/webhooks";
import { avatarDir } from "./avatars";

export const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use("/avatars", express.static(avatarDir, { maxAge: "7d" }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === config.webOrigin ||
        origin.includes("localhost") ||
        origin.endsWith(".workers.dev") ||
        origin.endsWith(".pages.dev")
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
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
app.use(express.json({ limit: "2mb" }));

// Rate limiting with graceful fallback if Redis is unavailable in serverless environments
app.use("/api/v1", async (req, res, next) => {
  try {
    const key = `rl:ip:${req.ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    if (count > 300) return res.status(429).json({ error: "Slow down a moment." });
  } catch (err) {
    // Redis optional/fallback
  }
  next();
});

app.use("/api/v1/auth", async (req, res, next) => {
  if (req.method === "GET") return next();
  try {
    const key = `rl:auth:${req.ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    if (count > 15) return res.status(429).json({ error: "Too many sign-in attempts." });
  } catch (err) {
    // Redis optional/fallback
  }
  next();
});

app.use("/api/v1", attachUser, requireCsrf, api);

export default app;
