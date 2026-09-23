"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import bs58 from "bs58";
import { Kit } from "@/components/kit";
import { ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";
import { formatXp } from "@/lib/format";
import type { MePayload } from "@/lib/types";

function AvatarForm({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const [url, setUrl] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/users/me", { method: "PATCH", body: JSON.stringify({ avatarUrl: url.trim() ? url.trim() : null }) });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save headshot.");
    }
  }
  async function fromFile(file: File) {
    setError(null);
    if (file.size > 400_000) {
      setError("Photo must be under 400KB.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
    try {
      await api("/users/me/avatar", { method: "POST", body: JSON.stringify({ image: data }) });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save headshot.");
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="space-y-3 bg-card p-4 ring-1 ring-line">
      <p className="kicker">Headshot</p>
      <label className="block text-sm" htmlFor="avatar-file">
        Photo from your device
        <input
          id="avatar-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="focus-ring mt-1 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void fromFile(file);
          }}
        />
      </label>
      <label className="block text-sm" htmlFor="avatar-url">
        Or photo URL
        <input id="avatar-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <button type="submit" className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
        Save URL
      </button>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const form = new FormData(event.currentTarget);
    try {
      await api("/users/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.get("current"), newPassword: form.get("next") }),
      });
      setDone(true);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change password.");
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="space-y-3 bg-card p-4 ring-1 ring-line">
      <p className="kicker">Password</p>
      <label className="block text-sm" htmlFor="pw-current">
        Current
        <input id="pw-current" name="current" type="password" required className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <label className="block text-sm" htmlFor="pw-next">
        New (8+ characters)
        <input id="pw-next" name="next" type="password" required minLength={8} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <button type="submit" className="focus-ring min-h-11 bg-panel px-4 font-display text-sm uppercase tracking-[0.12em]">
        Change password
      </button>
      {done ? <p className="text-sm">Password updated.</p> : null}
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export default function MePage() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });

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
      <header className="flex flex-wrap items-end gap-4 bg-card/80 p-5 ring-1 ring-line">
        <Kit name={user.displayName} imageUrl={user.avatarUrl} seed={user.username} size="lg" />
        <div>
        <p className="kicker">Your shirt</p>
        <h1 className="font-serif text-5xl tracking-tight">{user.displayName}</h1>
        <p className="mt-2 text-sm text-muted">@{user.username}</p>
        <p className="mt-3 font-display text-4xl tabular-nums">
          {formatXp(user.xp)} <span className="text-2xl text-muted">XP</span>
        </p>
        <p className="text-sm text-muted">Global #{user.rank ?? "—"}</p>
        </div>
      </header>
      <AvatarForm current={user.avatarUrl} onSaved={() => client.invalidateQueries({ queryKey: ["me"] })} />
      <PasswordForm />
      <section className="bg-card p-4 ring-1 ring-line">
        <h2 className="kicker">Wallet</h2>
        <p className="mt-2 text-sm">{user.walletAddress ?? "Not linked. You can still hang in the matchroom."}</p>
        <button type="button" onClick={() => void linkWallet()} className="focus-ring mt-3 min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
          {user.walletAddress ? "Relink wallet" : "Link wallet"}
        </button>
      </section>
      <p className="text-sm">
        <a href="/calls" className="focus-ring font-display uppercase tracking-[0.14em] text-lime">
          Your calls →
        </a>
      </p>
    </div>
  );
}
