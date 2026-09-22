"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="border border-line bg-card p-6" role="alert">
      <p className="font-display text-3xl tracking-wide">The room hit a snag</p>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <button type="button" onClick={reset} className="focus-ring mt-4 min-h-11 bg-foreground px-4 text-sm font-medium text-ink">
        Try again
      </button>
    </div>
  );
}
