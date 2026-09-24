import type { Metadata } from "next";
import Link from "next/link";
import { UploadSettlement } from "@/components/reconciliation/upload-settlement";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { guardPage } from "@/lib/auth/page-guard";
import { listReconRuns } from "@/lib/data/reconciliation";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Reconciliation" };
export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  await guardPage("reconciliation.run");
  const runs = await listReconRuns(30);

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Upload the gateway's settlement file to check every online payment against what the bank actually settled."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel>
          <PanelHeader title="New run" />
          <div className="px-5 py-5">
            <UploadSettlement />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="How rows are matched" />
          <dl className="space-y-3 px-5 py-4 text-sm">
            {[
              ["Matched", "credit", "Reference and amount agree with a successful payment."],
              ["Amount mismatch", "debit", "Reference found, amounts differ. Flagged for review, never corrected automatically."],
              ["Settled but pending here", "pending", "The bank settled it; we still show it pending. You can mark it as paid."],
              ["Recorded here, missing in settlement", "debit", "Our successful online payment is not in the file for its settlement dates."],
            ].map(([label, tone, text]) => (
              <div key={label}>
                <dt>
                  <StatusBadge tone={tone as "credit"}>{label}</StatusBadge>
                </dt>
                <dd className="mt-1 text-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHeader title="Previous runs" />
        {runs.length === 0 ? (
          <EmptyState title="No runs yet">Upload a settlement file above. The sample file produces all four buckets.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">File</th>
                  <th scope="col">By</th>
                  <th scope="col" className="num">
                    Rows
                  </th>
                  <th scope="col" className="num">
                    Matched
                  </th>
                  <th scope="col" className="num">
                    Exceptions
                  </th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const b = r.totals.buckets;
                  const exceptions = (b?.AMOUNT_MISMATCH?.count ?? 0) + (b?.SETTLED_PENDING_HERE?.count ?? 0) + (b?.MISSING_IN_SETTLEMENT?.count ?? 0);
                  return (
                    <tr key={r.id}>
                      <td className="figure whitespace-nowrap">
                        <Link href={`/reconciliation/${r.id}`} className="text-accent hover:underline">
                          {formatDateTime(r.createdAt)}
                        </Link>
                      </td>
                      <td className="max-w-[240px] truncate">{r.fileName}</td>
                      <td>{isRole(r.uploadedBy) ? ROLE_LABEL[r.uploadedBy] : r.uploadedBy}</td>
                      <td className="num">{r.rowCount}</td>
                      <td className="num">{b?.MATCHED?.count ?? 0}</td>
                      <td className="num">
                        {exceptions}
                        {r.rejectedCount ? <span className="block text-xs text-muted">{r.rejectedCount} rows set aside</span> : null}
                      </td>
                      <td>{r.openCount > 0 ? <StatusBadge tone="pending">{r.openCount} to review</StatusBadge> : <StatusBadge tone="credit">All resolved</StatusBadge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
