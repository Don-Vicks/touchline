"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatUsdc, formatXp } from "@/lib/format";
import { signAndSendInstructions } from "@/lib/solana-ix";
import type { MarketCard, MePayload } from "@/lib/types";

interface PredictionRow {
  id: string;
  side: string;
  status: string;
  result: string;
  amountUsdc: string;
  shares: string | null;
  xpAwarded: number;
  signature: string | null;
  explorerUrl: string | null;
  claimExplorerUrl: string | null;
  claimedAt: string | null;
  claimable: boolean;
  createdAt: string;
  match: { id: string; home: string; away: string; competition: string };
  market: MarketCard;
}

const filters = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "claim", label: "To claim" },
] as const;

export default function CallsPage() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });
  const list = useQuery({
    queryKey: ["predictions"],
    queryFn: () => api<{ predictions: PredictionRow[] }>("/predictions"),
    enabled: Boolean(me.data?.user),
  });
  const { publicKey, signTransaction, connected } = useWallet();
  const modal = useWalletModal();
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = list.data?.predictions ?? [];
    if (filter === "open") return all.filter((row) => row.result === "PENDING");
    if (filter === "won") return all.filter((row) => row.result === "CORRECT" || row.claimable || row.claimedAt);
    if (filter === "lost") return all.filter((row) => row.result === "INCORRECT");
    if (filter === "claim") return all.filter((row) => row.claimable);
    return all;
  }, [list.data, filter]);

  async function claim(row: PredictionRow) {
    setError(null);
    if (!connected || !publicKey || !signTransaction) {
      modal.setVisible(true);
      return;
    }
    setBusy(row.id);
    try {
      const built = await api<{
        recentBlockhash: string;
        lastValidBlockHeight: number;
        instructions: { programId: string; data: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[] }[];
      }>(`/predictions/${row.id}/claim/build`, { method: "POST" });
      const signature = await signAndSendInstructions({
        publicKey,
        signTransaction,
        recentBlockhash: built.recentBlockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
        instructions: built.instructions,
      });
      await api(`/predictions/${row.id}/claim/submit`, { method: "POST", body: JSON.stringify({ signature }) });
      await client.invalidateQueries({ queryKey: ["predictions"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not claim.");
    } finally {
      setBusy(null);
    }
  }

  if (me.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!me.data?.user) {
    return (
      <p className="text-sm text-muted">
        <Link href="/login" className="focus-ring text-foreground underline">
          Sign in
        </Link>{" "}
        to see your calls.
      </p>
    );
  }
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => list.refetch()} />;

  return (
    <div>
      <p className="kicker">Your sides</p>
      <h1 className="font-serif text-5xl tracking-tight">Calls</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">Every YES/NO you took. Claim USDC when Panta marks a win. XP is already in when the call settles.</p>
      <div className="mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter">
        {filters.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setFilter(row.id)}
            className={`focus-ring min-h-11 shrink-0 px-4 font-display text-sm uppercase tracking-[0.12em] ${filter === row.id ? "bg-lime text-ink" : "bg-panel text-muted"}`}
          >
            {row.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-4 text-sm text-live" role="alert">
          {error}
        </p>
      ) : null}
      {list.isLoading ? <Skeleton className="mt-6 h-32 w-full" /> : null}
      {!list.isLoading && rows.length === 0 ? (
        <Empty title="No calls in this list" body="Take a side in a matchroom. Wins to claim show up here after settlement." />
      ) : null}
      <ul className="mt-4">
        {rows.map((row) => (
          <li key={row.id} className="grid min-h-16 grid-cols-1 gap-2 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="kicker">
                {row.match.competition} · {row.match.home} vs {row.match.away}
              </p>
              <p className="mt-1 font-medium leading-snug">{row.market.question}</p>
              <p className="mt-1 text-sm text-muted">
                {row.side}
                {Number(row.amountUsdc) > 0 ? ` · ${formatUsdc(row.amountUsdc)} USDC` : " · XP"}
                {row.shares ? ` · ${row.shares} shares` : ""}
                {row.result === "PENDING" ? ` · ${row.status.toLowerCase()}` : ` · ${row.result.toLowerCase()}`}
                {row.xpAwarded ? ` · +${formatXp(row.xpAwarded)} XP` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href={`/match/${row.match.id}`} className="focus-ring font-display text-xs uppercase tracking-[0.14em] text-muted">
                  Room
                </Link>
                {row.explorerUrl ? (
                  <a href={row.explorerUrl} target="_blank" rel="noreferrer" className="focus-ring font-display text-xs uppercase tracking-[0.14em] text-lime">
                    Buy receipt
                  </a>
                ) : null}
                {row.claimExplorerUrl ? (
                  <a href={row.claimExplorerUrl} target="_blank" rel="noreferrer" className="focus-ring font-display text-xs uppercase tracking-[0.14em] text-lime">
                    Claim receipt
                  </a>
                ) : null}
              </div>
            </div>
            {row.claimable ? (
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => void claim(row)}
                className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink disabled:opacity-50"
              >
                {busy === row.id ? "Claiming…" : "Claim win"}
              </button>
            ) : row.claimedAt ? (
              <span className="font-display text-sm uppercase tracking-[0.14em] text-flood">Claimed</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
