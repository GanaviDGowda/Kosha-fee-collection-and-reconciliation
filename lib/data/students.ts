import { ApiError } from "@/lib/api/errors";
import { safeSearch, type StudentStatus } from "@/lib/api/schemas";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";
import { buildStatement, type ConcessionRef, type LedgerEntry, type PaymentRef, type StatementRow } from "@/lib/domain/statement";
import type { PaymentMode, PaymentStatus } from "@/lib/domain/payment-state";
import { db, run, runSingle } from "@/lib/data/db";

export type StudentBalance = {
  studentId: string;
  rollNo: string;
  name: string;
  courseCode: string;
  courseName: string;
  year: number;
  totalDemandPaise: number;
  totalConcessionPaise: number;
  totalPaidPaise: number;
  balancePaise: number;
  overduePaise: number;
  oldestOverdueDate: string | null;
  nextDueDate: string | null;
  nextDuePaise: number;
  pendingCount: number;
  lastPaidAt: string | null;
  status: StudentStatus;
};

type BalanceRow = {
  student_id: string;
  roll_no: string;
  name: string;
  course_code: string;
  course_name: string;
  year: number;
  total_demand_paise: number;
  total_concession_paise: number;
  total_paid_paise: number;
  balance_paise: number;
  overdue_paise: number;
  oldest_overdue_date: string | null;
  next_due_date: string | null;
  next_due_paise: number;
  pending_count: number;
  last_paid_at: string | null;
  status: StudentStatus;
};

export function toBalance(r: BalanceRow): StudentBalance {
  return {
    studentId: r.student_id,
    rollNo: r.roll_no,
    name: r.name,
    courseCode: r.course_code,
    courseName: r.course_name,
    year: r.year,
    totalDemandPaise: Number(r.total_demand_paise),
    totalConcessionPaise: Number(r.total_concession_paise),
    totalPaidPaise: Number(r.total_paid_paise),
    balancePaise: Number(r.balance_paise),
    overduePaise: Number(r.overdue_paise),
    oldestOverdueDate: r.oldest_overdue_date,
    nextDueDate: r.next_due_date,
    nextDuePaise: Number(r.next_due_paise),
    pendingCount: Number(r.pending_count),
    lastPaidAt: r.last_paid_at,
    status: r.status,
  };
}

export async function listStudents(filters: { q?: string; status?: StudentStatus; course?: string }): Promise<StudentBalance[]> {
  let query = db().from("v_student_balances").select("*").order("roll_no").limit(500);
  const q = safeSearch(filters.q);
  if (q) query = query.or(`name.ilike.*${q}*,roll_no.ilike.*${q}*`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.course) query = query.eq("course_code", filters.course);
  const rows = await run<BalanceRow[]>(query);
  return rows.map(toBalance);
}

export async function listCourses(): Promise<{ code: string; name: string }[]> {
  return run(db().from("courses").select("code, name").order("code"));
}

