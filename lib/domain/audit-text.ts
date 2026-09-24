// Turns an audit_log row into a sentence for the audit screen, e.g.
// "Admin reversed payment KSH/2026-27/000118 (₹62,500): cheque bounced".

import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { formatINR } from "@/lib/money";
import { BUCKET_LABEL, type Bucket } from "@/lib/domain/reconcile";
import { MODE_LABEL, type PaymentMode } from "@/lib/domain/payment-state";

export type AuditRow = {
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
};

function actorLabel(actor: string): string {
  if (isRole(actor)) return ROLE_LABEL[actor];
  if (actor === "gateway") return "Gateway";
  if (actor === "system") return "System";
  return actor;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const money = (v: unknown): string => (num(v) === null ? "" : formatINR(num(v)!, { paise: "auto" }));

export function describeAudit(row: AuditRow, studentName?: string | null): string {
  const who = actorLabel(row.actor);
  const d = row.details ?? {};
  const forStudent = studentName ? ` for ${studentName}` : "";
  const receipt = str(d.receipt_no);
  const mode = str(d.mode) as PaymentMode | null;
  const modeText = mode && mode in MODE_LABEL ? (mode === "UPI" ? "UPI " : `${MODE_LABEL[mode].toLowerCase()} `) : "";

  switch (row.action) {
    case "payment.recorded":
      return `${who} recorded a ${modeText}payment of ${money(d.amount_paise)}${forStudent}`;
    case "payment.succeeded":
      return `Receipt ${receipt ?? "(none)"} issued for ${money(d.amount_paise)}${forStudent}, confirmed by ${who.toLowerCase()}`;
    case "payment.failed":
      return `${who} marked a payment of ${money(d.amount_paise)} as failed${forStudent}${str(d.reason) ? `: ${str(d.reason)}` : ""}`;
    case "payment.timed_out":
      return `Gateway timed out on ${str(d.gateway_ref) ?? "a payment"} (${money(d.amount_paise)})${forStudent}; left pending`;
    case "payment.reversed":
      return `${who} reversed payment ${receipt ?? ""} (${money(d.amount_paise)})${forStudent}: ${str(d.reason) ?? "no reason given"}`.replace(/\s+/g, " ");
    case "concession.applied":
      return `${who} applied a concession of ${money(d.amount_paise)} on ${str(d.label) ?? "an installment"}${forStudent}: ${str(d.reason) ?? ""}`.trim();
    case "reconciliation.run": {
      const totals = (d.totals ?? {}) as { buckets?: Record<string, { count?: number }> };
      const exceptions = ["AMOUNT_MISMATCH", "SETTLED_PENDING_HERE", "MISSING_IN_SETTLEMENT"].reduce(
        (n, b) => n + (totals.buckets?.[b]?.count ?? 0),
        0,
      );
      return `${who} ran reconciliation on ${str(d.file_name) ?? "a settlement file"}: ${num(d.row_count) ?? 0} rows, ${exceptions} exception${exceptions === 1 ? "" : "s"}`;
    }
    case "reconciliation.resolved": {
      const bucket = str(d.bucket) as Bucket | null;
      const label = bucket && bucket in BUCKET_LABEL ? BUCKET_LABEL[bucket].toLowerCase() : "reconciliation item";
      const ref = str(d.gateway_ref) ?? "";
      const note = str(d.note) ? `: ${str(d.note)}` : "";
      if (d.resolution === "MARKED_PAID") return `${who} marked ${ref} as paid from reconciliation${note}`;
      return `${who} reviewed ${label} on ${ref}${note}`;
    }
    case "demo.reset":
      return `${who} reset the demo data`;
    default:
      return `${who}: ${row.action} on ${row.entity}${row.entityId ? ` ${row.entityId}` : ""}`;
  }
}
