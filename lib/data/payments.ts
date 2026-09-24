import { ApiError } from "@/lib/api/errors";
import { safeSearch } from "@/lib/api/schemas";
import type { PaymentMode, PaymentStatus } from "@/lib/domain/payment-state";
import { db, run, runSingle } from "@/lib/data/db";

export type PaymentListItem = {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  amountPaise: number;
  mode: PaymentMode;
  status: PaymentStatus;
  gatewayRef: string | null;
  receiptNo: string | null;
  createdAt: string;
  paidAt: string | null;
};

type ListRow = {
  id: string;
  student_id: string;
  amount_paise: number;
  mode: PaymentMode;
  status: PaymentStatus;
  gateway_ref: string | null;
  receipt_no: string | null;
  created_at: string;
  paid_at: string | null;
  students: { name: string; roll_no: string } | null;
};

export async function listPayments(filters: { status?: PaymentStatus; mode?: PaymentMode; q?: string; limit: number }): Promise<PaymentListItem[]> {
  let query = db()
    .from("payments")
    .select("id, student_id, amount_paise, mode, status, gateway_ref, receipt_no, created_at, paid_at, students!inner(name, roll_no)")
    .order("created_at", { ascending: false })
    .limit(filters.limit);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.mode) query = query.eq("mode", filters.mode);
  const q = safeSearch(filters.q);
  if (q) {
    // PostgREST can't OR across an embedded table, so match students first, then OR on ids.
    const students = await run<{ id: string }[]>(db().from("students").select("id").or(`name.ilike.*${q}*,roll_no.ilike.*${q}*`).limit(100));
    const ids = students.map((s) => s.id);
    const idFilter = ids.length ? `,student_id.in.(${ids.join(",")})` : "";
    query = query.or(`receipt_no.ilike.*${q}*,gateway_ref.ilike.*${q}*${idFilter}`);
  }
  const rows = await run<ListRow[]>(query);
  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.students?.name ?? "",
    rollNo: r.students?.roll_no ?? "",
    amountPaise: Number(r.amount_paise),
    mode: r.mode,
    status: r.status,
    gatewayRef: r.gateway_ref,
    receiptNo: r.receipt_no,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
}

