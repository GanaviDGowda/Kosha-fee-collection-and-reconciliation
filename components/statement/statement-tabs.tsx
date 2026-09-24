"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Balance, Money } from "@/components/money";
import { EmptyState } from "@/components/ui/panel";
import { INSTALLMENT_TONE, MappedBadge, PAYMENT_TONE } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import type { StudentDetail } from "@/lib/data/students";
import { formatDate, formatDateTime } from "@/lib/dates";
import { MODE_LABEL } from "@/lib/domain/payment-state";

type Props = {
  detail: StudentDetail;
  /** Payment to flash (the signature moment after recording a payment). */
  highlightPaymentId?: string | null;
  paymentActions?: (payment: StudentDetail["payments"][number]) => React.ReactNode;
  emptyPaymentsAction?: React.ReactNode;
};

const TABS = ["statement", "installments", "payments"] as const;
type Tab = (typeof TABS)[number];

export function StatementTabs({ detail, highlightPaymentId, paymentActions, emptyPaymentsAction }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const current = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "statement";

  function onChange(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value === "statement") sp.delete("tab");
    else sp.set("tab", value);
    sp.delete("highlight");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={onChange}>
      <div className="rounded-panel border border-line bg-surface">
        <TabsList className="px-5" aria-label="Student account">
          <TabsTrigger value="statement" count={detail.statement.length}>
            Statement
          </TabsTrigger>
          <TabsTrigger value="installments" count={detail.installments.length}>
            Installments
          </TabsTrigger>
          <TabsTrigger value="payments" count={detail.payments.length}>
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statement">
          <Passbook detail={detail} highlightPaymentId={highlightPaymentId ?? null} />
        </TabsContent>
        <TabsContent value="installments">
          <InstallmentsTable detail={detail} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTable detail={detail} actions={paymentActions} emptyAction={emptyPaymentsAction} highlightPaymentId={highlightPaymentId ?? null} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function useScrollToHighlight(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-highlight="true"]:not([hidden])`);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [id]);
}

function Passbook({ detail, highlightPaymentId }: { detail: StudentDetail; highlightPaymentId: string | null }) {
  const rows = detail.statement;
  useScrollToHighlight(highlightPaymentId);
  const isNew = (r: StudentDetail["statement"][number]) => highlightPaymentId !== null && r.type === "PAYMENT" && r.paymentId === highlightPaymentId;
  if (rows.length === 0) return <EmptyState title="No entries yet">Fee demand has not been raised for this student.</EmptyState>;
  const closing = rows[rows.length - 1]!.balancePaise;
  return (
    <>
      {/* Phones: one stacked entry per row, amount and running balance always visible. */}
      <ol className="divide-y divide-line sm:hidden" aria-label="Passbook statement">
        {rows.map((r) => {
          const linked = r.linkedEntryId ? rows.find((x) => x.entryId === r.linkedEntryId) : undefined;
          return (
            <li key={r.entryId} id={`m-entry-${r.entryId}`} className={cn("px-4 py-3", r.muted && "text-muted", isNew(r) && "row-flash")} data-highlight={isNew(r) || undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">{formatDate(r.date)}</span>
                <span className={cn("figure font-medium", r.creditPaise && !r.muted && "text-credit", r.muted && "line-through decoration-muted/60")}>
                  {r.creditPaise ? "− " : "+ "}
                  <Money paise={r.creditPaise ?? r.debitPaise ?? 0} />
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span className={cn("min-w-0", r.muted && "line-through decoration-muted/60")}>{r.description}</span>
                <span className="shrink-0 text-sm text-muted">
                  Bal. <Balance paise={r.balancePaise} />
                </span>
              </div>
              {r.detail ? <p className="mt-0.5 text-sm text-muted">{r.detail}</p> : null}
              {r.reference ? <p className="mt-0.5 font-mono text-xs text-muted">{r.reference}</p> : null}
              {r.type === "PAYMENT" && r.muted && linked ? <p className="mt-0.5 text-sm text-reversed">Reversed on {formatDate(linked.date)}</p> : null}
            </li>
          );
        })}
        <li className="flex justify-between px-4 py-3 font-semibold">
          <span className="text-sm font-normal text-muted">Closing balance</span>
          <Balance paise={closing} />
        </li>
      </ol>
    <div className="hidden overflow-x-auto sm:block">
      <table className="ledger-table min-w-[820px]">
        <caption className="sr-only">Passbook statement with running balance</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[118px]">
              Date
            </th>
            <th scope="col">Description</th>
            <th scope="col" className="w-[190px]">
              Reference
            </th>
            <th scope="col" className="num w-[130px]">
              Debit
            </th>
            <th scope="col" className="num w-[130px]">
              Credit
            </th>
            <th scope="col" className="num w-[150px]">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const linked = r.linkedEntryId ? rows.find((x) => x.entryId === r.linkedEntryId) : undefined;
            return (
              <tr
                key={r.entryId}
                id={`entry-${r.entryId}`}
                className={cn("scroll-mt-24 target:[&>td]:bg-accent/5", r.muted && "text-muted", isNew(r) && "row-flash")}
                data-highlight={isNew(r) || undefined}
              >
                <td className="whitespace-nowrap figure" title={formatDateTime(r.date)}>
                  {formatDate(r.date)}
                </td>
                <td>
                  <span className={cn(r.muted && "line-through decoration-muted/60")}>{r.description}</span>
                  {r.type === "PAYMENT" && r.muted && linked ? (
                    <a href={`#entry-${linked.entryId}`} className="ml-2 whitespace-nowrap text-sm text-reversed hover:underline">
                      Reversed on {formatDate(linked.date)}
                    </a>
                  ) : null}
                  {r.type === "REVERSAL" && linked ? (
                    <a href={`#entry-${linked.entryId}`} className="ml-2 whitespace-nowrap text-sm text-muted hover:text-ink hover:underline">
                      Original payment of {formatDate(linked.date)}
                    </a>
                  ) : null}
                  {r.detail ? <span className="block text-sm text-muted">{r.detail}</span> : null}
                </td>
                <td className="whitespace-nowrap font-mono text-sm text-muted">
                  {r.reference && r.paymentId ? (
                    <Link href={`/payments/${r.paymentId}`} className="hover:text-accent hover:underline">
                      {r.reference}
                    </Link>
                  ) : (
                    (r.reference ?? "")
                  )}
                </td>
                <td className="num">{r.debitPaise ? <Money paise={r.debitPaise} /> : null}</td>
                <td className={cn("num", !r.muted && "text-credit")}>{r.creditPaise ? <Money paise={r.creditPaise} /> : null}</td>
                <td className="num font-medium">
                  <Balance paise={r.balancePaise} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="border-t border-line-strong px-4 py-3 text-right text-sm text-muted">
              Closing balance
            </td>
            <td className="num border-t border-line-strong px-4 py-3 font-semibold">
              <Balance paise={closing} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

