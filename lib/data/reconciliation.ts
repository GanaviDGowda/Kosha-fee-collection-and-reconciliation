import type { Bucket, ReconTotals, RejectedRow, SystemPayment } from "@/lib/domain/reconcile";
import type { PaymentStatus } from "@/lib/domain/payment-state";
import { db, run, runSingle } from "@/lib/data/db";

/** Every payment that went through the gateway, in the shape reconcile() expects. */
export async function systemPaymentsForRecon(): Promise<SystemPayment[]> {
  const rows = await run<{ id: string; gateway_ref: string; amount_paise: number; status: PaymentStatus; paid_at: string | null }[]>(
    db().from("payments").select("id, gateway_ref, amount_paise, status, paid_at").not("gateway_ref", "is", null),
  );
  return rows.map((r) => ({ id: r.id, gatewayRef: r.gateway_ref, amountPaise: Number(r.amount_paise), status: r.status, paidAt: r.paid_at }));
}

export type ReconRunSummary = {
  id: string;
  fileName: string;
  uploadedBy: string;
  rowCount: number;
  totals: ReconTotals;
  rejectedCount: number;
  openCount: number;
  createdAt: string;
};

export type ReconRunItem = {
  id: string;
  bucket: Bucket;
  gatewayRef: string;
  fileAmountPaise: number | null;
  fileStatus: string | null;
  settledAt: string | null;
  systemAmountPaise: number | null;
  systemStatus: PaymentStatus | null;
  paymentId: string | null;
  currentPaymentStatus: PaymentStatus | null;
  student: { id: string; name: string; rollNo: string } | null;
  resolution: "MARKED_PAID" | "REVIEWED" | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export type ReconRunDetail = ReconRunSummary & { rejected: RejectedRow[]; items: ReconRunItem[] };

type RunRow = { id: string; file_name: string; uploaded_by: string; row_count: number; totals: ReconTotals; rejected_rows: RejectedRow[]; created_at: string };

export async function listReconRuns(limit = 20): Promise<ReconRunSummary[]> {
  const client = db();
  const [runs, open] = await Promise.all([
    run<RunRow[]>(client.from("reconciliation_runs").select("*").order("created_at", { ascending: false }).limit(limit)),
    run<{ run_id: string }[]>(client.from("reconciliation_items").select("run_id").is("resolution", null).neq("bucket", "MATCHED")),
  ]);
  const openByRun = new Map<string, number>();
  for (const o of open) openByRun.set(o.run_id, (openByRun.get(o.run_id) ?? 0) + 1);
  return runs.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    uploadedBy: r.uploaded_by,
    rowCount: r.row_count,
    totals: r.totals,
    rejectedCount: Array.isArray(r.rejected_rows) ? r.rejected_rows.length : 0,
    openCount: openByRun.get(r.id) ?? 0,
    createdAt: r.created_at,
  }));
}

export async function getReconRun(runId: string): Promise<ReconRunDetail> {
  const client = db();
  const [r, items] = await Promise.all([
    runSingle<RunRow>(client.from("reconciliation_runs").select("*").eq("id", runId).maybeSingle(), "Reconciliation run not found."),
    run<
      {
        id: string;
        bucket: Bucket;
        gateway_ref: string;
        file_amount_paise: number | null;
        file_status: string | null;
        settled_at: string | null;
        system_amount_paise: number | null;
        system_status: PaymentStatus | null;
        payment_id: string | null;
        resolution: "MARKED_PAID" | "REVIEWED" | null;
        resolution_note: string | null;
        resolved_by: string | null;
        resolved_at: string | null;
        payments: { status: PaymentStatus; students: { id: string; name: string; roll_no: string } | null } | null;
      }[]
    >(
      client
        .from("reconciliation_items")
        .select("*, payments(status, students(id, name, roll_no))")
        .eq("run_id", runId)
        .order("bucket")
        .order("gateway_ref"),
    ),
  ]);
  const mapped: ReconRunItem[] = items.map((i) => ({
    id: i.id,
    bucket: i.bucket,
    gatewayRef: i.gateway_ref,
    fileAmountPaise: i.file_amount_paise === null ? null : Number(i.file_amount_paise),
    fileStatus: i.file_status,
    settledAt: i.settled_at,
    systemAmountPaise: i.system_amount_paise === null ? null : Number(i.system_amount_paise),
    systemStatus: i.system_status,
    paymentId: i.payment_id,
    currentPaymentStatus: i.payments?.status ?? null,
    student: i.payments?.students ? { id: i.payments.students.id, name: i.payments.students.name, rollNo: i.payments.students.roll_no } : null,
    resolution: i.resolution,
    resolutionNote: i.resolution_note,
    resolvedBy: i.resolved_by,
    resolvedAt: i.resolved_at,
  }));
  return {
    id: r.id,
    fileName: r.file_name,
    uploadedBy: r.uploaded_by,
    rowCount: r.row_count,
    totals: r.totals,
    rejectedCount: Array.isArray(r.rejected_rows) ? r.rejected_rows.length : 0,
    openCount: mapped.filter((m) => m.bucket !== "MATCHED" && m.resolution === null).length,
    createdAt: r.created_at,
    rejected: r.rejected_rows ?? [],
    items: mapped,
  };
}

/** An earlier run of the byte-identical file, if any (hash stored in totals.fileHash). */
export async function earlierRunOfSameFile(current: { totals: ReconTotals & { fileHash?: string }; createdAt: string }): Promise<{ id: string; createdAt: string } | null> {
  const hash = current.totals.fileHash;
  if (!hash) return null;
  const rows = await run<{ id: string; created_at: string }[]>(
    db().from("reconciliation_runs").select("id, created_at").eq("totals->>fileHash", hash).lt("created_at", current.createdAt).order("created_at", { ascending: false }).limit(1),
  );
  return rows[0] ? { id: rows[0].id, createdAt: rows[0].created_at } : null;
}
