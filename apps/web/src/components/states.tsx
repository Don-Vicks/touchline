export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-panel ${className}`} aria-hidden />;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="py-8">
      <p className="font-serif text-3xl tracking-tight">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert">
      <p className="font-serif text-3xl tracking-tight">Couldn’t load this</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="focus-ring mt-4 min-h-11 bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function ProviderNote({ football, panta }: { football?: string; panta?: string }) {
  const notes = [];
  if (football && football !== "up") notes.push("Live data temporarily unavailable.");
  if (panta && panta !== "up") notes.push("Markets temporarily unavailable.");
  if (!notes.length) return null;
  return (
    <p className="text-sm text-muted" role="status">
      {notes.join(" ")} The matchroom stays open.
    </p>
  );
}
