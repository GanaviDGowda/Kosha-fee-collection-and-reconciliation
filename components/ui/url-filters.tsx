"use client";

// Filter bar whose state lives in the URL (?q=&status=...), so filtered lists can be linked
// and survive a refresh. Typing is debounced; selects apply immediately.

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export type FilterSelect = { name: string; label: string; allLabel: string; options: { value: string; label: string }[] };

export function UrlFilters({ searchLabel, searchPlaceholder, selects }: { searchLabel: string; searchPlaceholder: string; selects: FilterSelect[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<number | undefined>(undefined);

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onSearch(value: string) {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply({ q: value.trim() || null }), 250);
  }

  const hasFilters = Boolean(params.get("q") || selects.some((s) => params.get(s.name)));

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-9" aria-label={searchLabel} type="search" />
      </div>
      {selects.map((s) => (
        <Select key={s.name} aria-label={s.label} value={params.get(s.name) ?? ""} onChange={(e) => apply({ [s.name]: e.target.value || null })} className="w-auto min-w-[150px] flex-1 sm:flex-none">
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {hasFilters ? (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
