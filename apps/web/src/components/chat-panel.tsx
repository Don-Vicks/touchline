"use client";

import { useEffect, useRef } from "react";
import { Kit } from "@/components/kit";
import type { ChatLine } from "@/lib/types";

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function ChatPanel({
  title,
  kicker,
  messages,
  body,
  onBody,
  onSend,
  placeholder,
  disabled,
  error,
  reactions,
  inputId = "chat-body",
  replyTo,
  onReply,
  onClearReply,
}: {
  title: string;
  kicker: string;
  messages: ChatLine[];
  body: string;
  onBody: (value: string) => void;
  onSend: (event: React.FormEvent) => void;
  placeholder: string;
  disabled: boolean;
  error?: string | null;
  reactions?: React.ReactNode;
  inputId?: string;
  replyTo?: ChatLine | null;
  onReply?: (message: ChatLine) => void;
  onClearReply?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const byId = new Map(messages.map((row) => [row.id, row]));
  const lines = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines.length, replyTo?.id]);

  return (
    <section className="flex h-full min-h-[22rem] flex-col bg-card/90 ring-1 ring-line md:min-h-[28rem]">
      <header className="flex items-end justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="kicker">{kicker}</p>
          <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
        </div>
        <span className="font-display text-sm uppercase tracking-[0.14em] text-muted">{lines.length} lines</span>
      </header>
      {reactions}
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.length ? (
          lines.map((message) => {
            const system = message.kind !== "message";
            const parent = message.replyTo ?? (message.replyToId ? byId.get(message.replyToId) : null);
            return (
              <article key={message.id} className={system ? "rounded-sm bg-turf/40 px-3 py-2" : "flex gap-3"}>
                {system ? (
                  <p className="text-sm">
                    <span className="kicker mr-2">{message.kind === "receipt" ? "Call" : "Room"}</span>
                    {message.body}
                    {message.kind === "receipt" && message.meta && typeof message.meta === "object" && "explorerUrl" in message.meta && typeof (message.meta as { explorerUrl?: string }).explorerUrl === "string" ? (
                      <>
                        {" "}
                        <a href={(message.meta as { explorerUrl: string }).explorerUrl} target="_blank" rel="noreferrer" className="focus-ring text-lime underline">
                          Receipt
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <>
                    <Kit name={message.user.displayName} imageUrl={message.user.avatarUrl} seed={message.user.username} size="sm" />
                    <div className="min-w-0 flex-1">
                      {parent ? (
                        <p className="mb-1 truncate border-l-2 border-lime pl-2 text-xs text-muted">
                          {parent.user.displayName}: {parent.body}
                        </p>
                      ) : null}
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium">{message.user.displayName}</span>
                        <time className="font-display text-xs tabular-nums text-muted" dateTime={message.createdAt}>
                          {stamp(message.createdAt)}
                        </time>
                        {onReply && !disabled ? (
                          <button type="button" onClick={() => onReply(message)} className="focus-ring ml-auto text-xs uppercase tracking-widest text-lime">
                            Reply
                          </button>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug">{message.body}</p>
                    </div>
                  </>
                )}
              </article>
            );
          })
        ) : (
          <p className="text-sm text-muted">Talk like you’re on the next stool. First voice sets the tone.</p>
        )}
      </div>
      <div className="sticky bottom-16 z-20 border-t border-line bg-card md:bottom-0 md:static">
      {replyTo ? (
        <div className="flex items-center justify-between gap-2 bg-turf/40 px-3 py-2 text-sm">
          <p className="min-w-0 truncate">
            Replying to <span className="text-foreground">{replyTo.user.displayName}</span> — {replyTo.body}
          </p>
          <button type="button" onClick={onClearReply} className="focus-ring shrink-0 text-xs uppercase tracking-widest text-muted">
            Cancel
          </button>
        </div>
      ) : null}
      <form onSubmit={onSend} className="flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label className="sr-only" htmlFor={inputId}>
          Message
        </label>
        <input
          id={inputId}
          value={body}
          onChange={(event) => onBody(event.target.value)}
          maxLength={500}
          placeholder={placeholder}
          disabled={disabled}
          className="focus-ring min-h-11 flex-1 bg-panel px-3 text-sm"
        />
        <button type="submit" disabled={disabled} className="focus-ring min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink disabled:opacity-50">
          Send
        </button>
      </form>
      {error ? (
        <p className="px-4 pb-3 text-sm text-no" role="alert">
          {error}
        </p>
      ) : null}
      </div>
    </section>
  );
}
