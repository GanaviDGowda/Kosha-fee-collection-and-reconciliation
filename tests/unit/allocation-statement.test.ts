import { describe, expect, it } from "vitest";
import { describeAllocation, previewAllocation, type OpenInstallment } from "@/lib/domain/allocation";
import { buildStatement, type LedgerEntry, type PaymentRef } from "@/lib/domain/statement";
import { describeAudit } from "@/lib/domain/audit-text";
import { fromDbError } from "@/lib/api/errors";

const inst = (label: string, dueDate: string, remainingPaise: number, feeHeadOrder = 1, term = 1): OpenInstallment => ({
  installmentId: label,
  label,
  dueDate,
  feeHeadOrder,
  term,
  remainingPaise,
});

describe("previewAllocation", () => {
  const open = [
    inst("Hostel Term 1", "2026-08-15", 4_500_000, 2),
    inst("Exam Term 1", "2026-10-15", 350_000, 3),
    inst("Tuition Term 1", "2026-08-15", 1_800_000, 1),
  ];

  it("clears oldest due date first, fee head order breaking ties", () => {
    const p = previewAllocation(open, 2_500_000);
    expect(p.lines.map((l) => [l.label, l.amountPaise, l.clears])).toEqual([
      ["Tuition Term 1", 1_800_000, true],
      ["Hostel Term 1", 700_000, false],
    ]);
    expect(p.advancePaise).toBe(0);
    expect(describeAllocation(p, 2_500_000)).toBe("₹25,000 will clear Tuition Term 1 (₹18,000) and part of Hostel Term 1 (₹7,000).");
  });

  it("keeps an overpayment as advance instead of rejecting it", () => {
    const p = previewAllocation(open, 7_000_000);
    expect(p.lines.every((l) => l.clears)).toBe(true);
    expect(p.advancePaise).toBe(7_000_000 - 1_800_000 - 4_500_000 - 350_000);
    expect(describeAllocation(p, 7_000_000)).toMatch(/and leave ₹3,500 as advance\.$/);
  });

  it("describes a payment that only pays part of one installment", () => {
    expect(describeAllocation(previewAllocation(open, 500_000), 500_000)).toBe("₹5,000 will pay part of Tuition Term 1; ₹13,000 will still be due.");
  });

  it("holds everything as advance when nothing is open", () => {
    const p = previewAllocation([inst("Tuition Term 1", "2026-08-15", 0)], 100_000);
    expect(p).toEqual({ lines: [], advancePaise: 100_000 });
    expect(describeAllocation(p, 100_000)).toBe("₹1,000 will be held as an advance.");
  });

  it("ignores zero, negative and fractional amounts", () => {
    expect(previewAllocation(open, 0).lines).toEqual([]);
    expect(previewAllocation(open, -5).lines).toEqual([]);
    expect(previewAllocation(open, 10.5).lines).toEqual([]);
  });
});

describe("buildStatement", () => {
  const entries: LedgerEntry[] = [
    { id: 1, type: "DEMAND", amountPaise: 6_250_000, refTable: "installments", refId: "i1", note: "Fee demand: Tuition Term 1", createdAt: "2026-07-01T04:30:00Z" },
    { id: 2, type: "PAYMENT", amountPaise: -6_250_000, refTable: "payments", refId: "p1", note: null, createdAt: "2026-08-11T05:00:00Z" },
    { id: 4, type: "REVERSAL", amountPaise: 6_250_000, refTable: "payments", refId: "p1", note: null, createdAt: "2026-08-18T06:00:00Z" },
    { id: 3, type: "CONCESSION", amountPaise: -500_000, refTable: "concessions", refId: "c1", note: null, createdAt: "2026-08-12T05:00:00Z" },
  ];
  const payments = new Map<string, PaymentRef>([["p1", { id: "p1", receiptNo: "KSH/2026-27/000005", gatewayRef: null, mode: "BANK_TRANSFER", status: "REVERSED", reversalReason: "NEFT returned" }]]);
  const concessions = new Map([["c1", { id: "c1", reason: "Merit", approvedBy: "Dean", label: "Tuition Term 1" }]]);
  const rows = buildStatement(entries, payments, concessions);

  it("orders by date and keeps a running balance", () => {
    expect(rows.map((r) => r.entryId)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.balancePaise)).toEqual([6_250_000, 0, -500_000, 5_750_000]);
  });

  it("puts demand and reversal in debit, payment and concession in credit", () => {
    expect(rows.map((r) => [r.debitPaise, r.creditPaise])).toEqual([
      [6_250_000, null],
      [null, 6_250_000],
      [null, 500_000],
      [6_250_000, null],
    ]);
  });

  it("mutes a reversed payment and links it to its reversal both ways", () => {
    const payment = rows.find((r) => r.type === "PAYMENT")!;
    const reversal = rows.find((r) => r.type === "REVERSAL")!;
    expect(payment.muted).toBe(true);
    expect(payment.linkedEntryId).toBe(4);
    expect(reversal.linkedEntryId).toBe(2);
    expect(reversal.description).toBe("Payment reversed: NEFT returned");
    expect(reversal.reference).toBe("KSH/2026-27/000005");
  });

  it("reads concessions as credits with the reason and approver", () => {
    const c = rows.find((r) => r.type === "CONCESSION")!;
    expect(c.description).toBe("Concession on Tuition Term 1: Merit");
    expect(c.detail).toBe("Approved by Dean");
    expect(c.reference).toBeNull();
  });
});

describe("describeAudit", () => {
  it("writes a readable reversal line", () => {
    expect(
      describeAudit(
        { actor: "admin", action: "payment.reversed", entity: "payment", entityId: "x", details: { receipt_no: "KSH/2026-27/000118", amount_paise: 6_250_000, reason: "cheque bounced" } },
        "Arjun Mehta",
      ),
    ).toBe("Admin reversed payment KSH/2026-27/000118 (₹62,500) for Arjun Mehta: cheque bounced");
  });

  it("falls back gracefully for unknown actions", () => {
    expect(describeAudit({ actor: "system", action: "x.y", entity: "thing", entityId: null, details: {} })).toBe("System: x.y on thing");
  });
});

describe("fromDbError", () => {
  it("maps function hints to status and field", () => {
    const e = fromDbError({ code: "P0001", message: "This payment was already reversed.", hint: "payment_already_reversed" });
    expect([e.status, e.code, e.message]).toEqual([409, "payment_already_reversed", "This payment was already reversed."]);
    expect(fromDbError({ code: "P0001", message: "m", hint: "concession_exceeds_remaining" }).field).toBe("amountPaise");
    expect(fromDbError({ code: "P0001", message: "m", hint: "forbidden" }).status).toBe(403);
  });

  it("maps raw Postgres errors without leaking internals", () => {
    expect(fromDbError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }).status).toBe(409);
    const unknown = fromDbError({ code: "XX000", message: "internal detail" });
    expect(unknown.status).toBe(500);
    expect(unknown.message).not.toContain("internal detail");
  });
});
