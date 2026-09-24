// Reconciliation: match a gateway settlement file against our payments.
// Pure functions only (no I/O), so every rule here is unit tested.
//
// Buckets
//   MATCHED                ref found, amounts agree, we have it as SUCCESS (or later REVERSED)
//   AMOUNT_MISMATCH        ref found, amounts differ. Never auto-fixed.
//   SETTLED_PENDING_HERE   gateway settled it, we still have it PENDING. Can be marked as paid.
//   MISSING_IN_SETTLEMENT  our online SUCCESS payment, inside the file's period, absent from the file.
//
// Rows that can't be bucketed are returned as `rejected` with a reason: malformed rows,
// duplicate refs, non-settlement statuses, refs we have never seen, and settlements of
// payments we recorded as failed.

import { addDays, isoDateIST } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import type { PaymentStatus } from "@/lib/domain/payment-state";

export const REQUIRED_COLUMNS = ["gateway_ref", "amount_inr", "status", "settled_at"] as const;

export const BUCKETS = ["MATCHED", "AMOUNT_MISMATCH", "SETTLED_PENDING_HERE", "MISSING_IN_SETTLEMENT"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
  MATCHED: "Matched",
  AMOUNT_MISMATCH: "Amount mismatch",
  SETTLED_PENDING_HERE: "Settled but pending here",
  MISSING_IN_SETTLEMENT: "Recorded here, missing in settlement",
};

/** Short labels for tight places (badges in lists). */
export const BUCKET_SHORT: Record<Bucket, string> = {
  MATCHED: "Matched",
  AMOUNT_MISMATCH: "Amount mismatch",
  SETTLED_PENDING_HERE: "Settled, pending here",
  MISSING_IN_SETTLEMENT: "Missing in settlement",
};

const SETTLED_STATUSES = new Set(["SUCCESS", "SETTLED", "CAPTURED"]);
const NON_SETTLEMENT_STATUSES = new Set(["FAILED", "REFUNDED", "REVERSED", "CHARGEBACK", "DECLINED", "CANCELLED"]);
const GATEWAY_REF_RE = /^[A-Z0-9_-]{4,64}$/;

export type RawRow = Record<string, string | undefined>;

export type SettlementRow = {
  line: number;
  gatewayRef: string;
  amountPaise: number;
  status: string;
  settledAt: string; // ISO timestamp
  settledDate: string; // YYYY-MM-DD in IST
};

export type RejectedKind = "invalid" | "duplicate" | "ignored" | "unknown_ref" | "status_conflict";

export type RejectedRow = {
  line: number;
  kind: RejectedKind;
  gatewayRef: string | null;
  reason: string;
  raw?: RawRow;
};

export type SystemPayment = {
  id: string;
  gatewayRef: string;
  amountPaise: number;
  status: PaymentStatus;
  paidAt: string | null;
};

export type ReconItem = {
  bucket: Bucket;
  gatewayRef: string;
  fileAmountPaise: number | null;
  fileStatus: string | null;
  settledAt: string | null;
  systemAmountPaise: number | null;
  systemStatus: PaymentStatus | null;
  paymentId: string | null;
  line: number | null;
};

export type BucketTotals = { count: number; filePaise: number; systemPaise: number };

export type ReconTotals = {
  rows: number;
  valid: number;
  rejected: number;
  window: { from: string; to: string } | null;
  buckets: Record<Bucket, BucketTotals>;
};

// ---------------------------------------------------------------------------
// Parsing and validation of rows
// ---------------------------------------------------------------------------

export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^﻿/, "");
}

