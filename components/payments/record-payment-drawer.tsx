"use client";

// Record payment. Each time the drawer opens it gets a fresh idempotency key, so a double
// click, a retry after a network error or a refresh-and-resubmit can never create two
// payments. The allocation preview mirrors the database's oldest-due-first rule.

import { AlertCircle, FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, ApiClientError } from "@/lib/client/api";
import type { Installment } from "@/lib/data/students";
import { describeAllocation, previewAllocation } from "@/lib/domain/allocation";
import { MODE_LABEL, isOnlineMode, type PaymentMode, type SimulatedOutcome } from "@/lib/domain/payment-state";
import { formatINR, toPaise } from "@/lib/money";
import type { Role } from "@/lib/auth/permissions";

export type RecordedPayment = {
  id: string;
  status: "INITIATED" | "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";
  amountPaise: number;
  mode: PaymentMode;
  receiptNo: string | null;
  gatewayRef: string | null;
  failureReason: string | null;
  replayed?: boolean;
};

const MAX_PAISE = 100_000_000;

function paiseToInput(paise: number): string {
  if (paise <= 0) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function RecordPaymentDrawer({
  open,
  onOpenChange,
  role,
  student,
  installments,
  suggestedPaise,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  student: { id: string; name: string; rollNo: string };
  installments: Installment[];
  suggestedPaise: number;
  onRecorded: (payment: RecordedPayment) => void;
}) {
  const toast = useToast();
  const studentRole = role === "student";
  const modes: PaymentMode[] = studentRole ? ["UPI", "CARD"] : ["CASH", "UPI", "CARD", "BANK_TRANSFER"];

  const [key, setKey] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>(modes[0]!);
  const [simulate, setSimulate] = useState<SimulatedOutcome>("SUCCEED");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; field?: string } | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);

  // Fresh form (and a fresh idempotency key) every time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setKey(crypto.randomUUID());
    setAmount(paiseToInput(suggestedPaise));
    setMode(studentRole ? "UPI" : "CASH");
    setSimulate("SUCCEED");
    setReference("");
    setTouched(false);
    setServerError(null);
    setDeclined(null);
  }, [open, suggestedPaise, studentRole]);

  const parsed = toPaise(amount);
  const amountError = !parsed.ok ? parsed.error : parsed.paise === 0 ? "Amount must be more than zero." : parsed.paise > MAX_PAISE ? "Above the ₹10,00,000 limit for one payment." : null;
  const amountPaise = parsed.ok ? parsed.paise : 0;
  const online = isOnlineMode(mode);

  const open_ = useMemo(
    () =>
      installments
        .filter((i) => i.remainingPaise > 0)
        .map((i) => ({ installmentId: i.installmentId, label: i.label, dueDate: i.dueDate, feeHeadOrder: i.feeHeadOrder, term: i.term, remainingPaise: i.remainingPaise })),
    [installments],
  );
  const preview = useMemo(() => (amountError ? null : previewAllocation(open_, amountPaise)), [open_, amountPaise, amountError]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (amountError || submitting) return;
    setSubmitting(true);
    setServerError(null);
    setDeclined(null);
    try {
      const payment = await api<RecordedPayment>("/api/payments", {
        body: {
          studentId: student.id,
          amountPaise,
          mode,
          idempotencyKey: key,
          simulate: online ? simulate : null,
          reference: !online && reference.trim() ? reference.trim() : null,
        },
      });
      if (payment.status === "FAILED") {
        // The failed attempt is kept on record; a retry is a new payment with a new key.
        setDeclined(payment.failureReason ?? "The gateway declined the payment.");
        setKey(crypto.randomUUID());
        toast.error("Payment failed", `${formatINR(payment.amountPaise, { paise: "auto" })} was not collected. Nothing was charged.`);
        return;
      }
      if (payment.replayed) toast.success("Payment already recorded", "This form was submitted before; no second payment was made.");
      else if (payment.status === "PENDING") toast.success("Payment pending", `The gateway has not confirmed ${payment.gatewayRef}. Use Check status later.`);
      else toast.success("Payment recorded", `${formatINR(payment.amountPaise, { paise: "auto" })} received. Receipt ${payment.receiptNo}.`);
      onRecorded(payment);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) setServerError({ message: err.message, field: err.field });
      else setServerError({ message: "Something went wrong. Nothing was recorded. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const showAmountError = (touched || amount !== "") && amountError;
  const submitLabel = studentRole ? `Pay ${amountError ? "" : formatINR(amountPaise, { paise: "auto" })}`.trim() : "Record payment";

  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <SheetContent
        title={studentRole ? "Pay online" : "Record payment"}
        description={
          <>
            {student.name} <span className="font-mono">{student.rollNo}</span>
          </>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="record-payment" loading={submitting} disabled={Boolean(amountError)}>
              {submitting ? (online ? "Waiting for gateway" : "Recording") : submitLabel}
            </Button>
          </div>
        }
      >
        <form id="record-payment" onSubmit={submit} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
              <Input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setTouched(true)}
                className="figure pl-7 text-md"
                aria-invalid={Boolean(showAmountError) || serverError?.field === "amountPaise"}
                aria-describedby="amount-help amount-error"
              />
            </div>
            <p id="amount-help" className="mt-1.5 text-sm text-muted">
              {suggestedPaise > 0 ? `Prefilled with what is due now: ${formatINR(suggestedPaise, { paise: "auto" })}.` : "Nothing is due now; anything paid is held as advance."}
            </p>
            <FieldError id="amount-error">{showAmountError || (serverError?.field === "amountPaise" ? serverError.message : null)}</FieldError>
          </div>

          <Segmented name="mode" label="Mode" value={mode} onChange={setMode} options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />

          {online ? (
            <fieldset className="rounded border border-dashed border-pending/60 bg-pending/[0.04] p-3.5">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-pending">
                <FlaskConical className="size-3.5" aria-hidden />
                Demo control: simulate gateway outcome
              </legend>
              <p className="mb-2.5 text-sm text-muted">There is no real gateway. Choose what the mock gateway will answer.</p>
              <Segmented
                name="simulate"
                label="Gateway outcome"
                className="[&_legend]:sr-only"
                value={simulate}
                onChange={setSimulate}
                options={[
                  { value: "SUCCEED", label: "Succeed" },
                  { value: "FAIL", label: "Fail" },
                  { value: "TIMEOUT", label: "Time out" },
                ]}
              />
              <p className="mt-2 text-sm text-muted">
                {simulate === "SUCCEED" && "The gateway confirms at once; a receipt is issued."}
                {simulate === "FAIL" && "The payer's bank declines; nothing is posted to the ledger."}
                {simulate === "TIMEOUT" && "No answer: the payment stays pending until Check status or reconciliation."}
              </p>
            </fieldset>
          ) : (
            <div>
              <Label htmlFor="reference">
                {mode === "BANK_TRANSFER" ? "UTR number" : "Counter memo"} <span className="font-normal text-muted">(optional)</span>
              </Label>
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder={mode === "BANK_TRANSFER" ? "e.g. HDFCN52026092412345" : "e.g. Memo 0418"} />
            </div>
          )}

          <section aria-live="polite" aria-label="Allocation preview" className="rounded border border-line">
            <h3 className="border-b border-line bg-canvas px-3.5 py-2 text-sm font-medium">Where this payment goes</h3>
            {preview && (preview.lines.length > 0 || preview.advancePaise > 0) ? (
              <div className="px-3.5 py-3">
                <p className="mb-2.5">{describeAllocation(preview, amountPaise)}</p>
                <ul className="divide-y divide-line text-sm">
                  {preview.lines.map((l) => (
                    <li key={l.installmentId} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span>
                        {l.label}
                        <span className={cn("ml-2 text-xs", l.clears ? "text-credit" : "text-pending")}>{l.clears ? "cleared" : `${formatINR(l.remainingBeforePaise - l.amountPaise, { paise: "auto" })} still due`}</span>
                      </span>
                      <span className="figure">{formatINR(l.amountPaise)}</span>
                    </li>
                  ))}
                  {preview.advancePaise > 0 ? (
                    <li className="flex items-baseline justify-between gap-3 py-1.5 text-accent">
                      <span>Held as advance</span>
                      <span className="figure">{formatINR(preview.advancePaise)}</span>
                    </li>
                  ) : null}
                </ul>
                {online && simulate !== "SUCCEED" ? (
                  <p className="mt-2 text-sm text-muted">Allocation happens only when the gateway confirms the payment.</p>
                ) : null}
              </div>
            ) : (
              <p className="px-3.5 py-3 text-sm text-muted">Enter an amount to see which installments it clears, oldest due date first.</p>
            )}
          </section>

          {declined ? (
            <div role="alert" className="flex gap-2.5 rounded tint-debit px-3.5 py-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Payment failed: {declined}</p>
                <p className="mt-0.5 text-ink">Nothing was charged and the failed attempt is kept on record. Submit again to retry, or choose another mode.</p>
              </div>
            </div>
          ) : null}
          {serverError && serverError.field !== "amountPaise" ? (
            <div role="alert" className="flex gap-2.5 rounded tint-debit px-3.5 py-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-ink">{serverError.message}</p>
            </div>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
