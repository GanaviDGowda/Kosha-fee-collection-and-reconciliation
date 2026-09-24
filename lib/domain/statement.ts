// Builds the passbook statement from ledger entries: one row per entry, oldest first,
// with a running balance. Positive balance = the student owes; negative = advance.
// Debit column = amounts that increase what is owed (demand, reversal);
// Credit column = amounts that reduce it (payment, concession).

import type { PaymentMode, PaymentStatus } from "@/lib/domain/payment-state";
import { MODE_LABEL } from "@/lib/domain/payment-state";

export type LedgerType = "DEMAND" | "CONCESSION" | "PAYMENT" | "REVERSAL";

export type LedgerEntry = {
  id: number;
  type: LedgerType;
  amountPaise: number;
  refTable: "installments" | "concessions" | "payments";
  refId: string;
  note: string | null;
  createdAt: string;
};

export type PaymentRef = {
  id: string;
  receiptNo: string | null;
  gatewayRef: string | null;
  mode: PaymentMode;
  status: PaymentStatus;
  reversalReason: string | null;
};

export type ConcessionRef = { id: string; reason: string; approvedBy: string; label: string };

export type StatementRow = {
  entryId: number;
  date: string;
  type: LedgerType;
  description: string;
  reference: string | null; // a code: receipt number or gateway ref
  detail: string | null; // secondary line under the description, e.g. who approved a concession
  debitPaise: number | null;
  creditPaise: number | null;
  balancePaise: number;
  muted: boolean; // an original payment that was later reversed
  linkedEntryId: number | null; // payment <-> its reversal
  paymentId: string | null;
};

export function buildStatement(
  entries: LedgerEntry[],
  payments: Map<string, PaymentRef>,
  concessions: Map<string, ConcessionRef>,
): StatementRow[] {
  const sorted = [...entries].sort((a, b) => (a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1));

  // payment id -> { PAYMENT entry id, REVERSAL entry id }
  const pairs = new Map<string, { payment?: number; reversal?: number }>();
  for (const e of sorted) {
    if (e.refTable !== "payments") continue;
    const pair = pairs.get(e.refId) ?? {};
    if (e.type === "PAYMENT") pair.payment = e.id;
    if (e.type === "REVERSAL") pair.reversal = e.id;
    pairs.set(e.refId, pair);
  }

  let balance = 0;
  return sorted.map((e) => {
    balance += e.amountPaise;
    const row: StatementRow = {
      entryId: e.id,
      date: e.createdAt,
      type: e.type,
      description: e.note ?? e.type,
      reference: null,
      detail: null,
      debitPaise: e.amountPaise > 0 ? e.amountPaise : null,
      creditPaise: e.amountPaise < 0 ? -e.amountPaise : null,
      balancePaise: balance,
      muted: false,
      linkedEntryId: null,
      paymentId: null,
    };

    if (e.type === "DEMAND") {
      row.description = (e.note ?? "Fee demand").replace(/^Fee demand: /, "Fee demand, ");
    } else if (e.type === "PAYMENT" || e.type === "REVERSAL") {
      const p = payments.get(e.refId);
      const pair = pairs.get(e.refId);
      row.paymentId = e.refId;
      row.reference = p?.receiptNo ?? p?.gatewayRef ?? null;
      if (e.type === "PAYMENT") {
        row.description = p ? `Payment received, ${MODE_LABEL[p.mode]}` : "Payment received";
        if (p?.status === "REVERSED") {
          row.muted = true;
          row.linkedEntryId = pair?.reversal ?? null;
        }
      } else {
        row.description = p?.reversalReason ? `Payment reversed: ${p.reversalReason}` : "Payment reversed";
        row.linkedEntryId = pair?.payment ?? null;
      }
    } else if (e.type === "CONCESSION") {
      const c = concessions.get(e.refId);
      row.description = c ? `Concession on ${c.label}: ${c.reason}` : (e.note ?? "Concession");
      row.detail = c ? `Approved by ${c.approvedBy}` : null;
    }
    return row;
  });
}