/** Returns the missing required columns, or [] if the header is usable. */
export function missingColumns(headers: string[]): string[] {
  const have = new Set(headers.map(normaliseHeader));
  return REQUIRED_COLUMNS.filter((c) => !have.has(c));
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses settled_at. Times without a zone are taken as IST. Returns null if unusable. */
export function parseSettledAt(value: string): { iso: string; date: string } | null {
  const v = value.trim();
  let d: Date;
  if (ISO_WITH_ZONE.test(v)) d = new Date(v.replace(" ", "T"));
  else if (LOCAL_DATETIME.test(v)) {
    const [, date, hm, sec] = LOCAL_DATETIME.exec(v)!;
    d = new Date(`${date}T${hm}${sec ?? ":00"}+05:30`);
  } else if (DATE_ONLY.test(v)) d = new Date(`${v}T00:00:00+05:30`);
  else return null;
  if (Number.isNaN(d.getTime())) return null;
  // Reject impossible calendar dates that Date silently rolls over (e.g. 2026-02-30).
  const datePart = v.slice(0, 10);
  const check = new Date(`${datePart}T12:00:00Z`);
  if (check.toISOString().slice(0, 10) !== datePart) return null;
  return { iso: d.toISOString(), date: isoDateIST(d) };
}

function field(row: RawRow, name: string): string {
  for (const [k, v] of Object.entries(row)) {
    if (normaliseHeader(k) === name) return (v ?? "").trim();
  }
  return "";
}

/**
 * Validates every row on its own, then resolves duplicate refs:
 *   identical duplicates  -> first kept, the rest rejected as duplicates
 *   conflicting duplicates (different amount or status) -> all rejected, we can't know which is right
 * `firstLine` is the file line number of rows[0] (2 when the file has a header row).
 */
export function validateRows(rows: RawRow[], firstLine = 2): { valid: SettlementRow[]; rejected: RejectedRow[] } {
  const rejected: RejectedRow[] = [];
  const candidates: SettlementRow[] = [];

  rows.forEach((raw, i) => {
    const line = firstLine + i;
    const values = Object.values(raw).map((v) => (v ?? "").trim());
    if (values.every((v) => v === "")) return; // blank line

    const ref = field(raw, "gateway_ref").toUpperCase();
    const amountRaw = field(raw, "amount_inr");
    const statusRaw = field(raw, "status").toUpperCase();
    const settledRaw = field(raw, "settled_at");
    const reject = (kind: RejectedKind, reason: string) =>
      rejected.push({ line, kind, gatewayRef: ref || null, reason, raw });

    if (!ref) return reject("invalid", "gateway_ref is empty.");
    if (!GATEWAY_REF_RE.test(ref)) return reject("invalid", `gateway_ref "${ref}" has unexpected characters.`);

    const amount = toPaise(amountRaw);
    if (!amount.ok) return reject("invalid", `amount_inr "${amountRaw}": ${amount.error}`);
    if (amount.paise === 0) return reject("invalid", "amount_inr is zero.");

    if (!statusRaw) return reject("invalid", "status is empty.");
    if (NON_SETTLEMENT_STATUSES.has(statusRaw)) {
      return reject("ignored", `Status ${statusRaw} is not a settlement, so the row was not matched.`);
    }
    if (!SETTLED_STATUSES.has(statusRaw)) return reject("invalid", `Unknown status "${statusRaw}".`);

    const settled = parseSettledAt(settledRaw);
    if (!settled) return reject("invalid", `settled_at "${settledRaw}" is not a valid date.`);

    candidates.push({ line, gatewayRef: ref, amountPaise: amount.paise, status: statusRaw, settledAt: settled.iso, settledDate: settled.date });
  });

  const byRef = new Map<string, SettlementRow[]>();
  for (const row of candidates) byRef.set(row.gatewayRef, [...(byRef.get(row.gatewayRef) ?? []), row]);

  const valid: SettlementRow[] = [];
  for (const group of byRef.values()) {
    const [first, ...rest] = group as [SettlementRow, ...SettlementRow[]];
    if (rest.length === 0) {
      valid.push(first);
      continue;
    }
    const conflicting = rest.some((r) => r.amountPaise !== first.amountPaise);
    if (conflicting) {
      for (const r of group) {
        rejected.push({
          line: r.line,
          kind: "duplicate",
          gatewayRef: r.gatewayRef,
          reason: `${r.gatewayRef} appears ${group.length} times with different amounts (lines ${group.map((g) => g.line).join(", ")}). Fix the file and upload again.`,
        });
      }
    } else {
      valid.push(first);
      for (const r of rest) {
        rejected.push({ line: r.line, kind: "duplicate", gatewayRef: r.gatewayRef, reason: `Duplicate of line ${first.line}; counted once.` });
      }
    }
  }

  valid.sort((a, b) => a.line - b.line);
  rejected.sort((a, b) => a.line - b.line);
  return { valid, rejected };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Settlements are assumed T+1: a file whose settled dates run from D1 to D2 covers payments
 * made from D1-1 to D2-1. Only our payments inside that window can be "missing".
 */
export function settlementWindow(valid: SettlementRow[]): { from: string; to: string } | null {
  if (valid.length === 0) return null;
  const dates = valid.map((r) => r.settledDate).sort();
  return { from: addDays(dates[0]!, -1), to: addDays(dates[dates.length - 1]!, -1) };
}

function emptyTotals(): Record<Bucket, BucketTotals> {
  return {
    MATCHED: { count: 0, filePaise: 0, systemPaise: 0 },
    AMOUNT_MISMATCH: { count: 0, filePaise: 0, systemPaise: 0 },
    SETTLED_PENDING_HERE: { count: 0, filePaise: 0, systemPaise: 0 },
    MISSING_IN_SETTLEMENT: { count: 0, filePaise: 0, systemPaise: 0 },
  };
}

export type ReconcileResult = { items: ReconItem[]; rejected: RejectedRow[]; totals: ReconTotals };

/**
 * @param rows      raw CSV rows (header already applied)
 * @param system    our online payments that have a gateway_ref (any status)
 */
export function reconcile(rows: RawRow[], system: SystemPayment[], firstLine = 2): ReconcileResult {
  const { valid, rejected } = validateRows(rows, firstLine);
  const byRef = new Map(system.map((p) => [p.gatewayRef.toUpperCase(), p]));
  const items: ReconItem[] = [];

  for (const row of valid) {
    const sys = byRef.get(row.gatewayRef);
    if (!sys) {
      rejected.push({ line: row.line, kind: "unknown_ref", gatewayRef: row.gatewayRef, reason: `No payment here has gateway reference ${row.gatewayRef}. Check with the gateway before recording anything.` });
      continue;
    }
    const base = {
      gatewayRef: row.gatewayRef,
      fileAmountPaise: row.amountPaise,
      fileStatus: row.status,
      settledAt: row.settledAt,
      systemAmountPaise: sys.amountPaise,
      systemStatus: sys.status,
      paymentId: sys.id,
      line: row.line,
    };

    if (sys.amountPaise !== row.amountPaise) {
      items.push({ bucket: "AMOUNT_MISMATCH", ...base });
    } else if (sys.status === "SUCCESS" || sys.status === "REVERSED") {
      items.push({ bucket: "MATCHED", ...base });
    } else if (sys.status === "PENDING" || sys.status === "INITIATED") {
      items.push({ bucket: "SETTLED_PENDING_HERE", ...base });
    } else {
      rejected.push({ line: row.line, kind: "status_conflict", gatewayRef: row.gatewayRef, reason: `The gateway settled ${row.gatewayRef} but it is recorded here as failed. Check with the gateway: it may need a refund, or a new payment recorded.` });
    }
  }

  // Missing: our SUCCESS payments in the file's window whose ref does not appear anywhere
  // in the file (a ref on a rejected row is not reported twice).
  const window = settlementWindow(valid);
  if (window) {
    const refsInFile = new Set<string>([...valid.map((r) => r.gatewayRef), ...rejected.map((r) => r.gatewayRef ?? "")]);
    const missing = system
      .filter((p) => p.status === "SUCCESS" && p.paidAt)
      .filter((p) => {
        const d = isoDateIST(p.paidAt!);
        return d >= window.from && d <= window.to;
      })
      .filter((p) => !refsInFile.has(p.gatewayRef.toUpperCase()))
      .sort((a, b) => (a.paidAt! < b.paidAt! ? -1 : 1));
    for (const p of missing) {
      items.push({
        bucket: "MISSING_IN_SETTLEMENT",
        gatewayRef: p.gatewayRef,
        fileAmountPaise: null,
        fileStatus: null,
        settledAt: null,
        systemAmountPaise: p.amountPaise,
        systemStatus: p.status,
        paymentId: p.id,
        line: null,
      });
    }
  }

  const buckets = emptyTotals();
  for (const item of items) {
    const t = buckets[item.bucket];
    t.count += 1;
    t.filePaise += item.fileAmountPaise ?? 0;
    t.systemPaise += item.systemAmountPaise ?? 0;
  }
  rejected.sort((a, b) => a.line - b.line);

  const dataRows = rows.filter((r) => Object.values(r).some((v) => (v ?? "").trim() !== "")).length;
  return {
    items,
    rejected,
    totals: { rows: dataRows, valid: valid.length, rejected: rejected.length, window, buckets },
  };
}
