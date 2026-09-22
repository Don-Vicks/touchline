import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db";

export const SESSION_COOKIE = "tl_session";
export const CSRF_COOKIE = "tl_csrf";

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function checkPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function verifyWebhook(secret: string | undefined, raw: Buffer, header: string | undefined) {
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw).digest("hex");
  const left = Buffer.from(digest);
  const right = Buffer.from(header);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function loadAuth(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { wallets: true } } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.bannedAt) return null;
  return session;
}

export async function attachUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  res.locals.auth = await loadAuth(token);
  next();
}

export function requireUser(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.auth) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.auth) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  if (res.locals.auth.user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only." });
    return;
  }
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const auth = res.locals.auth as { csrfToken: string } | null;
  if (!auth) {
    next();
    return;
  }
  const header = req.get("x-csrf-token");
  if (!header || header !== auth.csrfToken) {
    res.status(403).json({ error: "Refresh the page and try again." });
    return;
  }
  next();
}

export function cookieOptions(maxAgeMs: number) {
  return {
    sameSite: "lax" as const,
    secure: process.env.WEB_ORIGIN?.startsWith("https") ?? false,
    path: "/",
    maxAge: maxAgeMs,
  };
}
