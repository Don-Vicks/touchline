import { config } from "../config";
import { logger } from "../logger";

export class PantaNotConfigured extends Error {
  constructor() {
    super("Markets temporarily unavailable.");
    this.name = "PantaNotConfigured";
  }
}

export class PantaError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PantaError";
  }
}

export interface PantaMarket {
  marketId: string;
  title: string | null;
  phase: string | null;
  status: string | null;
  marketType: string | null;
  resolved: boolean;
  yesPrice: string | null;
  noPrice: string | null;
  outcome: "yes" | "no" | null;
  volumeUsdc: string | null;
}

export interface CreateQuoteInput {
  wallet: string;
  question: string;
  resolutionRule: string;
  sourcesOfTruth: string[];
  startTime: number;
  endTime: number;
  resolutionTime: number;
  marketType: "standard" | "breaking";
  eventInProgress?: boolean;
  title?: string;
  description?: string;
  imageUrl: string;
}

export interface PantaPosition {
  marketId: string;
  side: "yes" | "no";
  shares: string;
  phase: string | null;
  claimable: boolean;
  claimed: boolean;
  outcome: "yes" | "no" | null;
}

interface InstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface PantaInstruction {
  programId: string;
  data: string;
  accounts: InstructionAccount[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

export class PantaClient {
  constructor(
    private readonly base = config.pantaApiUrl,
    private readonly key = config.pantaApiKey,
  ) {}

  get configured() {
    return Boolean(this.key);
  }

  private url(path: string, query?: Record<string, string>) {
    const root = this.base.endsWith("/") ? this.base : `${this.base}/`;
    const url = new URL(path.replace(/^\//, ""), root);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    return url;
  }

  private async request<T>(path: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
    if (!this.key) throw new PantaNotConfigured();
    const response = await fetch(this.url(path, query), {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": this.key,
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) {
      const record = asRecord(body);
      const message = str(record.message) ?? str(record.error) ?? `Panta returned ${response.status}`;
      const code = str(record.code) ?? "PANTA_ERROR";
      logger.warn({ path, status: response.status, code }, "panta request failed");
      throw new PantaError(message, code, response.status);
    }
    return body as T;
  }

  async whoami() {
    return this.request<Record<string, unknown>>("account");
  }

  async getMarket(marketId: string): Promise<PantaMarket> {
    const body = await this.request<Record<string, unknown>>(`markets/${marketId}`);
    const outcome = str(body.outcome);
    return {
      marketId: str(body.marketId) ?? marketId,
      title: str(body.title),
      phase: str(body.phase),
      status: str(body.status),
      marketType: str(body.marketType),
      resolved: body.resolved === true || str(body.phase) === "resolved" || str(body.status) === "resolved",
      yesPrice: str(body.yesPrice),
      noPrice: str(body.noPrice),
      outcome: outcome === "yes" || outcome === "no" ? outcome : null,
      volumeUsdc: str(body.volumeUsdc),
    };
  }

  async quoteCreate(input: CreateQuoteInput) {
    return this.request<{
      createId: string;
      expectedEventPda?: string;
      paymentUsdc?: string;
      expiresAt?: string;
    }>("markets/create/quote", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        category: "sports",
        region: "Global",
        oracle: input.sourcesOfTruth.join(", "),
      }),
    });
  }

  async buildCreate(createId: string, wallet: string) {
    return this.request<{
      createId: string;
      transaction: string;
      recentBlockhash: string;
      lastValidBlockHeight: number;
      buildFingerprint?: string;
      expiresAt?: string;
    }>("markets/create/build", {
      method: "POST",
      body: JSON.stringify({ createId, wallet }),
    });
  }

  async registerCreate(createId: string, signature: string) {
    return this.request<{ marketId: string; status: string; signature?: string }>("markets/register", {
      method: "POST",
      body: JSON.stringify({ createId, signature }),
    });
  }

  async quoteBuy(input: { wallet: string; marketId: string; side: "yes" | "no"; amountUsdc: string; userId?: string }) {
    return this.request<{
      quoteId: string;
      shares?: string;
      avgPrice?: string;
      feeUsdc?: string;
      expiresAt?: string;
      side: "yes" | "no";
      amountUsdc?: string;
    }>("primaryorderquote", { method: "POST", body: JSON.stringify(input) });
  }

  async buildBuy(input: { quoteId: string; wallet: string; userId?: string; maxSlippageBps?: number }) {
    return this.request<{
      orderId: string;
      quoteId: string;
      instructions: PantaInstruction[];
      recentBlockhash: string;
      lastValidBlockHeight: number;
      expectedShares?: string;
      feeUsdc?: string;
      expiresAt?: string;
    }>("primaryorderbuild", { method: "POST", body: JSON.stringify(input) });
  }

  async submitBuy(input: { orderId: string; signature: string; wallet?: string }) {
    return this.request<{ orderId: string; status: string; signature?: string }>("primaryordersubmit", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getPositions(wallet: string): Promise<PantaPosition[]> {
    const body = await this.request<{ positions?: Record<string, unknown>[] }>("positions", undefined, { wallet });
    return (body.positions ?? []).map((row) => {
      const side = str(row.side) === "no" ? "no" : "yes";
      const outcome = str(row.outcome);
      return {
        marketId: str(row.marketId) ?? "",
        side,
        shares: str(row.shares) ?? "0",
        phase: str(row.phase),
        claimable: row.claimable === true,
        claimed: row.claimed === true,
        outcome: outcome === "yes" || outcome === "no" ? outcome : null,
      };
    });
  }
}

export const panta = new PantaClient();
