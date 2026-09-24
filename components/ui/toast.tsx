"use client";

// Minimal toast: one live region, short messages that repeat the action ("Payment recorded").
// Bottom-left, so it never covers the drawer's submit button on the right.

import { CheckCircle2, AlertCircle, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; kind: "success" | "error"; title: string; description?: string };
type ToastApi = { success: (title: string, description?: string) => void; error: (title: string, description?: string) => void };

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = React.useCallback(
    (kind: Toast["kind"], title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500);
    },
    [dismiss],
  );
  const api = React.useMemo<ToastApi>(() => ({ success: (t, d) => push("success", t, d), error: (t, d) => push("error", t, d) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-panel border border-line bg-surface p-3.5 shadow-overlay">
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-credit" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-debit" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", t.kind === "error" && "text-debit")}>{t.title}</p>
              {t.description ? <p className="mt-0.5 text-sm text-muted">{t.description}</p> : null}
            </div>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
