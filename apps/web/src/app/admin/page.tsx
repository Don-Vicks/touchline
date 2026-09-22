"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import type { MarketCard, MatchCard } from "@/lib/types";

interface Overview {
  live: MatchCard[];
  activeMatchrooms: number;
  markets: MarketCard[];
  reports: { id: string; reason: string; reporter: { displayName: string } }[];
  health: { id: string; status: string; detail: string | null }[];
  logs: { id: string; level: string; message: string; createdAt: string }[];
  metrics: Record<string, number>;
}

const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export default function AdminPage() {
  const client = useQueryClient();
  const overview = useQuery({ queryKey: ["admin"], queryFn: () => api<Overview>("/admin/overview") });
  const { publicKey, signTransaction } = useWallet();
  const [error, setError] = useState<string | null>(null);
  if (overview.isLoading) return <Skeleton className="h-40 w-full" />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  const data = overview.data!;

  async function signCreate(marketId: string) {
    setError(null);
    if (!publicKey || !signTransaction) {
      setError("Connect the operator wallet first.");
      return;
    }
    const prepared = await api<{ already?: boolean; transaction?: string; createId?: string; recentBlockhash?: string; lastValidBlockHeight?: number }>(
      `/admin/markets/${marketId}/prepare`,
      { method: "POST", body: JSON.stringify({ wallet: publicKey.toBase58() }) },
    );
    if (prepared.already || !prepared.transaction || !prepared.createId || !prepared.recentBlockhash || !prepared.lastValidBlockHeight) return;
    const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
    const signed = await signTransaction(tx);
    const connection = new Connection(rpc, "confirmed");
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(
      { signature, blockhash: prepared.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
      "confirmed",
    );
    await api(`/admin/markets/${marketId}/register`, {
      method: "POST",
      body: JSON.stringify({ createId: prepared.createId, signature }),
    });
    await client.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-5xl tracking-tight">Desk</h1>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.health.map((row) => (
          <li key={row.id} className="border border-line bg-card p-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{row.id}</p>
            <p className="font-display text-3xl">{row.status}</p>
            <p className="text-sm text-muted">{row.detail}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {data.live.length} live · {data.activeMatchrooms} matchrooms
      </p>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Markets</h2>
        <ul className="mt-3 divide-y divide-line border border-line bg-card">
          {data.markets.map((market) => (
            <li key={market.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div>
                <p>{market.question}</p>
                <p className="text-sm text-muted">
                  {market.status}
                  {market.pantaMarketId ? ` · ${market.pantaMarketId.slice(0, 6)}…` : ""}
                  {market.failureReason ? ` · ${market.failureReason}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {market.status === "AWAITING_SIGNATURE" ? (
                  <button type="button" onClick={() => void signCreate(market.id).catch((caught: Error) => setError(caught.message))} className="focus-ring min-h-11 bg-foreground px-3 text-sm text-ink">
                    Sign create
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void api(`/admin/markets/${market.id}/disable`, { method: "POST" }).then(() => client.invalidateQueries({ queryKey: ["admin"] }))}
                  className="focus-ring min-h-11 bg-panel px-3 text-sm"
                >
                  Disable
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Reports</h2>
        <ul className="mt-3 border border-line bg-card">
          {data.reports.map((report) => (
            <li key={report.id} className="px-3 py-2 text-sm">
              {report.reporter.displayName}: {report.reason}
            </li>
          ))}
          {data.reports.length === 0 ? <li className="px-3 py-3 text-sm text-muted">No open reports.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Generation log</h2>
        <ul className="mt-3 max-h-80 overflow-auto border border-line bg-card">
          {data.logs.map((log) => (
            <li key={log.id} className="px-3 py-2 text-sm">
              <span className="text-muted">{log.level}</span> {log.message}
            </li>
          ))}
        </ul>
      </section>
      <button type="button" onClick={() => void api("/admin/sync", { method: "POST" }).then(() => client.invalidateQueries({ queryKey: ["admin"] }))} className="focus-ring min-h-11 bg-panel px-4 text-sm">
        Sync football feed
      </button>
    </div>
  );
}
