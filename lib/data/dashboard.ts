import { addDays, isoDateIST } from "@/lib/dates";
import { termFor } from "@/lib/domain/terms";
import type { Bucket } from "@/lib/domain/reconcile";
import type { PaymentMode } from "@/lib/domain/payment-state";
import { db, run } from "@/lib/data/db";
import { toBalance } from "@/lib/data/students";

export type Dashboard = {
  asOf: string;
  term: { label: string; from: string; to: string };
  summary: {
    collectedThisTermPaise: number;
    collectedThisTermCount: number;
    outstandingPaise: number;
    overduePaise: number;
    overdueStudents: number;
    advancePaise: number;
    pendingCount: number;
    pendingPaise: number;
    openReconItems: number;
  };
  trend: { date: string; paise: number; count: number }[];
  overdueByCourse: { courseCode: string; courseName: string; overduePaise: number; students: number }[];
  attention: {
    pendingPayments: { paymentId: string; studentId: string; studentName: string; rollNo: string; amountPaise: number; mode: PaymentMode; gatewayRef: string | null; createdAt: string }[];
    reconItems: { itemId: string; runId: string; bucket: Bucket; gatewayRef: string; filePaise: number | null; systemPaise: number | null; createdAt: string }[];
    longOverdue: { studentId: string; studentName: string; rollNo: string; overduePaise: number; oldestOverdueDate: string; daysOverdue: number }[];
  };
};

const TREND_DAYS = 30;
const LONG_OVERDUE_DAYS = 30;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export async function getDashboard(now = new Date()): Promise<Dashboard> {
  const today = isoDateIST(now);
  const term = termFor(today);
  const trendFrom = addDays(today, -(TREND_DAYS - 1));
  const client = db();

  // Payments since the earlier of term start and the trend window; small enough to aggregate here.
  const since = trendFrom < term.from ? trendFrom : term.from;
  const [balancesRaw, successPayments, pending, reconItems] = await Promise.all([
    run<Parameters<typeof toBalance>[0][]>(client.from("v_student_balances").select("*")),
    run<{ amount_paise: number; paid_at: string }[]>(
      client.from("payments").select("amount_paise, paid_at").eq("status", "SUCCESS").gte("paid_at", `${since}T00:00:00+05:30`),
    ),
    run<{ id: string; student_id: string; amount_paise: number; mode: PaymentMode; gateway_ref: string | null; created_at: string; students: { name: string; roll_no: string } | null }[]>(
      client.from("payments").select("id, student_id, amount_paise, mode, gateway_ref, created_at, students(name, roll_no)").eq("status", "PENDING").order("created_at"),
    ),
    run<{ id: string; run_id: string; bucket: Bucket; gateway_ref: string; file_amount_paise: number | null; system_amount_paise: number | null; created_at: string }[]>(
      client
        .from("reconciliation_items")
        .select("id, run_id, bucket, gateway_ref, file_amount_paise, system_amount_paise, created_at")
        .is("resolution", null)
        .neq("bucket", "MATCHED")
        .order("created_at", { ascending: false })
        .limit(50),
    ),
  ]);
  const balances = balancesRaw.map(toBalance);
  // The same file reconciled twice leaves the same open item in both runs; show each
  // reference once, from the newest run (rows are already newest first).
  const seenRefs = new Set<string>();
  const openItems = reconItems.filter((r) => {
    const key = `${r.bucket}:${r.gateway_ref}`;
    if (seenRefs.has(key)) return false;
    seenRefs.add(key);
    return true;
  });

  let collected = 0;
  let collectedCount = 0;
  const byDay = new Map<string, { paise: number; count: number }>();
  for (const p of successPayments) {
    const day = isoDateIST(p.paid_at);
    const amount = Number(p.amount_paise);
    if (day >= term.from && day <= term.to) {
      collected += amount;
      collectedCount += 1;
    }
    if (day >= trendFrom && day <= today) {
      const d = byDay.get(day) ?? { paise: 0, count: 0 };
      d.paise += amount;
      d.count += 1;
      byDay.set(day, d);
    }
  }
  const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = addDays(trendFrom, i);
    return { date, paise: byDay.get(date)?.paise ?? 0, count: byDay.get(date)?.count ?? 0 };
  });

  const byCourse = new Map<string, { courseCode: string; courseName: string; overduePaise: number; students: number }>();
  for (const b of balances) {
    const c = byCourse.get(b.courseCode) ?? { courseCode: b.courseCode, courseName: b.courseName, overduePaise: 0, students: 0 };
    if (b.overduePaise > 0) {
      c.overduePaise += b.overduePaise;
      c.students += 1;
    }
    byCourse.set(b.courseCode, c);
  }

  const longOverdue = balances
    .filter((b) => b.overduePaise > 0 && b.oldestOverdueDate && daysBetween(b.oldestOverdueDate, today) > LONG_OVERDUE_DAYS)
    .map((b) => ({
      studentId: b.studentId,
      studentName: b.name,
      rollNo: b.rollNo,
      overduePaise: b.overduePaise,
      oldestOverdueDate: b.oldestOverdueDate!,
      daysOverdue: daysBetween(b.oldestOverdueDate!, today),
    }))
    .sort((a, b) => b.overduePaise - a.overduePaise);

  const pendingPayments = pending.map((p) => ({
    paymentId: p.id,
    studentId: p.student_id,
    studentName: p.students?.name ?? "",
    rollNo: p.students?.roll_no ?? "",
    amountPaise: Number(p.amount_paise),
    mode: p.mode,
    gatewayRef: p.gateway_ref,
    createdAt: p.created_at,
  }));

  return {
    asOf: now.toISOString(),
    term: { label: term.label, from: term.from, to: term.to },
    summary: {
      collectedThisTermPaise: collected,
      collectedThisTermCount: collectedCount,
      outstandingPaise: balances.reduce((s, b) => s + Math.max(b.balancePaise, 0), 0),
      overduePaise: balances.reduce((s, b) => s + b.overduePaise, 0),
      overdueStudents: balances.filter((b) => b.overduePaise > 0).length,
      advancePaise: balances.reduce((s, b) => s + Math.max(-b.balancePaise, 0), 0),
      pendingCount: pendingPayments.length,
      pendingPaise: pendingPayments.reduce((s, p) => s + p.amountPaise, 0),
      openReconItems: openItems.length,
    },
    trend,
    overdueByCourse: [...byCourse.values()].sort((a, b) => b.overduePaise - a.overduePaise),
    attention: {
      pendingPayments,
      reconItems: openItems.map((r) => ({
        itemId: r.id,
        runId: r.run_id,
        bucket: r.bucket,
        gatewayRef: r.gateway_ref,
        filePaise: r.file_amount_paise === null ? null : Number(r.file_amount_paise),
        systemPaise: r.system_amount_paise === null ? null : Number(r.system_amount_paise),
        createdAt: r.created_at,
      })),
      longOverdue,
    },
  };
}
