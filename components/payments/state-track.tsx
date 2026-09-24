import { Check, Circle, Clock, X, Undo2 } from "lucide-react";
import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { STATUS_LABEL, isOnlineMode, type PaymentMode, type PaymentStatus } from "@/lib/domain/payment-state";

type Event = { id: number; fromStatus: PaymentStatus | null; toStatus: PaymentStatus; note: string | null; actor: string; createdAt: string };

const actorName = (a: string) => (isRole(a) ? ROLE_LABEL[a] : a === "gateway" ? "Gateway" : a === "system" ? "System" : a);

const DOT: Record<PaymentStatus, { icon: typeof Check; className: string }> = {
  INITIATED: { icon: Circle, className: "bg-canvas text-muted border-line-strong" },
  PENDING: { icon: Clock, className: "tint-pending border-transparent" },
  SUCCESS: { icon: Check, className: "tint-credit border-transparent" },
  FAILED: { icon: X, className: "tint-debit border-transparent" },
  REVERSED: { icon: Undo2, className: "tint-reversed border-transparent" },
};

/** Every transition the payment went through, oldest first, with who did it and when. */
export function StateTrack({ events, status, mode }: { events: Event[]; status: PaymentStatus; mode: PaymentMode }) {
  // What could still happen next, shown as a faint step so the track reads as a lifecycle.
  const next: { label: string; hint: string } | null =
    status === "PENDING"
      ? { label: "Success or failed", hint: "Waiting for the gateway. Check status or reconciliation will settle it." }
      : status === "INITIATED" && isOnlineMode(mode)
        ? { label: "Pending", hint: "Not yet sent to the gateway." }
        : null;

  return (
    <ol className="relative">
      {events.map((e, i) => {
        const { icon: Icon, className } = DOT[e.toStatus];
        const last = i === events.length - 1 && !next;
        return (
          <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last ? <span className="absolute left-[13px] top-7 h-[calc(100%-24px)] w-px bg-line" aria-hidden /> : null}
            <span className={cn("relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border", className)}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-medium">{STATUS_LABEL[e.toStatus]}</p>
              <p className="figure text-sm text-muted">
                {formatDateTime(e.createdAt)} · {actorName(e.actor)}
              </p>
              {e.note ? <p className="mt-0.5 text-sm">{e.note}</p> : null}
            </div>
          </li>
        );
      })}
      {next ? (
        <li className="relative flex gap-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface" aria-hidden />
          <div className="pt-0.5">
            <p className="font-medium text-muted">{next.label}</p>
            <p className="text-sm text-muted">{next.hint}</p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}
