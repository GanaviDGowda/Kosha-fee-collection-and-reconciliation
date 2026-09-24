import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Money } from "@/components/money";
import { PaymentDetailActions } from "@/components/payments/payment-detail-actions";
import { StateTrack } from "@/components/payments/state-track";
import { EmptyState, Panel, PanelHeader } from "@/components/ui/panel";
import { MappedBadge, PAYMENT_TONE } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/errors";
import { can } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";
import { getPaymentDetail } from "@/lib/data/payments";
import { getDemoStudentId } from "@/lib/data/students";
import { formatDate, formatDateTime } from "@/lib/dates";
import { describeAudit } from "@/lib/domain/audit-text";
import { MODE_LABEL } from "@/lib/domain/payment-state";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const role = await getRole();
  let d;
  try {
    d = await getPaymentDetail(id.toLowerCase());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if (!can(role, "students.view_all") && d.student.id !== (await getDemoStudentId())) redirect(`/students/${DEMO_STUDENT_ROLL_NO}`);

  const p = d.payment;
  const allocated = d.allocations.reduce((s, a) => s + a.amountPaise, 0);
  const counting = p.status === "SUCCESS";
  const facts: [string, React.ReactNode][] = [
    ["Student", <Link key="s" href={`/students/${d.student.rollNo}`} className="text-accent hover:underline">{d.student.name} <span className="font-mono text-sm">{d.student.rollNo}</span></Link>],
    ["Mode", MODE_LABEL[p.mode]],
    ["Receipt number", p.receiptNo ? <span className="font-mono">{p.receiptNo}</span> : <span className="text-muted">Issued when the payment succeeds</span>],
    ...(p.gatewayRef ? ([["Gateway reference", <span key="g" className="font-mono">{p.gatewayRef}</span>]] as [string, React.ReactNode][]) : []),
    ...(p.reference ? ([["Reference", p.reference]] as [string, React.ReactNode][]) : []),
    ["Recorded", formatDateTime(p.createdAt)],
    ...(p.paidAt ? ([["Paid", formatDateTime(p.paidAt)]] as [string, React.ReactNode][]) : []),
    ...(p.failureReason ? ([["Failure reason", p.failureReason]] as [string, React.ReactNode][]) : []),
    ...(p.reversalReason ? ([["Reversal reason", p.reversalReason]] as [string, React.ReactNode][]) : []),
    ["Idempotency key", <span key="k" className="break-all font-mono text-xs text-muted">{p.idempotencyKey}</span>],
  ];

  return (
    <div className="space-y-5">
      <Link href={`/students/${d.student.rollNo}?tab=payments`} className="no-print inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        {d.student.name}
      </Link>

      <Panel>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-muted">Payment</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-3">
              <h1 className={p.status === "REVERSED" || p.status === "FAILED" ? "text-xl font-semibold text-muted line-through decoration-2" : "text-xl font-semibold"}>
                <Money paise={p.amountPaise} />
              </h1>
              <MappedBadge map={PAYMENT_TONE} value={p.status} />
            </div>
            <p className="mt-1 text-muted">
              {MODE_LABEL[p.mode]} on {formatDate(p.paidAt ?? p.createdAt)}
            </p>
          </div>
          <PaymentDetailActions
            role={role}
            status={p.status}
            target={{
              id: p.id,
              amountPaise: p.amountPaise,
              mode: p.mode,
              receiptNo: p.receiptNo,
              gatewayRef: p.gatewayRef,
              date: p.paidAt ?? p.createdAt,
              allocations: d.allocations.map((a) => ({ label: a.label, amountPaise: a.amountPaise })),
            }}
          />
        </div>
        <dl className="grid gap-x-8 gap-y-3 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader title="State track" description="Every status change, with who made it" />
          <div className="px-5 py-5">
            <StateTrack events={d.events} status={p.status} mode={p.mode} />
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="Allocations"
              description={counting ? "Installments this payment paid, oldest due first" : p.status === "REVERSED" ? "No longer counted: the payment was reversed and these installments reopened" : "Allocated only when the payment succeeds"}
            />
            {d.allocations.length === 0 ? (
              <EmptyState title={p.status === "SUCCESS" ? "Held entirely as advance" : "Nothing allocated"} />
            ) : (
              <div className="overflow-x-auto">
                <table className="ledger-table min-w-[420px]">
                  <thead>
                    <tr>
                      <th scope="col">Installment</th>
                      <th scope="col">Due</th>
                      <th scope="col" className="num">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className={counting ? undefined : "text-muted"}>
                    {d.allocations.map((a, i) => (
                      <tr key={`${a.installmentId}-${i}`}>
                        <td>{a.label}</td>
                        <td className="figure whitespace-nowrap">{formatDate(a.dueDate)}</td>
                        <td className="num">
                          <Money paise={a.amountPaise} className={counting ? undefined : "line-through"} />
                        </td>
                      </tr>
                    ))}
                    {counting && p.amountPaise > allocated ? (
                      <tr className="text-accent">
                        <td colSpan={2}>Held as advance</td>
                        <td className="num">
                          <Money paise={p.amountPaise - allocated} />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Ledger entries" description="Written by this payment. The ledger is append-only." />
            {d.ledgerEntries.length === 0 ? (
              <EmptyState title="No ledger entries">Only a successful payment writes to the ledger.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="ledger-table min-w-[420px]">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Entry</th>
                      <th scope="col" className="num">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ledgerEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="figure whitespace-nowrap">{formatDate(e.createdAt)}</td>
                        <td>
                          <span className="font-medium">{e.type === "PAYMENT" ? "Payment (credit)" : "Reversal (debit)"}</span>
                          <span className="block text-sm text-muted">{e.note}</span>
                        </td>
                        <td className={e.amountPaise < 0 ? "num text-credit" : "num"}>
                          {e.amountPaise < 0 ? "−" : "+"}
                          <Money paise={Math.abs(e.amountPaise)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Audit trail" />
        <ol className="divide-y divide-line">
          {d.audit.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:gap-6">
              <span className="figure shrink-0 text-sm text-muted sm:w-48">{formatDateTime(a.createdAt)}</span>
              <span>{describeAudit({ actor: a.actor, action: a.action, entity: "payment", entityId: p.id, details: a.details }, d.student.name)}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