function InstallmentsTable({ detail }: { detail: StudentDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger-table min-w-[820px]">
        <caption className="sr-only">Installments, oldest due date first</caption>
        <thead>
          <tr>
            <th scope="col">Installment</th>
            <th scope="col">Due date</th>
            <th scope="col" className="num">
              Demand
            </th>
            <th scope="col" className="num">
              Concession
            </th>
            <th scope="col" className="num">
              Paid
            </th>
            <th scope="col" className="num">
              Remaining
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {detail.installments.map((i) => (
            <tr key={i.installmentId}>
              <td className="font-medium">{i.label}</td>
              <td className="figure whitespace-nowrap">{formatDate(i.dueDate)}</td>
              <td className="num">
                <Money paise={i.demandPaise} />
              </td>
              <td className="num text-muted">{i.concessionPaise ? <Money paise={i.concessionPaise} /> : "–"}</td>
              <td className="num">{i.paidPaise ? <Money paise={i.paidPaise} /> : <span className="text-muted">–</span>}</td>
              <td className="num font-medium">
                <Money paise={i.remainingPaise} className={i.remainingPaise === 0 ? "text-muted" : undefined} />
              </td>
              <td>
                <MappedBadge map={INSTALLMENT_TONE} value={i.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTable({
  detail,
  actions,
  emptyAction,
  highlightPaymentId,
}: {
  detail: StudentDetail;
  actions?: Props["paymentActions"];
  emptyAction?: React.ReactNode;
  highlightPaymentId: string | null;
}) {
  useScrollToHighlight(highlightPaymentId);
  if (detail.payments.length === 0) {
    return (
      <EmptyState title="No payments yet" action={emptyAction}>
        Record the first payment for this student.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="ledger-table min-w-[820px]">
        <caption className="sr-only">Payments, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Receipt / reference</th>
            <th scope="col">Mode</th>
            <th scope="col">Paid towards</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col">Status</th>
            {actions ? (
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {detail.payments.map((p) => (
            <tr key={p.id} className={cn(p.status === "FAILED" && "text-muted", p.id === highlightPaymentId && "row-flash")} data-highlight={p.id === highlightPaymentId || undefined}>
              <td className="figure whitespace-nowrap" title={formatDateTime(p.paidAt ?? p.createdAt)}>
                {formatDate(p.paidAt ?? p.createdAt)}
              </td>
              <td className="whitespace-nowrap">
                <Link href={`/payments/${p.id}`} className="block font-mono text-sm hover:text-accent hover:underline">
                  {p.receiptNo ?? (p.status === "PENDING" ? "Awaiting gateway" : "No receipt")}
                </Link>
                {p.gatewayRef ? <span className="block font-mono text-xs text-muted">{p.gatewayRef}</span> : null}
                {!p.gatewayRef && p.reference ? <span className="block text-xs text-muted">{p.reference}</span> : null}
              </td>
              <td className="whitespace-nowrap">{MODE_LABEL[p.mode]}</td>
              <td className="text-sm text-muted">
                {p.status === "FAILED"
                  ? p.failureReason
                  : p.status === "PENDING"
                    ? "Not allocated until the gateway confirms"
                    : p.status === "REVERSED"
                      ? `Reversed: ${p.reversalReason ?? ""}`
                      : p.allocations.map((a) => a.label).join(", ") || "Held as advance"}
              </td>
              <td className="num font-medium">
                <Money paise={p.amountPaise} className={p.status === "REVERSED" || p.status === "FAILED" ? "line-through decoration-muted/60" : undefined} />
              </td>
              <td>
                <MappedBadge map={PAYMENT_TONE} value={p.status} />
              </td>
              {actions ? <td className="w-10 text-right">{actions(p)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
