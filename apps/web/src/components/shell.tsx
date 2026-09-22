"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MePayload } from "@/lib/types";

const links = [
  { href: "/matches", label: "Matches" },
  { href: "/squads", label: "Squads" },
  { href: "/rankings", label: "Ranks" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/auth/me") });
  const user = me.data?.user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#content" className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
          <Link href="/" className="focus-ring font-serif text-[1.7rem] leading-none tracking-tight">
            Touchline
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} className={`focus-ring text-sm ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}>
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            {user?.role === "ADMIN" ? (
              <Link href="/admin" className="focus-ring hidden text-sm text-muted md:inline">
                Desk
              </Link>
            ) : null}
            {user ? (
              <Link href="/me" className="focus-ring inline-flex min-h-11 items-center gap-2 text-sm">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-panel text-xs">{user.displayName.slice(0, 1)}</span>
                <span className="hidden sm:inline">{user.displayName}</span>
              </Link>
            ) : (
              <Link href="/login" className="focus-ring inline-flex min-h-11 items-center bg-foreground px-4 text-sm text-ink">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-6xl px-5 pb-24 pt-8 md:pb-20">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-background/95 backdrop-blur md:hidden" aria-label="Mobile">
        {[
          { href: "/", label: "Home" },
          ...links,
        ].map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={`focus-ring flex min-h-14 items-center justify-center text-sm ${active ? "text-foreground" : "text-muted"}`}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
