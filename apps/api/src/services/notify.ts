import { prisma } from "../db";
import { publish } from "../realtime";

export async function notify(
  userId: string,
  input: { type: string; title: string; body: string; href?: string },
) {
  const row = await prisma.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
  await publish(`user:${userId}`, "notification:new", {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: row.createdAt.toISOString(),
  });
  return row;
}
