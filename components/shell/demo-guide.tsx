"use client";

// Dismissible guide to the seven scenario students. Opens by itself on a browser's first
// visit (remembered in localStorage), and holds "Reset demo data" for admins.

import { BookMarked, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { can, type Role } from "@/lib/auth/permissions";
import { api, errorMessage } from "@/lib/client/api";
import { SCENARIOS } from "@/lib/demo/scenarios";

const SEEN_KEY = "kosha.demoGuideSeen";

export function DemoGuide({ role }: { role: Role }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const canBrowse = can(role, "students.view_all");

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) {
        setOpen(true);
        window.localStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      // Storage blocked (private mode): just don't auto-open.
    }
  }, []);

  async function reset() {
    setResetting(true);
    try {
      await api("/api/demo/reset", { body: {} });
      toast.success("Demo data reset", "60 students and their history are back to the starting story.");
      setConfirming(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Could not reset demo data", errorMessage(err));
    } finally {
      setResetting(false);
    }
  }

  const footer = can(role, "demo.reset") ? (
    confirming ? (
      <div className="space-y-3">
        <p className="text-sm">This deletes every payment, concession and reconciliation run made during the demo and reloads the seed. It cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={resetting}>
            Keep data
          </Button>
          <Button variant="danger" onClick={reset} loading={resetting}>
            {resetting ? "Resetting" : "Reset demo data"}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Start the story over at any time.</p>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          <RotateCcw aria-hidden />
          Reset demo data
        </Button>
      </div>
    )
  ) : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setConfirming(false);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="ghost" aria-label="Open demo guide">
          <BookMarked aria-hidden />
          <span className="hidden md:inline">Demo guide</span>
        </Button>
      </SheetTrigger>
      <SheetContent title="Demo guide" description="Seven students set up to show each part of the ledger. Switch roles in the top bar." footer={footer}>
        {!canBrowse ? (
          <p className="mb-4 rounded tint-accent px-3 py-2 text-sm">
            You are viewing as a student. Switch to Admin or Accountant in the top bar to open the other students.
          </p>
        ) : null}
        <ol className="space-y-1">
          {SCENARIOS.map((s, i) => (
            <li key={s.rollNo} className="rounded border border-transparent px-3 py-3 hover:border-line">
              <div className="flex items-baseline gap-2">
                <span className="figure w-4 text-sm text-muted">{i + 1}</span>
                {canBrowse ? (
                  <Link href={`/students/${s.rollNo}`} onClick={() => setOpen(false)} className="font-medium text-accent hover:underline">
                    {s.name}
                  </Link>
                ) : (
                  <span className="font-medium">{s.name}</span>
                )}
                <span className="font-mono text-xs text-muted">{s.rollNo}</span>
              </div>
              <p className="ml-6 mt-1 text-muted">{s.story}</p>
              <p className="ml-6 mt-1">
                <span className="text-muted">Try: </span>
                {s.tryThis}
              </p>
            </li>
          ))}
        </ol>
        {canBrowse ? (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            For reconciliation, open{" "}
            <Link href="/reconciliation" onClick={() => setOpen(false)} className="text-accent hover:underline">
              Reconciliation
            </Link>{" "}
            and upload the sample settlement file. It produces all four buckets.
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
