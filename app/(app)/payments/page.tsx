import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { MappedBadge, PAYMENT_TONE } from "@/components/ui/status-badge";
import { UrlFilters } from "@/components/ui/url-filters";
import { paymentsQuerySchema } from "@/lib/api/schemas";
import { guardPage } from "@/lib/auth/page-guard";
import { listPayments } from "@/lib/data/payments";
import { formatDate, formatDateTime } from "@/lib/dates";
import { MODE_LABEL, PAYMENT_MODES, PAYMENT_STATUSES, STATUS_LABEL } from "@/lib/domain/payment-state";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await guardPage("students.view_all");
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const parsed = paymentsQuerySchema.safeParse({ q: first(raw.q), status: first(raw.status), mode: first(raw.mode) });
  const filters = parsed.success ? parsed.data : { limit: 200 };
  const payments = await listPayments(filters);
  const filtered = Boolean(filters.q || filters.status || filters.mode);
  const successTotal = payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amountPaise, 0);

  return (
    <>
      <PageHeader title="Payments" description="Every payment across students, newest first, with its gateway state." />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <UrlFilters
            searchLabel="Search payments"
            searchPlaceholder="Receipt, gateway ref, name or roll"
            selects={[
              { name: "status", label: "Status", allLabel: "Any status", options: PAYMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
              { name: "mode", label: "Mode", allLabel: "Any mode", options: PAYMENT_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })) },
            ]}
          />
          <p className="text-sm text-muted">
            <span className="figure">{payments.length}</span> payments{payments.length ? <> · <Money paise={successTotal} auto /> successful</> : null}
          </p>
        </div>
        {payments.length === 0 ? (
          <EmptyState title={filtered ? "No payments match these filters" : "No payments yet"} action={filtered ? <Link href="/payments" className="text-accent hover:underline">Clear the filters</Link> : undefined}>
            {filtered ? "Try another receipt number, reference, mode or status." : "Payments appear here as soon as they are recorded on a student's statement."}
          </EmptyState>
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <table className="ledger-table min-w-[900px]">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Receipt / reference</th>
                  <th scope="col">Student</th>
                  <th scope="col">Mode</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={p.status === "FAILED" ? "text-muted" : undefined}>
                    <td className="figure whitespace-nowrap" title={formatDateTime(p.paidAt ?? p.createdAt)}>
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/payments/${p.id}`} className="block font-mono text-sm hover:text-accent hover:underline">
                        {p.receiptNo ?? (p.status === "PENDING" ? "Awaiting gateway" : "No receipt")}
                      </Link>
                      {p.gatewayRef ? <span className="block font-mono text-xs text-muted">{p.gatewayRef}</span> : null}
                    </td>
                    <td>
                      <Link href={`/students/${p.rollNo}?tab=payments`} className="font-medium hover:text-accent hover:underline">
                        {p.studentName}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{p.rollNo}</span>
                    </td>
                    <td className="whitespace-nowrap">{MODE_LABEL[p.mode]}</td>
                    <td className="num font-medium">
                      <Money paise={p.amountPaise} className={p.status === "FAILED" || p.status === "REVERSED" ? "line-through decoration-muted/60" : undefined} />
                    </td>
                    <td>
                      <MappedBadge map={PAYMENT_TONE} value={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
