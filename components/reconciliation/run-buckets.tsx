"use client";

// The four buckets as tabs. Exception rows carry their resolve action; resolutions go through
// resolve_recon_item() in the database (MARKED_PAID confirms the payment in the same transaction).

import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MappedBadge, PAYMENT_TONE } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { ReconRunItem } from "@/lib/data/reconciliation";
import { formatDate, formatDateTime } from "@/lib/dates";
import { BUCKETS, BUCKET_LABEL, type Bucket, type BucketTotals } from "@/lib/domain/reconcile";
import { formatINR } from "@/lib/money";

const BUCKET_HELP: Record<Bucket, string> = {
  MATCHED: "Reference, amount and status agree. Nothing to do.",
  AMOUNT_MISMATCH: "The gateway settled a different amount than we recorded. Check with the gateway, then mark as reviewed with what you found. Nothing is changed automatically.",
  SETTLED_PENDING_HERE: "The gateway settled these, but they are still pending here. Mark as paid to confirm the payment, issue the receipt and allocate it.",
  MISSING_IN_SETTLEMENT: "We recorded these as paid, but they are not in the file for their settlement dates. Ask the gateway before doing anything.",
};

type Resolve = { item: ReconRunItem; resolution: "MARKED_PAID" | "REVIEWED" } | null;

