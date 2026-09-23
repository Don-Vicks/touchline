import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Use 3–20 letters, numbers, or underscores.");

export const registerSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(200),
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(40),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(180).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const avatarUploadSchema = z.object({
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Use a JPEG, PNG, or WebP photo."),
});

export const walletVerifySchema = z.object({
  address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  message: z.string().min(10).max(500),
  signature: z.string().min(32).max(200),
});

export const createSquadSchema = z.object({
  name: z.string().trim().min(2).max(32),
  description: z.string().trim().max(180).optional(),
  logoUrl: z.string().url().max(500).optional(),
});

export const inviteSchema = z.object({
  username: usernameSchema,
});

export const joinCodeSchema = z.object({
  inviteCode: z.string().trim().min(4).max(16),
});

export const chatSchema = z.object({
  body: z.string().trim().min(1).max(500),
  replyToId: z.string().cuid().optional(),
  channel: z.enum(["MATCHROOM", "SQUAD"]),
  matchroomId: z.string().cuid().optional(),
  squadId: z.string().cuid().optional(),
});

export const reactionSchema = z.object({
  emoji: z.enum(["🔥", "😂", "😭", "👀", "🤯", "💀", "👏", "😡"]),
});

export const reportSchema = z.object({
  reason: z.string().trim().min(3).max(280),
  messageId: z.string().cuid().optional(),
  targetUserId: z.string().cuid().optional(),
});

export const quoteBuySchema = z.object({
  side: z.enum(["yes", "no"]),
  amountUsdc: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

export const buildBuySchema = z.object({
  quoteId: z.string().min(3).max(80),
  maxSlippageBps: z.number().int().min(0).max(5000).optional(),
});

export const submitBuySchema = z.object({
  orderId: z.string().min(3).max(80),
  signature: z.string().min(32).max(128),
});

export const adminCreateSchema = z.object({
  wallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  createId: z.string().min(3).max(80).optional(),
});

export const registerMarketSchema = z.object({
  createId: z.string().min(3).max(80),
  signature: z.string().min(32).max(128),
});

export const muteSchema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 30),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
