"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function SignupPage() {
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
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          username: form.get("username"),
          displayName: form.get("displayName"),
        }),
      });
      await client.invalidateQueries({ queryKey: ["me"] });
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-md space-y-4">
      <h1 className="font-serif text-5xl tracking-tight">Create a profile</h1>
      <label className="block text-sm" htmlFor="displayName">
        Name
        <input id="displayName" name="displayName" autoComplete="name" required maxLength={40} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <label className="block text-sm" htmlFor="username">
        Username
        <input id="username" name="username" autoComplete="username" required pattern="[A-Za-z0-9_]{3,20}" className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <label className="block text-sm" htmlFor="email">
        Email
        <input id="email" name="email" type="email" autoComplete="email" required className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      <label className="block text-sm" htmlFor="password">
        Password
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="focus-ring mt-1 min-h-11 w-full bg-panel px-3" />
      </label>
      {error ? (
        <p className="text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="focus-ring min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
        {pending ? "Creating…" : "Create profile"}
      </button>
      <p className="text-sm text-muted">
        Already in?{" "}
        <Link href="/login" className="focus-ring text-foreground">
          Sign in
        </Link>
      </p>
    </form>
  );
}
