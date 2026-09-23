"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Kit } from "@/components/kit";
import { api } from "@/lib/api";
import type { MePayload } from "@/lib/types";

const links = [
  { href: "/matches", label: "Fixtures" },
  { href: "/calls", label: "Calls" },
  { href: "/squads", label: "Squads" },
  { href: "/rankings", label: "Table" },
];

function BallMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#f3efe2" />
      <path fill="#07140c" d="M16 8.2 19.6 11l-1.4 4.4h-4.4L12.4 11z" />
      <path fill="#07140c" d="M7.4 13.2 11 11.4l1.6 4.2-3.2 2.8-3-2.2zM24.6 13.2l3 3-3 2.2-3.2-2.8 1.6-4.2zM11.2 22.2 13.2 18h5.6l2 4.2-2.8 3.2h-4z" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me"), refetchInterval: 30_000 });
  const user = me.data?.user;

  return (
    <div className="min-h-screen text-foreground">
      <a href="#content" className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-[#07140c]/90 backdrop-blur-md">
        <div className="h-1 w-full bg-gradient-to-r from-turf via-lime to-turf" />
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-6 px-5">
          <Link href="/" className="focus-ring flex items-center gap-3">
            <BallMark />
            <span className="leading-none">
              <span className="kicker block">Worldwide matchday</span>
              <span className="font-serif text-[1.85rem] tracking-tight">Touchline</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`focus-ring font-display text-sm uppercase tracking-[0.16em] ${active ? "text-lime" : "text-muted hover:text-foreground"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            {user?.role === "ADMIN" ? (
              <Link href="/admin" className="focus-ring hidden font-display text-sm uppercase tracking-[0.14em] text-muted md:inline">
                Desk
              </Link>
            ) : null}
            {user ? (
              <>
                <Link href="/notifications" className="focus-ring relative inline-flex min-h-11 items-center font-display text-sm uppercase tracking-[0.14em] text-muted">
                  Notes
                  {(user.unreadCount ?? 0) > 0 ? (
                    <span className="ml-1 font-display text-live">{user.unreadCount}</span>
                  ) : null}
                </Link>
                <Link href="/me" className="focus-ring inline-flex min-h-11 items-center gap-2 text-sm">
                  <Kit name={user.displayName} imageUrl={user.avatarUrl} seed={user.username} size="sm" />
                  <span className="hidden sm:inline">{user.displayName}</span>
                </Link>
              </>
            ) : (
              <Link href="/login" className="focus-ring inline-flex min-h-11 items-center bg-lime px-4 font-display text-sm uppercase tracking-[0.12em] text-ink">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-6xl px-5 pb-24 pt-8 md:pb-20">
        {children}
      </main>
      <footer className="mx-auto hidden max-w-6xl px-5 pb-8 text-sm text-muted md:block">
        <Link href="/legal" className="focus-ring">
          How we watch · rights
        </Link>
      </footer>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-[#07140c]/95 backdrop-blur md:hidden" aria-label="Mobile">
        {[{ href: "/", label: "Home" }, ...links].map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`focus-ring flex min-h-14 items-center justify-center font-display text-xs uppercase tracking-[0.14em] ${active ? "text-lime" : "text-muted"}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
