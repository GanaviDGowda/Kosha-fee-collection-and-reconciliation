"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/permissions";
import { COLLEGE } from "@/lib/demo/college";
import { navFor } from "@/components/shell/nav";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded px-1 py-1">
      {/* A passbook page: two ruled lines. */}
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--ink)" />
        <path d="M6 8.5h10M6 12h10M6 15.5h6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="leading-tight">
        <span className="block text-md font-semibold tracking-[-0.01em]">Kosha</span>
        {compact ? null : <span className="block text-xs text-muted">{COLLEGE.name}</span>}
      </span>
    </Link>
  );
}

export function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="space-y-0.5">
        {navFor(role).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded px-2.5 text-base text-muted transition-colors hover:bg-canvas hover:text-ink",
                  active && "bg-canvas font-medium text-ink",
                )}
              >
                <Icon className={cn("size-4", active ? "text-accent" : "text-muted")} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-sidebar shrink-0 flex-col lg:flex">
      <div className="flex h-topbar items-center border-b border-line px-4">
        <Wordmark />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks role={role} />
      </div>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        Academic year {COLLEGE.academicYear}
        <br />
        Amounts in ₹, dates in IST
      </div>
    </aside>
  );
}
