"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      await client.invalidateQueries({ queryKey: ["me"] });
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-md space-y-4">
      <p className="kicker">Season ticket</p>
      <h1 className="font-serif text-5xl tracking-tight">Sign in</h1>
      <p className="text-sm text-muted">Walk in without a wallet. Connect one when you take a side.</p>
      <label className="block text-sm" htmlFor="email">
        Email
        <input id="email" name="email" type="email" autoComplete="email" required className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <label className="block text-sm" htmlFor="password">
        Password
        <input id="password" name="password" type="password" autoComplete="current-password" required className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="focus-ring text-foreground">
          Create a profile
        </Link>
      </p>
    </form>
  );
}
