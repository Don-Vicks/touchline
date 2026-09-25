import { createServer } from "node:http";
import { app } from "./app";
import { hashPassword } from "./auth";
import { config } from "./config";
import { prisma } from "./db";
import { logger } from "./logger";
import { startRealtimeBridge } from "./realtime";
import { attachSocket } from "./socket";
import { ensureTemplates } from "./services/markets";
import { startWorkers } from "./workers";

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
