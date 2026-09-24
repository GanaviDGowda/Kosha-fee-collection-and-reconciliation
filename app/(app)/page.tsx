import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CollectionsTrend } from "@/components/dashboard/collections-trend";
import { OverdueByCourse } from "@/components/dashboard/overdue-by-course";
import { Money } from "@/components/money";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { guardPage } from "@/lib/auth/page-guard";
import { cn } from "@/lib/cn";
import { getDashboard } from "@/lib/data/dashboard";
import { formatDate, formatDateTime } from "@/lib/dates";
import { BUCKET_SHORT } from "@/lib/domain/reconcile";
import { MODE_LABEL } from "@/lib/domain/payment-state";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await guardPage("dashboard.view");
  const d = await getDashboard();
  const s = d.summary;
  const attentionCount = d.attention.pendingPayments.length + d.attention.reconItems.length + d.attention.longOverdue.length;

  const cells = [
    { label: "Collected this term", value: <Money paise={s.collectedThisTermPaise} auto />, note: `${s.collectedThisTermCount} payments since ${formatDate(d.term.from)}`, href: "/payments?status=SUCCESS" },
    { label: "Outstanding", value: <Money paise={s.outstandingPaise} auto />, note: s.advancePaise ? `Billed, not yet paid · ${formatINR(s.advancePaise, { paise: "auto" })} held as advance` : "Billed, not yet paid, all terms", href: "/students?status=DUE" },
    { label: "Overdue", value: <Money paise={s.overduePaise} auto className="text-debit" />, note: `${s.overdueStudents} students past a due date`, href: "/students?status=OVERDUE" },
    {
      label: "Pending payments",
      value: <span className={cn("figure", s.pendingCount > 0 && "text-pending")}>{s.pendingCount}</span>,
      note: s.pendingCount ? `${formatINR(s.pendingPaise, { paise: "auto" })} waiting for the gateway${s.openReconItems ? ` · ${s.openReconItems} reconciliation items to review` : ""}` : "Nothing waiting for the gateway",
      href: "#attention",
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Fee collection for ${d.term.label}, as of ${formatDateTime(d.asOf)}.`} />

      {/* One quiet bordered strip with dividers (gap-px over the line colour), not four cards. */}
      <section aria-label="Summary" className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => (
          <Link key={c.label} href={c.href} className="block bg-surface px-5 py-4 transition-colors hover:bg-canvas">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-1 text-xl font-semibold">{c.value}</p>
            <p className="mt-1 text-sm text-muted">{c.note}</p>
          </Link>
        ))}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel>
          <PanelHeader title="Collections, last 30 days" description={`${formatDate(d.trend[0]!.date)} to ${formatDate(d.trend[d.trend.length - 1]!.date)}. Successful payments by day.`} />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <CollectionsTrend data={d.trend} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Overdue by course" description="Past-due amounts still unpaid. Open a row for the students." />
          <OverdueByCourse rows={d.overdueByCourse} />
        </Panel>
      </div>

      <Panel className="mt-5" id="attention">
        <PanelHeader
          title="Needs attention"
          description={
            attentionCount === 0
              ? "Nothing waiting."
              : `${d.attention.pendingPayments.length} stuck payments, ${d.attention.reconItems.length} open reconciliation items, ${d.attention.longOverdue.length} accounts overdue more than 30 days.`
          }
        />
        {attentionCount === 0 ? (
          <EmptyState title="All clear">No stuck payments, open reconciliation items or long-overdue accounts.</EmptyState>
        ) : (
          <div className="divide-y divide-line">
            <AttentionGroup title="Payments stuck at the gateway" count={d.attention.pendingPayments.length} empty="No pending payments.">
              {d.attention.pendingPayments.map((p) => (
                <AttentionRow
                  key={p.paymentId}
                  href={`/payments/${p.paymentId}`}
                  badge={<StatusBadge tone="pending">Pending</StatusBadge>}
                  title={`${p.studentName} · ${MODE_LABEL[p.mode]} ${formatINR(p.amountPaise, { paise: "auto" })}`}
                  detail={`${p.gatewayRef ?? ""} · started ${formatDateTime(p.createdAt)}. Check status or reconcile.`}
                />
              ))}
            </AttentionGroup>
            <AttentionGroup title="Open reconciliation items" count={d.attention.reconItems.length} empty="No open items. Upload a settlement file to reconcile.">
              {d.attention.reconItems.map((r) => (
                <AttentionRow
                  key={r.itemId}
                  href={`/reconciliation/${r.runId}`}
                  badge={<StatusBadge tone={r.bucket === "SETTLED_PENDING_HERE" ? "pending" : "debit"}>{BUCKET_SHORT[r.bucket]}</StatusBadge>}
                  title={r.gatewayRef}
                  mono
                  detail={
                    r.bucket === "AMOUNT_MISMATCH"
                      ? `File ${formatINR(r.filePaise ?? 0, { paise: "auto" })}, recorded ${formatINR(r.systemPaise ?? 0, { paise: "auto" })}`
                      : r.bucket === "MISSING_IN_SETTLEMENT"
                        ? `${formatINR(r.systemPaise ?? 0, { paise: "auto" })} recorded here, not in the settlement`
                        : `${formatINR(r.filePaise ?? 0, { paise: "auto" })} settled by the gateway`
                  }
                />
              ))}
            </AttentionGroup>
            <AttentionGroup title="Overdue more than 30 days" count={d.attention.longOverdue.length} empty="Nobody is more than 30 days overdue.">
              {d.attention.longOverdue.slice(0, 8).map((o) => (
                <AttentionRow
                  key={o.studentId}
                  href={`/students/${o.rollNo}`}
                  badge={<StatusBadge tone="debit">{o.daysOverdue} days</StatusBadge>}
                  title={`${o.studentName} · ${formatINR(o.overduePaise, { paise: "auto" })}`}
                  detail={`${o.rollNo} · due since ${formatDate(o.oldestOverdueDate)}`}
                />
              ))}
              {d.attention.longOverdue.length > 8 ? (
                <li>
                  <Link href="/students?status=OVERDUE" className="block px-5 py-2.5 text-sm text-accent hover:underline">
                    See all {d.attention.longOverdue.length} overdue students
                  </Link>
                </li>
              ) : null}
            </AttentionGroup>
          </div>
        )}
      </Panel>
    </>
  );
}

function AttentionGroup({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 bg-canvas/60 px-5 py-2 text-sm font-medium">
        {title}
        <span className="figure rounded-full bg-surface px-1.5 text-xs text-muted ring-1 ring-line">{count}</span>
      </h3>
      {count === 0 ? <p className="px-5 py-3 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

function AttentionRow({ href, badge, title, detail, mono }: { href: string; badge: React.ReactNode; title: string; detail: string; mono?: boolean }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-2.5 hover:bg-canvas/60">
        <span className="w-[168px] shrink-0 max-sm:w-auto">{badge}</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-medium sm:truncate", mono && "font-mono text-sm")}>{title}</span>
          <span className="block text-sm text-muted sm:truncate">{detail}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted group-hover:text-ink" aria-hidden />
      </Link>
    </li>
  );
}
