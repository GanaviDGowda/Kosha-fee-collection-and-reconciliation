"use client";

// Reverse (SUCCESS -> REVERSED, admin) and mark as failed (PENDING -> FAILED). Both need a
// reason and are final, so the drawer spells out what will happen before the button.

import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/dates";
import { MODE_LABEL, type PaymentMode } from "@/lib/domain/payment-state";
import { formatINR } from "@/lib/money";

export type TransitionTarget = {
  id: string;
  amountPaise: number;
  mode: PaymentMode;
  receiptNo: string | null;
  gatewayRef: string | null;
  date: string;
  allocations: { label: string; amountPaise: number }[];
};

export function PaymentTransitionDrawer({
  kind,
  payment,
  onOpenChange,
  onDone,
}: {
  kind: "reverse" | "fail";
  payment: TransitionTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = kind === "reverse" ? 5 : 3;

  useEffect(() => {
    setReason("");
    setTouched(false);
    setError(null);
  }, [payment]);

  const reasonError = reason.trim().length < min ? `Give a reason (at least ${min} characters).` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!payment || reasonError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/payments/${payment.id}/${kind}`, { body: { reason: reason.trim() } });
      toast.success(kind === "reverse" ? "Payment reversed" : "Payment marked as failed", `${formatINR(payment.amountPaise, { paise: "auto" })}${payment.receiptNo ? `, receipt ${payment.receiptNo}` : ""}.`);
      onDone();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Nothing was changed.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = kind === "reverse" ? "Reverse payment" : "Mark payment as failed";
  return (
    <Sheet open={payment !== null} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      {payment ? (
        <SheetContent
          title={title}
          description={`${formatINR(payment.amountPaise)} by ${MODE_LABEL[payment.mode].toLowerCase()} on ${formatDate(payment.date)}`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" form="transition" variant="danger" loading={submitting}>
                {submitting ? (kind === "reverse" ? "Reversing" : "Saving") : title}
              </Button>
            </div>
          }
        >
          <form id="transition" onSubmit={submit} noValidate className="space-y-5">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
              {payment.receiptNo ? (
                <>
                  <dt className="text-muted">Receipt</dt>
                  <dd className="font-mono">{payment.receiptNo}</dd>
                </>
              ) : null}
              {payment.gatewayRef ? (
                <>
                  <dt className="text-muted">Gateway ref</dt>
                  <dd className="font-mono">{payment.gatewayRef}</dd>
                </>
              ) : null}
            </dl>

            <div className="rounded border border-line px-3.5 py-3 text-sm">
              {kind === "reverse" ? (
                <>
                  <p className="font-medium">What happens</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                    <li>A new reversal entry of {formatINR(payment.amountPaise, { paise: "auto" })} is added to the ledger. The original entry stays, shown struck through.</li>
                    {payment.allocations.length > 0 ? (
                      <li>
                        These installments reopen: {payment.allocations.map((a) => `${a.label} (${formatINR(a.amountPaise, { paise: "auto" })})`).join(", ")}.
                      </li>
                    ) : null}
                    <li>The receipt stays on record, marked reversed. This cannot be undone; a new payment must be recorded instead.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-medium">What happens</p>
                  <p className="mt-1 text-muted">The payment moves from pending to failed. Nothing is posted to the ledger. If the money did arrive, it will show up in reconciliation.</p>
                </>
              )}
            </div>

            <div>
              <Label htmlFor="t-reason">Reason</Label>
              <Textarea
                id="t-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder={kind === "reverse" ? "e.g. Cheque bounced: insufficient funds" : "e.g. Payer confirms the UPI debit never happened"}
                aria-invalid={Boolean(touched && reasonError)}
                autoFocus
              />
              <FieldError>{touched ? reasonError : null}</FieldError>
            </div>
            {error ? (
              <div role="alert" className="flex gap-2.5 rounded tint-debit px-3.5 py-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="text-ink">{error}</p>
              </div>
            ) : null}
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
