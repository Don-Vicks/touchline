"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatCents, formatUsdc, formatXp } from "@/lib/format";
import type { MarketCard, MePayload } from "@/lib/types";

interface PredictionRow {
  id: string;
  side: string;
  status: string;
  result: string;
  amountUsdc: string;
  xpAwarded: number;
  market: MarketCard;
}

export default function MePage() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });
  const history = useQuery({
    queryKey: ["predictions"],
    queryFn: () => api<{ predictions: PredictionRow[] }>("/predictions"),
    enabled: Boolean(me.data?.user),
  });
  const { publicKey, signMessage, connected } = useWallet();
  const modal = useWalletModal();
  if (me.isLoading) return <Skeleton className="h-40 w-full" />;
  if (me.isError) return <ErrorState message={me.error.message} onRetry={() => me.refetch()} />;
  const user = me.data?.user;
  if (!user) {
    return (
      <p className="text-sm text-muted">
        <a className="focus-ring text-foreground" href="/login">
          Sign in
        </a>{" "}
        to see your calls and XP.
      </p>
    );
  }

  async function linkWallet() {
    if (!connected || !publicKey || !signMessage) {
      modal.setVisible(true);
      return;
    }
    const challenge = await api<{ message: string }>("/auth/wallet/challenge", { method: "POST" });
    const signature = await signMessage(new TextEncoder().encode(challenge.message));
    await api("/auth/wallet/verify", {
      method: "POST",
      body: JSON.stringify({ address: publicKey.toBase58(), message: challenge.message, signature: bs58.encode(signature) }),
    });
    await client.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-5xl tracking-tight">{user.displayName}</h1>
        <p className="mt-2 text-sm text-muted">@{user.username}</p>
        <p className="mt-3 font-display text-4xl tabular-nums">
          {formatXp(user.xp)} <span className="text-2xl text-muted">XP</span>
        </p>
        <p className="text-sm text-muted">Global #{user.rank ?? "—"}</p>
      </header>
      <section className="border border-line bg-card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Wallet</h2>
        <p className="mt-2 text-sm">{user.walletAddress ?? "Not linked. You can still hang in the matchroom."}</p>
        <button type="button" onClick={() => void linkWallet()} className="focus-ring mt-3 min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
          {user.walletAddress ? "Relink wallet" : "Link wallet"}
        </button>
      </section>
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted">Your calls</h2>
        {history.isLoading ? <Skeleton className="mt-3 h-20 w-full" /> : null}
        {history.data?.predictions.length === 0 ? <p className="mt-3 text-sm text-muted">No calls yet.</p> : null}
        <ul className="mt-3 divide-y divide-line border border-line bg-card">
          {history.data?.predictions.map((row) => (
            <li key={row.id} className="px-3 py-3">
              <p>{row.market.question}</p>
              <p className="mt-1 text-sm text-muted">
                {row.side} · {formatUsdc(row.amountUsdc)} · {row.result === "PENDING" ? row.status.toLowerCase() : row.result.toLowerCase()}
                {row.xpAwarded ? ` · +${formatXp(row.xpAwarded)} XP` : ""}
                {row.market.yesPrice ? ` · yes ${formatCents(row.market.yesPrice).text}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