export type PaymentDetail = {
  payment: {
    id: string;
    studentId: string;
    amountPaise: number;
    mode: PaymentMode;
    status: PaymentStatus;
    gatewayRef: string | null;
    reference: string | null;
    idempotencyKey: string;
    receiptNo: string | null;
    failureReason: string | null;
    reversalReason: string | null;
    paidAt: string | null;
    reversedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  student: { id: string; name: string; rollNo: string; courseCode: string; courseName: string; year: number };
  events: { id: number; fromStatus: PaymentStatus | null; toStatus: PaymentStatus; note: string | null; actor: string; createdAt: string }[];
  allocations: { installmentId: string; label: string; dueDate: string; amountPaise: number; createdAt: string }[];
  ledgerEntries: { id: number; type: string; amountPaise: number; note: string | null; createdAt: string }[];
  audit: { id: number; actor: string; action: string; details: Record<string, unknown>; createdAt: string }[];
};

export async function getPaymentDetail(paymentId: string): Promise<PaymentDetail> {
  const client = db();
  const p = await runSingle<{
    id: string;
    student_id: string;
    amount_paise: number;
    mode: PaymentMode;
    status: PaymentStatus;
    gateway_ref: string | null;
    reference: string | null;
    idempotency_key: string;
    receipt_no: string | null;
    failure_reason: string | null;
    reversal_reason: string | null;
    paid_at: string | null;
    reversed_at: string | null;
    created_at: string;
    updated_at: string;
    students: { id: string; name: string; roll_no: string; year: number; courses: { code: string; name: string } };
  }>(
    client.from("payments").select("*, students(id, name, roll_no, year, courses(code, name))").eq("id", paymentId).maybeSingle(),
    "Payment not found.",
  );

  const [events, allocations, ledger, audit] = await Promise.all([
    run<{ id: number; from_status: PaymentStatus | null; to_status: PaymentStatus; note: string | null; actor: string; created_at: string }[]>(
      client.from("payment_events").select("*").eq("payment_id", paymentId).order("id"),
    ),
    run<{ installment_id: string; amount_paise: number; created_at: string; installments: { label: string; due_date: string } | null }[]>(
      client.from("payment_allocations").select("installment_id, amount_paise, created_at, installments(label, due_date)").eq("payment_id", paymentId).order("created_at"),
    ),
    run<{ id: number; type: string; amount_paise: number; note: string | null; created_at: string }[]>(
      client.from("ledger_entries").select("id, type, amount_paise, note, created_at").eq("ref_id", paymentId).order("id"),
    ),
    run<{ id: number; actor: string; action: string; details: Record<string, unknown>; created_at: string }[]>(
      client.from("audit_log").select("id, actor, action, details, created_at").eq("entity", "payment").eq("entity_id", paymentId).order("id"),
    ),
  ]);

  return {
    payment: {
      id: p.id,
      studentId: p.student_id,
      amountPaise: Number(p.amount_paise),
      mode: p.mode,
      status: p.status,
      gatewayRef: p.gateway_ref,
      reference: p.reference,
      idempotencyKey: p.idempotency_key,
      receiptNo: p.receipt_no,
      failureReason: p.failure_reason,
      reversalReason: p.reversal_reason,
      paidAt: p.paid_at,
      reversedAt: p.reversed_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    },
    student: {
      id: p.students.id,
      name: p.students.name,
      rollNo: p.students.roll_no,
      year: p.students.year,
      courseCode: p.students.courses.code,
      courseName: p.students.courses.name,
    },
    events: events.map((e) => ({ id: Number(e.id), fromStatus: e.from_status, toStatus: e.to_status, note: e.note, actor: e.actor, createdAt: e.created_at })),
    allocations: allocations.map((a) => ({
      installmentId: a.installment_id,
      label: a.installments?.label ?? "",
      dueDate: a.installments?.due_date ?? "",
      amountPaise: Number(a.amount_paise),
      createdAt: a.created_at,
    })),
    ledgerEntries: ledger.map((l) => ({ id: Number(l.id), type: l.type, amountPaise: Number(l.amount_paise), note: l.note, createdAt: l.created_at })),
    audit: audit.map((a) => ({ id: Number(a.id), actor: a.actor, action: a.action, details: a.details, createdAt: a.created_at })),
  };
}

/** Minimal lookup used by the action routes (ownership checks, check-status). */
export async function getPaymentBasics(paymentId: string): Promise<{ id: string; studentId: string; status: PaymentStatus; mode: PaymentMode; gatewayRef: string | null }> {
  const row = await run<{ id: string; student_id: string; status: PaymentStatus; mode: PaymentMode; gateway_ref: string | null } | null>(
    db().from("payments").select("id, student_id, status, mode, gateway_ref").eq("id", paymentId).maybeSingle(),
  );
  if (!row) throw new ApiError(404, "payment_not_found", "Payment not found.");
  return { id: row.id, studentId: row.student_id, status: row.status, mode: row.mode, gatewayRef: row.gateway_ref };
}

/** What the mock gateway says about a transaction. Stands in for calling the provider's status API. */
export async function getGatewayStatus(gatewayRef: string): Promise<"PENDING" | "SUCCESS" | "FAILED" | null> {
  const row = await run<{ final_status: "PENDING" | "SUCCESS" | "FAILED" } | null>(
    db().from("mock_gateway_txns").select("final_status").eq("gateway_ref", gatewayRef).maybeSingle(),
  );
  return row?.final_status ?? null;
}

/** Shape of the jsonb returned by record_payment / confirm_payment / fail_payment / reverse_payment. */
export type PaymentRpcRow = {
  id: string;
  student_id: string;
  amount_paise: number;
  mode: PaymentMode;
  status: PaymentStatus;
  gateway_ref: string | null;
  reference: string | null;
  receipt_no: string | null;
  failure_reason: string | null;
  reversal_reason: string | null;
  paid_at: string | null;
  reversed_at: string | null;
  created_at: string;
  replayed?: boolean;
};

export function toPaymentDto(r: PaymentRpcRow) {
  return {
    id: r.id,
    studentId: r.student_id,
    amountPaise: Number(r.amount_paise),
    mode: r.mode,
    status: r.status,
    gatewayRef: r.gateway_ref,
    reference: r.reference,
    receiptNo: r.receipt_no,
    failureReason: r.failure_reason,
    reversalReason: r.reversal_reason,
    paidAt: r.paid_at,
    reversedAt: r.reversed_at,
    createdAt: r.created_at,
    ...(r.replayed === undefined ? {} : { replayed: r.replayed }),
  };
}