export function RunBuckets({ items, buckets }: { items: ReconRunItem[]; buckets: Record<Bucket, BucketTotals> }) {
  const firstOpen = BUCKETS.find((b) => b !== "MATCHED" && items.some((i) => i.bucket === b && !i.resolution));
  const [tab, setTab] = useState<Bucket>(firstOpen ?? "MATCHED");
  const [resolve, setResolve] = useState<Resolve>(null);

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Bucket)}>
        <TabsList className="px-5" aria-label="Buckets">
          {BUCKETS.map((b) => {
            const open = items.filter((i) => i.bucket === b && b !== "MATCHED" && !i.resolution).length;
            return (
              <TabsTrigger key={b} value={b} count={buckets[b]?.count ?? 0}>
                {BUCKET_LABEL[b]}
                {open > 0 ? <span className="size-1.5 rounded-full bg-pending" aria-label={`${open} open`} /> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {BUCKETS.map((b) => {
          const rows = items.filter((i) => i.bucket === b);
          const t = buckets[b] ?? { count: 0, filePaise: 0, systemPaise: 0 };
          return (
            <TabsContent key={b} value={b}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3 text-sm">
                <p className="max-w-2xl text-muted">{BUCKET_HELP[b]}</p>
                <p className="figure whitespace-nowrap">
                  {b === "MISSING_IN_SETTLEMENT" ? (
                    <>
                      Recorded <Money paise={t.systemPaise} auto />
                    </>
                  ) : (
                    <>
                      File <Money paise={t.filePaise} auto />
                      {b === "AMOUNT_MISMATCH" ? (
                        <>
                          {" · "}Recorded <Money paise={t.systemPaise} auto />
                        </>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
              {rows.length === 0 ? (
                <EmptyState title={`No ${BUCKET_LABEL[b].toLowerCase()} items`}>{b === "MATCHED" ? "No row in this file matched a payment." : "Nothing to review in this bucket."}</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ledger-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th scope="col">Gateway ref</th>
                        <th scope="col">Student</th>
                        <th scope="col">Settled</th>
                        <th scope="col" className="num">
                          In file
                        </th>
                        <th scope="col" className="num">
                          Recorded here
                        </th>
                        {b === "AMOUNT_MISMATCH" ? (
                          <th scope="col" className="num">
                            Difference
                          </th>
                        ) : null}
                        <th scope="col">Payment now</th>
                        {b !== "MATCHED" ? <th scope="col">Resolution</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((i) => (
                        <tr key={i.id}>
                          <td className="whitespace-nowrap font-mono text-sm">
                            {i.paymentId ? (
                              <Link href={`/payments/${i.paymentId}`} className="hover:text-accent hover:underline">
                                {i.gatewayRef}
                              </Link>
                            ) : (
                              i.gatewayRef
                            )}
                          </td>
                          <td>
                            {i.student ? (
                              <Link href={`/students/${i.student.rollNo}`} className="hover:text-accent hover:underline">
                                {i.student.name}
                              </Link>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>
                          <td className="figure whitespace-nowrap text-muted">{i.settledAt ? formatDate(i.settledAt) : "Not in file"}</td>
                          <td className="num">{i.fileAmountPaise !== null ? <Money paise={i.fileAmountPaise} /> : <span className="text-muted">–</span>}</td>
                          <td className="num">{i.systemAmountPaise !== null ? <Money paise={i.systemAmountPaise} /> : <span className="text-muted">–</span>}</td>
                          {b === "AMOUNT_MISMATCH" ? (
                            <td className="num font-medium text-debit">
                              {(i.fileAmountPaise ?? 0) - (i.systemAmountPaise ?? 0) > 0 ? "+" : "−"}
                              <Money paise={Math.abs((i.fileAmountPaise ?? 0) - (i.systemAmountPaise ?? 0))} />
                            </td>
                          ) : null}
                          <td>{i.currentPaymentStatus ? <MappedBadge map={PAYMENT_TONE} value={i.currentPaymentStatus} /> : null}</td>
                          {b !== "MATCHED" ? (
                            <td className="min-w-[220px]">
                              {i.resolution ? (
                                <span className="flex items-start gap-1.5 text-sm">
                                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-credit" aria-hidden />
                                  <span>
                                    {i.resolution === "MARKED_PAID" ? "Marked as paid" : "Reviewed"} by {isRole(i.resolvedBy) ? ROLE_LABEL[i.resolvedBy] : i.resolvedBy}
                                    <span className="block text-muted">{i.resolvedAt ? formatDateTime(i.resolvedAt) : ""}</span>
                                    {i.resolutionNote ? <span className="block text-muted">{i.resolutionNote}</span> : null}
                                  </span>
                                </span>
                              ) : (
                                <span className="flex flex-wrap gap-2">
                                  {b === "SETTLED_PENDING_HERE" ? (
                                    <Button size="sm" onClick={() => setResolve({ item: i, resolution: "MARKED_PAID" })}>
                                      Mark as paid
                                    </Button>
                                  ) : null}
                                  <Button size="sm" variant="secondary" onClick={() => setResolve({ item: i, resolution: "REVIEWED" })}>
                                    Mark reviewed
                                  </Button>
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
      <ResolveDrawer target={resolve} onClose={() => setResolve(null)} />
    </>
  );
}

function ResolveDrawer({ target, onClose }: { target: Resolve; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markPaid = target?.resolution === "MARKED_PAID";
  const noteError = !markPaid && note.trim().length < 3 ? "Add a note saying what was checked, e.g. the gateway ticket number." : null;

  function close() {
    if (submitting) return;
    setNote("");
    setTouched(false);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!target || noteError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/reconciliation/items/${target.item.id}/resolve`, { body: { resolution: target.resolution, note: note.trim() || null } });
      toast.success(markPaid ? "Marked as paid" : "Marked as reviewed", markPaid ? `${target.item.gatewayRef} confirmed; receipt issued.` : target.item.gatewayRef);
      setSubmitting(false);
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Nothing was changed.");
      setSubmitting(false);
    }
  }

  const i = target?.item;
  return (
    <Sheet open={target !== null} onOpenChange={(o) => !o && close()}>
      {i ? (
        <SheetContent
          title={markPaid ? "Mark as paid" : "Mark as reviewed"}
          description={<span className="font-mono">{i.gatewayRef}</span>}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" form="resolve" loading={submitting}>
                {submitting ? "Saving" : markPaid ? "Mark as paid" : "Mark as reviewed"}
              </Button>
            </div>
          }
        >
          <form id="resolve" onSubmit={submit} noValidate className="space-y-5">
            <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">Bucket</dt>
              <dd>{BUCKET_LABEL[i.bucket]}</dd>
              {i.student ? (
                <>
                  <dt className="text-muted">Student</dt>
                  <dd>
                    {i.student.name} <span className="font-mono text-xs">{i.student.rollNo}</span>
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">In file</dt>
              <dd className="figure">{i.fileAmountPaise !== null ? formatINR(i.fileAmountPaise) : "Not in file"}</dd>
              <dt className="text-muted">Recorded here</dt>
              <dd className="figure">{i.systemAmountPaise !== null ? formatINR(i.systemAmountPaise) : "–"}</dd>
            </dl>
            <div className={cn("rounded border px-3.5 py-3 text-sm", markPaid ? "border-line" : "border-line")}>
              <p className="font-medium">What happens</p>
              <p className="mt-1 text-muted">
                {markPaid
                  ? `The pending payment of ${formatINR(i.systemAmountPaise ?? 0, { paise: "auto" })} becomes successful: a receipt is issued, a ledger entry is written and it is allocated to open installments, all in one transaction.`
                  : "Records that someone checked this item, with your note. No money moves and the payment is not changed."}
              </p>
            </div>
            <div>
              <Label htmlFor="r-note">
                Note {markPaid ? <span className="font-normal text-muted">(optional)</span> : null}
              </Label>
              <Textarea
                id="r-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={markPaid ? "e.g. Settled in batch 22 Sep" : "e.g. Gateway ticket 4471: partial capture, refund of ₹500 raised"}
                aria-invalid={Boolean(touched && noteError)}
              />
              <FieldError>{touched ? noteError : null}</FieldError>
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
