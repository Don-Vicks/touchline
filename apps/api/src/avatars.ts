import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const avatarDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../uploads/avatars");
mkdirSync(avatarDir, { recursive: true });

export function avatarPublicUrl(host: string, userId: string, ext: string) {
  const base = host.replace(/\/$/, "");
  return `${base}/avatars/${userId}.${ext}`;
}
