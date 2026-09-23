"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Empty, ErrorState, Skeleton } from "@/components/states";
import { api } from "@/lib/api";

interface Note {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const client = useQueryClient();
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => api<{ notifications: Note[] }>("/notifications") });
  if (notes.isLoading) return <Skeleton className="h-24 w-full" />;
  if (notes.isError) return <ErrorState message={notes.error.message} onRetry={() => notes.refetch()} />;
  const rows = notes.data?.notifications ?? [];
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="kicker">In the room</p>
          <h1 className="font-serif text-5xl tracking-tight">Notices</h1>
        </div>
        {rows.some((row) => !row.readAt) ? (
          <button
            type="button"
            className="focus-ring min-h-11 px-3 font-display text-sm uppercase tracking-[0.14em] text-muted"
            onClick={() => void api("/notifications/read", { method: "POST" }).then(() => client.invalidateQueries({ queryKey: ["notes"] }).then(() => client.invalidateQueries({ queryKey: ["me"] })))}
          >
            Mark read
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? <Empty title="You’re caught up" body="Kickoff, new calls, and replies land here." /> : null}
      <ul className="mt-6">
        {rows.map((note) => {
          const inner = (
            <>
              <p className={note.readAt ? "text-muted" : "font-medium"}>{note.title}</p>
              <p className="text-sm text-muted">{note.body}</p>
            </>
          );
          return (
            <li key={note.id} className="border-b border-line py-3">
              {note.href ? (
                <Link href={note.href} className="focus-ring block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
