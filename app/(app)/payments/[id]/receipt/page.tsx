import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrintButton } from "@/components/payments/print-button";
import { EmptyState, Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api/errors";
import { can } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";
import { getPaymentDetail } from "@/lib/data/payments";
import { getDemoStudentId } from "@/lib/data/students";
import { formatDate, formatDateTime } from "@/lib/dates";
import { MODE_LABEL } from "@/lib/domain/payment-state";
import { COLLEGE } from "@/lib/demo/college";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";
import { amountInWords, formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (!p.receiptNo || !p.paidAt) {
    return (
      <Panel>
        <EmptyState title="No receipt for this payment" action={<Link href={`/payments/${p.id}`} className="text-accent hover:underline">Back to the payment</Link>}>
          A receipt is issued only when a payment succeeds. This one is {p.status.toLowerCase()}.
        </EmptyState>
      </Panel>
    );
  }

  const allocated = d.allocations.reduce((s, a) => s + a.amountPaise, 0);
  const lines = [...d.allocations.map((a) => ({ label: a.label, amountPaise: a.amountPaise })), ...(p.amountPaise > allocated ? [{ label: "Advance (held against future fees)", amountPaise: p.amountPaise - allocated }] : [])];
  const reversed = p.status === "REVERSED";

  return (
    <>
      {/* A5 portrait when printed; the app shell is hidden by .no-print. */}
      <style>{`@media print { @page { size: A5 portrait; margin: 9mm 10mm; } main { padding: 0 !important; max-width: none !important; } .receipt td, .receipt th { padding-top: 5px !important; padding-bottom: 5px !important; } }`}</style>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/payments/${p.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          Payment details
        </Link>
        <PrintButton />
      </div>

      <article className="receipt relative mx-auto max-w-[560px] rounded-panel border border-line bg-surface px-8 py-8 print:max-w-none print:rounded-none print:border-0 print:p-0" aria-label={`Receipt ${p.receiptNo}`}>
        <header className="border-b border-ink pb-4 text-center print:pb-3">
          <p className="text-lg font-semibold">{COLLEGE.fullName}</p>
          <p className="text-sm text-muted">{COLLEGE.address}</p>
          <p className="mt-3 text-md font-semibold print:mt-2">Fee receipt</p>
        </header>

        {reversed ? (
          <p className="mt-4 rounded border border-reversed px-3 py-2 text-center text-sm text-reversed">
            Reversed on {formatDate(p.reversedAt!)}: {p.reversalReason}. This receipt is no longer valid.
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm print:mt-3 print:gap-y-2">
          <div>
            <dt className="text-muted">Receipt no.</dt>
            <dd className="font-mono font-medium">{p.receiptNo}</dd>
          </div>
          <div className="text-right">
            <dt className="text-muted">Date</dt>
            <dd className="font-medium">{formatDate(p.paidAt)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">Received from</dt>
            <dd className="font-medium">
              {d.student.name} <span className="font-mono font-normal">({d.student.rollNo})</span>
            </dd>
            <dd className="text-muted">
              {d.student.courseName}, year {d.student.year}, academic year {COLLEGE.academicYear}
            </dd>
          </div>
        </dl>

        <table className="mt-5 w-full text-sm print:mt-3">
          <thead>
            <tr className="border-y border-line-strong text-left">
              <th scope="col" className="py-2 font-medium">
                Particulars
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2">{l.label}</td>
                <td className="figure py-2 text-right">{formatINR(l.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-ink">
              <td className="py-2.5 font-semibold">Total received</td>
              <td className="figure py-2.5 text-right text-md font-semibold">{formatINR(p.amountPaise)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-3 text-sm">
          <span className="text-muted">In words: </span>
          <span className="font-medium">{amountInWords(p.amountPaise)}</span>
        </p>

        <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm print:mt-3 print:gap-y-1">
          <dt className="text-muted">Mode</dt>
          <dd>{MODE_LABEL[p.mode]}</dd>
          {p.gatewayRef ? (
            <>
              <dt className="text-muted">Gateway ref.</dt>
              <dd className="font-mono">{p.gatewayRef}</dd>
            </>
          ) : null}
          {p.reference ? (
            <>
              <dt className="text-muted">Reference</dt>
              <dd>{p.reference}</dd>
            </>
          ) : null}
          <dt className="text-muted">Recorded</dt>
          <dd>{formatDateTime(p.paidAt)}</dd>
        </dl>

        <footer className="mt-8 border-t border-line pt-3 text-xs text-muted print:mt-4 print:pt-2">
          Computer-generated receipt; no signature required. Verify at the accounts office with the receipt number.
        </footer>
      </article>
    </>
  );
}
