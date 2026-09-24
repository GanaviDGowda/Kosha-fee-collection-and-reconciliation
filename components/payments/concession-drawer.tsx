"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import type { Installment } from "@/lib/data/students";
import { formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";

// A concession can never exceed what is still owed on the installment (the database
// enforces it too). It reduces demand, so it reads as a credit in the statement.
export function ConcessionDrawer({
  open,
  onOpenChange,
  student,
  installments,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { name: string; rollNo: string };
  installments: Installment[];
  onApplied: () => void;
}) {
  const toast = useToast();
  const eligible = useMemo(() => installments.filter((i) => i.remainingPaise > 0), [installments]);
  const [installmentId, setInstallmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; field?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setInstallmentId(eligible[0]?.installmentId ?? "");
    setAmount("");
    setReason("");
    setApprovedBy("");
    setTouched(false);
    setServerError(null);
  }, [open, eligible]);

  const inst = eligible.find((i) => i.installmentId === installmentId);
  const parsed = toPaise(amount);
  const errors = {
    installmentId: inst ? null : "Choose an installment.",
    amountPaise: !parsed.ok ? parsed.error : parsed.paise === 0 ? "Amount must be more than zero." : inst && parsed.paise > inst.remainingPaise ? `At most ${formatINR(inst.remainingPaise, { paise: "auto" })} is still owed on ${inst.label}.` : null,
    reason: reason.trim().length < 3 ? "Give a reason, e.g. merit scholarship or hardship waiver." : null,
    approvedBy: approvedBy.trim().length < 2 ? "Name who approved it." : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (f: keyof typeof errors) => (touched ? errors[f] : null) ?? (serverError?.field === f ? serverError.message : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (hasErrors || submitting || !parsed.ok) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await api("/api/concessions", { body: { installmentId, amountPaise: parsed.paise, reason: reason.trim(), approvedBy: approvedBy.trim() } });
      toast.success("Concession applied", `${formatINR(parsed.paise, { paise: "auto" })} off ${inst?.label}.`);
      onApplied();
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof ApiClientError ? { message: err.message, field: err.field } : { message: "Something went wrong. Nothing was applied." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <SheetContent
        title="Apply concession"
        description={
          <>
            {student.name} <span className="font-mono">{student.rollNo}</span>
          </>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="concession" loading={submitting} disabled={eligible.length === 0}>
              {submitting ? "Applying" : "Apply concession"}
            </Button>
          </div>
        }
      >
        {eligible.length === 0 ? (
          <p className="text-muted">Every installment is fully paid or conceded, so there is nothing left to concede.</p>
        ) : (
          <form id="concession" onSubmit={submit} noValidate className="space-y-5">
            <div>
              <Label htmlFor="installment">Installment</Label>
              <Select id="installment" value={installmentId} onChange={(e) => setInstallmentId(e.target.value)} aria-invalid={Boolean(show("installmentId"))}>
                {eligible.map((i) => (
                  <option key={i.installmentId} value={i.installmentId}>
                    {i.label} · due {formatDate(i.dueDate)} · {formatINR(i.remainingPaise, { paise: "auto" })} owed
                  </option>
                ))}
              </Select>
              {inst ? (
                <p className="mt-1.5 text-sm text-muted">
                  Demand {formatINR(inst.demandPaise, { paise: "auto" })}
                  {inst.paidPaise ? `, paid ${formatINR(inst.paidPaise, { paise: "auto" })}` : ""}
                  {inst.concessionPaise ? `, conceded ${formatINR(inst.concessionPaise, { paise: "auto" })}` : ""}. Up to {formatINR(inst.remainingPaise, { paise: "auto" })} can be conceded.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="c-amount">Concession amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
                <Input id="c-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="figure pl-7" aria-invalid={Boolean(show("amountPaise"))} aria-describedby="c-amount-error" />
              </div>
              {inst ? (
                <div className="mt-1.5 flex gap-2">
                  {[25, 50, 100].map((pct) => {
                    const v = Math.min(inst.remainingPaise, Math.floor((inst.demandPaise * pct) / 100));
                    return (
                      <button key={pct} type="button" className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-line-strong hover:text-ink" onClick={() => setAmount(v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2))}>
                        {pct === 100 ? "All owed" : `${pct}% of demand`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <FieldError id="c-amount-error">{show("amountPaise")}</FieldError>
            </div>
            <div>
              <Label htmlFor="c-reason">Reason</Label>
              <Textarea id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Merit scholarship: 25% of tuition for 9.2 CGPA" aria-invalid={Boolean(show("reason"))} />
              <FieldError>{show("reason")}</FieldError>
            </div>
            <div>
              <Label htmlFor="c-approver">Approved by</Label>
              <Input id="c-approver" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} maxLength={120} placeholder="e.g. Dr. Meena Krishnan, Dean (Academics)" aria-invalid={Boolean(show("approvedBy"))} />
              <FieldError>{show("approvedBy")}</FieldError>
            </div>
            {serverError && !serverError.field ? (
              <div role="alert" className="flex gap-2.5 rounded tint-debit px-3.5 py-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="text-ink">{serverError.message}</p>
              </div>
            ) : null}
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
