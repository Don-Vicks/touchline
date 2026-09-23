"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatCents, formatUsdc } from "@/lib/format";
import { useTradeDraft } from "@/lib/trade-draft";
import type { MarketCard, MePayload } from "@/lib/types";

const chips = ["5", "10", "25"];
const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export function MarketPanel({ market, signedIn }: { market: MarketCard | null; signedIn: boolean }) {
  const { amount, setAmount } = useTradeDraft();
  const { publicKey, signTransaction, connected } = useWallet();
  const modal = useWalletModal();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });
  const [pending, setPending] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  if (!market) {
    return (
      <section>
        <p className="text-sm text-muted">The call</p>
        <p className="mt-3 font-serif text-4xl leading-tight tracking-tight">Waiting on the next moment</p>
        <p className="mt-2 max-w-md text-sm text-muted">A corner, a card, a goal. The room opens a question when the match gives it one.</p>
      </section>
    );
  }

  const yes = formatCents(market.yesPrice);
  const no = formatCents(market.noPrice);

  async function take(side: "yes" | "no") {
    setError(null);
    setDone(null);
    setReceipt(null);
    if (!signedIn) {
      window.location.href = "/login";
      return;
    }
    if (market?.xpOnly) {
      setPending(side);
      try {
        await api(`/markets/${market.id}/call`, { method: "POST", body: JSON.stringify({ side }) });
        setDone(`${side === "yes" ? "YES" : "NO"} is in. XP only until Panta USDC is live.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not take a side.");
      } finally {
        setPending(null);
      }
      return;
    }
    if (!me.data?.user?.walletAddress) {
      setError("Link a wallet on your profile before you take a side.");
      return;
    }
    if (!connected || !publicKey || !signTransaction) {
      modal.setVisible(true);
      return;
    }
    if (publicKey.toBase58() !== me.data.user.walletAddress) {
      setError("Connect the wallet linked to your profile.");
      return;
    }
    setPending(side);
    try {
      const quoted = await api<{ quoteId: string }>(`/markets/${market!.id}/quote`, {
        method: "POST",
        body: JSON.stringify({ side, amountUsdc: amount }),
      });
      const built = await api<{
        orderId: string;
        recentBlockhash: string;
        lastValidBlockHeight: number;
        instructions: { programId: string; data: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[] }[];
      }>(`/markets/${market!.id}/build`, {
        method: "POST",
        body: JSON.stringify({ quoteId: quoted.quoteId }),
      });
      const instructions = built.instructions.map(
        (ix) =>
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            data: Buffer.from(ix.data, "base64"),
            keys: ix.accounts.map((account) => ({
              pubkey: new PublicKey(account.pubkey),
              isSigner: account.isSigner,
              isWritable: account.isWritable,
            })),
          }),
      );
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: built.recentBlockhash,
        instructions,
      }).compileToV0Message();
      const signed = await signTransaction(new VersionedTransaction(message));
      const connection = new Connection(rpc, "confirmed");
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(
        { signature, blockhash: built.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight },
        "confirmed",
      );
      const submitted = await api<{ explorerUrl?: string }>(`/markets/${market!.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ orderId: built.orderId, signature }),
      });
      setDone(`${side === "yes" ? "YES" : "NO"} is in. ${formatUsdc(amount)} USDC.`);
      if (submitted.explorerUrl) setReceipt(submitted.explorerUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Markets temporarily unavailable.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <p>{market.marketType === "breaking" ? "While it’s live" : "Before kickoff"}</p>
        {market.outcome ? <p className="text-foreground">Settled {market.outcome.toUpperCase()}</p> : null}
      </div>
      <h2 className="mt-3 max-w-xl font-serif text-4xl leading-[1.05] tracking-tight md:text-5xl">{market.question}</h2>
      {market.tradable || market.xpOnly ? (
        <>
          <div className="mt-6 grid grid-cols-2">
            <button type="button" disabled={pending != null} onClick={() => take("yes")} className="focus-ring min-h-20 bg-lime px-4 py-3 text-left text-ink disabled:opacity-60">
              <span className="block text-sm">Yes</span>
              <span className="font-display text-4xl tabular-nums" aria-label={market.xpOnly ? "Yes" : yes.label}>
                {market.xpOnly ? "YES" : yes.text}
              </span>
            </button>
            <button type="button" disabled={pending != null} onClick={() => take("no")} className="focus-ring min-h-20 border border-l-0 border-line px-4 py-3 text-left disabled:opacity-60">
              <span className="block text-sm text-muted">No</span>
              <span className="font-display text-4xl tabular-nums" aria-label={market.xpOnly ? "No" : no.label}>
                {market.xpOnly ? "NO" : no.text}
              </span>
            </button>
          </div>
          {market.xpOnly ? null : (
          <div className="mt-4 flex gap-2" role="group" aria-label="USDC amount">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setAmount(chip)}
                className={`focus-ring min-h-11 min-w-11 px-3 font-display text-sm tabular-nums ${amount === chip ? "bg-lime text-ink" : "bg-panel"}`}
              >
                ${chip}
              </button>
            ))}
          </div>
          )}
          <p className="mt-3 text-sm text-muted">
            {market.xpOnly ? "XP only until Panta is live. Take a side." : "Panta settles the USDC. XP follows the call, not the size."}
          </p>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted">{market.failureReason ?? "This call is closed."}</p>
      )}
      {error ? (
        <p className="mt-3 text-sm text-live" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mt-3 text-sm" role="status">
          {done}
          {receipt ? (
            <>
              {" "}
              <a href={receipt} target="_blank" rel="noreferrer" className="focus-ring text-lime underline">
                On-chain receipt
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {pending ? <p className="mt-3 text-sm text-muted">Waiting on your wallet…</p> : null}
    </section>
  );
}
