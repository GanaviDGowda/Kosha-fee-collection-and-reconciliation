"use client";

// ⌘K / Ctrl+K palette: jump to a student by name or roll number, or to a page.
// Implemented on Radix Dialog with a listbox (aria-activedescendant) for full keyboard use.

import * as Dialog from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import type { Role } from "@/lib/auth/permissions";
import { navFor } from "@/components/shell/nav";

type StudentHit = { studentId: string; rollNo: string; name: string; courseCode: string; balancePaise: number; status: string };
type Item = { id: string; kind: "student" | "page"; label: string; sub?: string; right?: string; href: string };

const PaletteContext = React.createContext<{ open: () => void }>({ open: () => {} });
export const usePalette = () => React.useContext(PaletteContext);

// Case- and accent-insensitive: split accents off (NFD) and drop them.
function normalise(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function CommandPaletteProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [students, setStudents] = React.useState<StudentHit[] | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const canSearchStudents = role !== "student";

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load the roster when the page goes idle (so ⌘K opens instantly) and again on each open,
  // so a payment recorded meanwhile shows an up-to-date balance. 60 students filter fine in the browser.
  const [prefetch, setPrefetch] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setPrefetch(true), 1200);
    return () => window.clearTimeout(t);
  }, []);
  React.useEffect(() => {
    if ((!open && !prefetch) || !canSearchStudents) return;
    let cancelled = false;
    setLoadError(false);
    fetch("/api/students")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { data: StudentHit[] }) => !cancelled && setStudents(j.data))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [open, prefetch, canSearchStudents]);

  const items = React.useMemo<Item[]>(() => {
    const q = normalise(query);
    const pages: Item[] = navFor(role).map((n) => ({ id: `page:${n.href}`, kind: "page", label: n.label, href: n.href }));
    const matchingPages = q ? pages.filter((p) => normalise(p.label).includes(q)) : pages;
    const matchingStudents = (students ?? [])
      .filter((s) => !q || normalise(`${s.name} ${s.rollNo}`).includes(q) || normalise(s.rollNo.replace("-", "")).includes(q.replace(/ /g, "")))
      .slice(0, q ? 8 : 5)
      .map<Item>((s) => ({
        id: `student:${s.studentId}`,
        kind: "student",
        label: s.name,
        sub: `${s.rollNo} · ${s.courseCode}`,
        right: s.balancePaise < 0 ? `Advance ${formatINR(-s.balancePaise, { paise: "auto" })}` : formatINR(s.balancePaise, { paise: "auto" }),
        href: `/students/${s.rollNo}`,
      }));
    return [...matchingStudents, ...matchingPages];
  }, [query, students, role]);

  React.useEffect(() => setActive(0), [query]);
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  }

  const studentItems = items.filter((i) => i.kind === "student");
  const pageItems = items.filter((i) => i.kind === "page");
  let index = -1;
  const renderItem = (item: Item) => {
    index += 1;
    const i = index;
    return (
      <li
        key={item.id}
        id={`palette-${i}`}
        data-index={i}
        role="option"
        aria-selected={active === i}
        onMouseMove={() => setActive(i)}
        onClick={() => go(item)}
        className={cn("flex cursor-pointer items-center gap-3 rounded px-3 py-2", active === i && "bg-canvas")}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.label}</span>
          {item.sub ? <span className="block font-mono text-xs text-muted">{item.sub}</span> : null}
        </span>
        {item.right ? <span className="figure text-sm text-muted">{item.right}</span> : null}
        {active === i ? <CornerDownLeft className="size-3.5 text-muted" aria-hidden /> : null}
      </li>
    );
  };

  return (
    <PaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 data-[state=open]:animate-fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-[12vh] z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-panel border border-line bg-surface shadow-overlay data-[state=open]:animate-pop-in focus:outline-none"
            onKeyDown={onKeyDown}
          >
            <Dialog.Title className="sr-only">Go to a student or page</Dialog.Title>
            <Dialog.Description className="sr-only">Type a name or roll number, use the arrow keys to choose and Enter to open.</Dialog.Description>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-muted" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={canSearchStudents ? "Search students by name or roll number" : "Go to a page"}
                className="h-12 flex-1 bg-transparent text-md outline-none placeholder:text-muted"
                role="combobox"
                aria-expanded
                aria-controls="palette-list"
                aria-activedescendant={items.length ? `palette-${active}` : undefined}
                aria-label="Search"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">Esc</kbd>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
              {canSearchStudents && students === null && !loadError ? (
                <li className="space-y-2 px-3 py-2" aria-hidden>
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="skeleton block h-8" />
                  ))}
                </li>
              ) : null}
              {loadError ? <li className="px-3 py-2 text-sm text-debit">Could not load students. Close and try again.</li> : null}
              {studentItems.length > 0 ? <li className="px-3 pb-1 pt-2 text-xs text-muted" role="presentation">Students</li> : null}
              {studentItems.map(renderItem)}
              {pageItems.length > 0 ? <li className="px-3 pb-1 pt-3 text-xs text-muted" role="presentation">Pages</li> : null}
              {pageItems.map(renderItem)}
              {items.length === 0 && students !== null ? (
                <li className="px-3 py-6 text-center text-muted">No student or page matches “{query}”.</li>
              ) : null}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PaletteContext.Provider>
  );
}

/** Phones: an icon in the top bar in place of the search field. */
export function SearchIconTrigger() {
  const { open } = usePalette();
  return (
    <button onClick={open} className="rounded p-2 text-ink hover:bg-canvas" aria-label="Search students">
      <Search className="size-4" aria-hidden />
    </button>
  );
}

export function SearchTrigger() {
  const { open } = usePalette();
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button
      onClick={open}
      className="flex h-9 w-full max-w-[380px] items-center gap-2.5 rounded border border-line-strong bg-surface px-3 text-left text-muted transition-colors hover:border-muted/50"
      aria-label="Search students"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">Search students</span>
      <kbd className="hidden rounded border border-line px-1.5 text-xs sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
