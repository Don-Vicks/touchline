"use client";

import { useState } from "react";

export function Kit({
  name,
  imageUrl,
  seed,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  seed?: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const dim = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-[0.7rem]" : "h-10 w-10 text-sm";
  const [failed, setFailed] = useState(false);
  const src = !failed && (imageUrl?.trim() || (seed ? `https://api.dicebear.com/9.x/adventurer/png?seed=${encodeURIComponent(seed)}&size=96` : null));
  if (src) {
    return <img src={src} alt="" className={`shrink-0 rounded-full object-cover ${dim}`} onError={() => setFailed(true)} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-turf font-display uppercase tracking-wide text-foreground ${dim}`} aria-hidden>
      {initials || "?"}
    </span>
  );
}

export function posTone(rank: number) {
  if (rank === 1) return "text-lime";
  if (rank === 2 || rank === 3) return "text-flood";
  return "text-muted";
}
