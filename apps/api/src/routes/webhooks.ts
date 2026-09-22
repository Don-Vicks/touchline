import { Router } from "express";
import { config } from "../config";
import { verifyWebhook } from "../auth";
import { providerNamed } from "../integrations/registry";
import { ingest } from "../services/football-sync";
import { syncPantaMarkets } from "../services/markets";
import { logger } from "../logger";

const router = Router();

function authorized(req: { body: unknown; get(name: string): string | undefined }) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  return verifyWebhook(config.webhookSecret, raw, req.get("x-touchline-signature"));
}

router.post("/football", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Invalid webhook signature." });
  try {
    const payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "{}") as {
      fixtureId?: string | number;
      data?: { id?: string | number };
    };
    const id = payload.fixtureId ?? payload.data?.id;
    if (id != null) {
      const source = providerNamed("sportmonks");
      if (!source) return res.status(503).json({ error: "Live data temporarily unavailable." });
      const fixture = await source.getFixture(String(id));
      await ingest(fixture, { generate: fixture.status !== "FINISHED" && fixture.status !== "CANCELLED" });
    }
    res.json({ ok: true });
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : "webhook failed" }, "football webhook");
    res.status(503).json({ error: "Live data temporarily unavailable." });
  }
});

router.post("/panta", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Invalid webhook signature." });
  await syncPantaMarkets();
  res.json({ ok: true });
});

export default router;
