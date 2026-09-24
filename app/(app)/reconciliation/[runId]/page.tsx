import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy } from "lucide-react";
import { Money } from "@/components/money";
import { RunBuckets } from "@/components/reconciliation/run-buckets";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ApiError } from "@/lib/api/errors";
import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { guardPage } from "@/lib/auth/page-guard";
import { earlierRunOfSameFile, getReconRun } from "@/lib/data/reconciliation";
import { formatDate, formatDateTime } from "@/lib/dates";
import { BUCKETS, BUCKET_LABEL } from "@/lib/domain/reconcile";

export const metadata: Metadata = { title: "Reconciliation run" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABEL = { invalid: "Invalid row", duplicate: "Duplicate", ignored: "Not a settlement", unknown_ref: "Unknown reference", status_conflict: "Settled but failed here" } as const;

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  await guardPage("reconciliation.run");
  const { runId } = await params;
  if (!UUID.test(runId)) notFound();
  let run;
  try {
    run = await getReconRun(runId.toLowerCase());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const earlier = await earlierRunOfSameFile(run);
  const t = run.totals;
  const window = t.window;

  return (
    <div className="space-y-5">
      <Link href="/reconciliation" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        Reconciliation
      </Link>

      <Panel>
        <div className="flex flex-col gap-1 px-5 py-5 sm:px-6">
          <h1 className="text-lg font-semibold sm:text-xl">{run.fileName}</h1>
          <p className="text-muted">
            Run by {isRole(run.uploadedBy) ? ROLE_LABEL[run.uploadedBy] : run.uploadedBy} on {formatDateTime(run.createdAt)}
            {window ? ` · covers payments made ${formatDate(window.from)} to ${formatDate(window.to)}` : ""}
          </p>
          {earlier ? (
            <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded tint-pending px-2.5 py-1 text-sm">
              <Copy className="size-3.5" aria-hidden />
              The same file was reconciled on {formatDateTime(earlier.createdAt)}.{" "}
              <Link href={`/reconciliation/${earlier.id}`} className="underline">
                Open that run
              </Link>
            </p>
          ) : null}
        </div>
        {/* Summary strip: dividers are the 1px gaps showing the line colour behind the cells. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-panel border-t border-line bg-line sm:grid-cols-5">
          <div className="bg-surface px-5 py-3.5">
            <dt className="text-xs text-muted">Rows in file</dt>
            <dd className="figure mt-0.5 text-md font-semibold">{t.rows}</dd>
            {t.rejected ? <dd className="text-xs text-muted">{t.rejected} set aside</dd> : null}
          </div>
          {BUCKETS.map((b, i) => (
            <div key={b} className={`bg-surface px-5 py-3.5 ${i === BUCKETS.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
              <dt className="text-xs text-muted">{BUCKET_LABEL[b]}</dt>
              <dd className="figure mt-0.5 text-md font-semibold">{t.buckets[b]?.count ?? 0}</dd>
              <dd className="text-xs text-muted">
                <Money paise={b === "MISSING_IN_SETTLEMENT" ? (t.buckets[b]?.systemPaise ?? 0) : (t.buckets[b]?.filePaise ?? 0)} auto />
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <RunBuckets items={run.items} buckets={t.buckets} />
      </Panel>

      {run.rejected.length > 0 ? (
        <Panel>
          <PanelHeader title="Rows set aside" description="Not matched to any bucket. Fix the file or follow up on each one." />
          <div className="overflow-x-auto">
            <table className="ledger-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col" className="num w-16">
                    Line
                  </th>
                  <th scope="col">Reference</th>
                  <th scope="col">Why</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {run.rejected.map((r, i) => (
                  <tr key={`${r.line}-${i}`}>
                    <td className="num">{r.line}</td>
                    <td className="font-mono text-sm">{r.gatewayRef ?? "–"}</td>
                    <td className="whitespace-nowrap">{KIND_LABEL[r.kind]}</td>
                    <td className="text-muted">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
