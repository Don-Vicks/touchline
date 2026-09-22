"use client";

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
  if (!notes.data?.notifications.length) return <Empty title="You’re caught up" body="Kickoff, new calls, and replies land here." />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-5xl tracking-tight">Notices</h1>
        <button
          type="button"
          className="focus-ring min-h-11 px-3 text-sm text-foreground"
          onClick={() => void api("/notifications/read", { method: "POST" }).then(() => client.invalidateQueries({ queryKey: ["notes"] }))}
        >
          Mark read
        </button>
      </div>
      <ul className="divide-y divide-line border border-line bg-card">
        {notes.data.notifications.map((note) => (
          <li key={note.id} className="px-3 py-3">
            <p>{note.title}</p>
            <p className="text-sm text-muted">{note.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
