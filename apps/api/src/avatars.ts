import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let resolvedDir = "/tmp/avatars";
try {
  if (typeof import.meta?.url === "string" && import.meta.url.startsWith("file:")) {
    resolvedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../uploads/avatars");
    mkdirSync(resolvedDir, { recursive: true });
  }
} catch {
  // Ignored in Workers
}

export const avatarDir = resolvedDir;

export function avatarPublicUrl(host: string, userId: string, ext: string) {
  const base = host.replace(/\/$/, "");
  return `${base}/avatars/${userId}.${ext}`;
}