const ROLL_RE = /^[A-Za-z]{2,6}\d{2}-\d{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts a student uuid or a roll number (so demo links can use /students/CSE24-001). */
export async function resolveStudentId(idOrRoll: string): Promise<string> {
  if (UUID_RE.test(idOrRoll)) return idOrRoll.toLowerCase();
  if (!ROLL_RE.test(idOrRoll)) throw new ApiError(404, "student_not_found", "Student not found.");
  const row = await run<{ id: string } | null>(db().from("students").select("id").eq("roll_no", idOrRoll.toUpperCase()).maybeSingle());
  if (!row) throw new ApiError(404, "student_not_found", `No student with roll number ${idOrRoll.toUpperCase()}.`);
  return row.id;
}

/** The account the "student" role acts as. Not cached: ids change when demo data is reset. */
export async function getDemoStudentId(): Promise<string> {
  return resolveStudentId(DEMO_STUDENT_ROLL_NO);
}

// ---------------------------------------------------------------------------
// Student detail (the statement screen)
// ---------------------------------------------------------------------------

export type InstallmentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";

export type Installment = {
  installmentId: string;
  feeHead: string;
  feeHeadOrder: number;
  term: number;
  label: string;
  dueDate: string;
  demandPaise: number;
  concessionPaise: number;
  paidPaise: number;
  remainingPaise: number;
  status: InstallmentStatus;
};

export type FeeHeadSummary = {
  feeHead: string;
  demandPaise: number;
  concessionPaise: number;
  paidPaise: number;
  remainingPaise: number;
  overduePaise: number;
};

export type StudentPayment = {
  id: string;
  amountPaise: number;
  mode: PaymentMode;
  status: PaymentStatus;
  gatewayRef: string | null;
  reference: string | null;
  receiptNo: string | null;
  failureReason: string | null;
  reversalReason: string | null;
  paidAt: string | null;
  reversedAt: string | null;
  createdAt: string;
  allocations: { installmentId: string; label: string; amountPaise: number }[];
};

export type StudentDetail = {
  student: { id: string; rollNo: string; name: string; email: string | null; phone: string | null; year: number; courseCode: string; courseName: string };
  balance: StudentBalance;
  installments: Installment[];
  feeHeads: FeeHeadSummary[];
  statement: StatementRow[];
  payments: StudentPayment[];
};

type InstallmentRow = {
  installment_id: string;
  fee_head: string;
  fee_head_order: number;
  term: number;
  label: string;
  due_date: string;
  demand_paise: number;
  concession_paise: number;
  paid_paise: number;
  remaining_paise: number;
  status: InstallmentStatus;
};

type PaymentRow = {
  id: string;
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
  payment_allocations: { installment_id: string; amount_paise: number; installments: { label: string } | null }[];
};

export function toInstallment(r: InstallmentRow): Installment {
  return {
    installmentId: r.installment_id,
    feeHead: r.fee_head,
    feeHeadOrder: r.fee_head_order,
    term: r.term,
    label: r.label,
    dueDate: r.due_date,
    demandPaise: Number(r.demand_paise),
    concessionPaise: Number(r.concession_paise),
    paidPaise: Number(r.paid_paise),
    remainingPaise: Number(r.remaining_paise),
    status: r.status,
  };
}

export function summariseFeeHeads(installments: Installment[]): FeeHeadSummary[] {
  const byHead = new Map<string, FeeHeadSummary & { order: number }>();
  for (const i of installments) {
    const s = byHead.get(i.feeHead) ?? { feeHead: i.feeHead, order: i.feeHeadOrder, demandPaise: 0, concessionPaise: 0, paidPaise: 0, remainingPaise: 0, overduePaise: 0 };
    s.demandPaise += i.demandPaise;
    s.concessionPaise += i.concessionPaise;
    s.paidPaise += i.paidPaise;
    s.remainingPaise += i.remainingPaise;
    if (i.status === "OVERDUE") s.overduePaise += i.remainingPaise;
    byHead.set(i.feeHead, s);
  }
  return [...byHead.values()].sort((a, b) => a.order - b.order).map(({ order: _order, ...rest }) => rest);
}

export async function getStudentDetail(studentId: string): Promise<StudentDetail> {
  const client = db();
  const [student, balance, installments, ledger, payments, concessions] = await Promise.all([
    runSingle<{ id: string; roll_no: string; name: string; email: string | null; phone: string | null; year: number; courses: { code: string; name: string } }>(
      client.from("students").select("id, roll_no, name, email, phone, year, courses(code, name)").eq("id", studentId).maybeSingle(),
      "Student not found.",
    ),
    runSingle<BalanceRow>(client.from("v_student_balances").select("*").eq("student_id", studentId).maybeSingle(), "Student not found."),
    run<InstallmentRow[]>(
      client.from("v_installment_status").select("*").eq("student_id", studentId).order("due_date").order("fee_head_order").order("term"),
    ),
    run<{ id: number; type: LedgerEntry["type"]; amount_paise: number; ref_table: LedgerEntry["refTable"]; ref_id: string; note: string | null; created_at: string }[]>(
      client.from("ledger_entries").select("id, type, amount_paise, ref_table, ref_id, note, created_at").eq("student_id", studentId).order("created_at").order("id"),
    ),
    run<PaymentRow[]>(
      client
        .from("payments")
        .select("id, amount_paise, mode, status, gateway_ref, reference, receipt_no, failure_reason, reversal_reason, paid_at, reversed_at, created_at, payment_allocations(installment_id, amount_paise, installments(label))")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
    ),
    run<{ id: string; reason: string; approved_by: string; installments: { label: string } | null }[]>(
      client.from("concessions").select("id, reason, approved_by, installments(label)").eq("student_id", studentId),
    ),
  ]);

  const studentPayments: StudentPayment[] = payments.map((p) => ({
    id: p.id,
    amountPaise: Number(p.amount_paise),
    mode: p.mode,
    status: p.status,
    gatewayRef: p.gateway_ref,
    reference: p.reference,
    receiptNo: p.receipt_no,
    failureReason: p.failure_reason,
    reversalReason: p.reversal_reason,
    paidAt: p.paid_at,
    reversedAt: p.reversed_at,
    createdAt: p.created_at,
    allocations: p.payment_allocations.map((a) => ({ installmentId: a.installment_id, label: a.installments?.label ?? "", amountPaise: Number(a.amount_paise) })),
  }));

  const paymentRefs = new Map<string, PaymentRef>(
    studentPayments.map((p) => [p.id, { id: p.id, receiptNo: p.receiptNo, gatewayRef: p.gatewayRef, mode: p.mode, status: p.status, reversalReason: p.reversalReason }]),
  );
  const concessionRefs = new Map<string, ConcessionRef>(
    concessions.map((c) => [c.id, { id: c.id, reason: c.reason, approvedBy: c.approved_by, label: c.installments?.label ?? "installment" }]),
  );
  const entries: LedgerEntry[] = ledger.map((e) => ({
    id: Number(e.id),
    type: e.type,
    amountPaise: Number(e.amount_paise),
    refTable: e.ref_table,
    refId: e.ref_id,
    note: e.note,
    createdAt: e.created_at,
  }));
  const insts = installments.map(toInstallment);

  return {
    student: {
      id: student.id,
      rollNo: student.roll_no,
      name: student.name,
      email: student.email,
      phone: student.phone,
      year: student.year,
      courseCode: student.courses.code,
      courseName: student.courses.name,
    },
    balance: toBalance(balance),
    installments: insts,
    feeHeads: summariseFeeHeads(insts),
    statement: buildStatement(entries, paymentRefs, concessionRefs),
    payments: studentPayments,
  };
}
