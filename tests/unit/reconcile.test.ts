import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { missingColumns, parseSettledAt, reconcile, settlementWindow, validateRows, type RawRow, type SystemPayment } from "@/lib/domain/reconcile";
import { parseSettlementCsv, reconcileCsv } from "@/lib/domain/settlement-csv";

const row = (gateway_ref: string, amount_inr: string, status = "SUCCESS", settled_at = "2026-09-10T11:00:00+05:30"): RawRow => ({
  gateway_ref,
  amount_inr,
  status,
  settled_at,
});

const pay = (gatewayRef: string, amountPaise: number, status: SystemPayment["status"], paidAt: string | null = "2026-09-09T10:00:00+05:30"): SystemPayment => ({
  id: `pay-${gatewayRef}`,
  gatewayRef,
  amountPaise,
  status,
  paidAt,
});

describe("reconcile: the four buckets", () => {
  const system = [
    pay("MGW1001", 2_500_000, "SUCCESS"),
    pay("MGW1002", 3_000_000, "SUCCESS"),
    pay("MGW1003", 4_000_000, "PENDING", null),
    pay("MGW1004", 1_000_000, "SUCCESS"),
  ];
  const result = reconcile([row("MGW1001", "25000.00"), row("MGW1002", "29500"), row("MGW1003", "40,000")], system);
  const bucketOf = (ref: string) => result.items.find((i) => i.gatewayRef === ref)?.bucket;

  it("matches when ref and amount agree", () => expect(bucketOf("MGW1001")).toBe("MATCHED"));
  it("flags an amount mismatch and keeps both amounts", () => {
    expect(bucketOf("MGW1002")).toBe("AMOUNT_MISMATCH");
    const item = result.items.find((i) => i.gatewayRef === "MGW1002")!;
    expect(item.fileAmountPaise).toBe(2_950_000);
    expect(item.systemAmountPaise).toBe(3_000_000);
  });
  it("finds payments settled by the gateway but pending here", () => expect(bucketOf("MGW1003")).toBe("SETTLED_PENDING_HERE"));
  it("finds our successes missing from the file", () => {
    expect(bucketOf("MGW1004")).toBe("MISSING_IN_SETTLEMENT");
    const item = result.items.find((i) => i.gatewayRef === "MGW1004")!;
    expect(item.fileAmountPaise).toBeNull();
    expect(item.paymentId).toBe("pay-MGW1004");
  });
  it("totals each bucket", () => {
    expect(result.totals.buckets.MATCHED).toEqual({ count: 1, filePaise: 2_500_000, systemPaise: 2_500_000 });
    expect(result.totals.buckets.MISSING_IN_SETTLEMENT).toEqual({ count: 1, filePaise: 0, systemPaise: 1_000_000 });
    expect(result.totals).toMatchObject({ rows: 3, valid: 3, rejected: 0 });
  });
  it("never auto-fixes: the mismatch payment is untouched and not also reported missing", () => {
    expect(result.items.filter((i) => i.gatewayRef === "MGW1002")).toHaveLength(1);
  });
});

describe("reconcile: edge cases", () => {
  it("matches refs case-insensitively and trims whitespace", () => {
    const r = reconcile([row("  mgw1001 ", " 25000 ")], [pay("MGW1001", 2_500_000, "SUCCESS")]);
    expect(r.items[0]?.bucket).toBe("MATCHED");
  });

  it("treats a pending amount mismatch as a mismatch, not as settled-pending", () => {
    const r = reconcile([row("MGW1", "100")], [pay("MGW1", 20_000, "PENDING", null)]);
    expect(r.items[0]?.bucket).toBe("AMOUNT_MISMATCH");
  });

  it("counts a later-reversed payment that settled as matched", () => {
    const r = reconcile([row("MGW1", "100")], [pay("MGW1", 10_000, "REVERSED")]);
    expect(r.items[0]?.bucket).toBe("MATCHED");
  });

  it("rejects a settlement for a payment we recorded as failed (status conflict)", () => {
    const r = reconcile([row("MGW1", "100")], [pay("MGW1", 10_000, "FAILED", null)]);
    expect(r.items).toHaveLength(0);
    expect(r.rejected[0]).toMatchObject({ kind: "status_conflict", gatewayRef: "MGW1", line: 2 });
  });

  it("reports refs we have never seen", () => {
    const r = reconcile([row("MGW9999", "100")], []);
    expect(r.rejected[0]).toMatchObject({ kind: "unknown_ref", gatewayRef: "MGW9999" });
  });

  it("only flags missing payments inside the file's T+1 window", () => {
    const system = [
      pay("MGW_IN", 100, "SUCCESS", "2026-09-05T10:00:00+05:30"),
      pay("MGW_BEFORE", 100, "SUCCESS", "2026-08-01T10:00:00+05:30"),
      pay("MGW_AFTER", 100, "SUCCESS", "2026-09-20T10:00:00+05:30"),
      pay("MGW_LAST", 100, "SUCCESS", "2026-09-09T23:30:00+05:30"), // IST date, not UTC date
    ];
    const rows = [row("X_UNKNOWN", "1", "SUCCESS", "2026-09-01T11:00:00+05:30"), row("X_UNKNOWN2", "1", "SUCCESS", "2026-09-10T11:00:00+05:30")];
    const r = reconcile(rows, system);
    expect(r.totals.window).toEqual({ from: "2026-08-31", to: "2026-09-09" });
    expect(r.items.map((i) => i.gatewayRef).sort()).toEqual(["MGW_IN", "MGW_LAST"]);
  });

  it("does not flag anything missing when no row is valid (an empty or broken file proves nothing)", () => {
    const r = reconcile([row("MGW1", "abc")], [pay("MGW2", 100, "SUCCESS")]);
    expect(r.items).toHaveLength(0);
    expect(r.totals.window).toBeNull();
  });

  it("does not report a ref as missing when it appears on a rejected row", () => {
    const r = reconcile([row("MGW1", "12.345"), row("MGW2", "1")], [pay("MGW1", 100, "SUCCESS"), pay("MGW2", 100, "SUCCESS")]);
    expect(r.items.map((i) => i.bucket)).toEqual(["MATCHED"]);
    expect(r.rejected).toHaveLength(1);
  });
});

describe("validateRows: duplicates and bad rows", () => {
  it("keeps one of identical duplicates and rejects the rest", () => {
    const { valid, rejected } = validateRows([row("MGW1", "100"), row("MGW1", "100.00"), row("MGW1", "100")]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.line).toBe(2);
    expect(rejected.map((r) => [r.line, r.kind])).toEqual([
      [3, "duplicate"],
      [4, "duplicate"],
    ]);
  });

  it("rejects every copy of a duplicate ref whose amounts conflict", () => {
    const { valid, rejected } = validateRows([row("MGW1", "100"), row("MGW2", "5"), row("MGW1", "150")]);
    expect(valid.map((v) => v.gatewayRef)).toEqual(["MGW2"]);
    expect(rejected.filter((r) => r.gatewayRef === "MGW1")).toHaveLength(2);
    expect(rejected[0]?.reason).toContain("different amounts");
  });

  it.each([
    [row("", "100"), "gateway_ref is empty"],
    [row("MGW 1", "100"), "unexpected characters"],
    [row("MGW1", ""), "Enter an amount"],
    [row("MGW1", "-100"), "negative"],
    [row("MGW1", "10.555"), "2 decimal"],
    [row("MGW1", "1e3"), "amount_inr"],
    [row("MGW1", "0"), "zero"],
    [row("MGW1", "100", ""), "status is empty"],
    [row("MGW1", "100", "MAYBE"), "Unknown status"],
    [row("MGW1", "100", "SUCCESS", "yesterday"), "not a valid date"],
    [row("MGW1", "100", "SUCCESS", "2026-02-30"), "not a valid date"],
    [row("MGW1", "100", "SUCCESS", "30/09/2026"), "not a valid date"],
  ])("rejects a bad row: %j", (raw, message) => {
    const { valid, rejected } = validateRows([raw]);
    expect(valid).toHaveLength(0);
    expect(rejected[0]?.kind).toBe("invalid");
    expect(rejected[0]?.reason).toContain(message);
  });

  it("ignores non-settlement statuses such as FAILED and REFUNDED", () => {
    const { valid, rejected } = validateRows([row("MGW1", "100", "failed"), row("MGW2", "100", "Refunded")]);
    expect(valid).toHaveLength(0);
    expect(rejected.map((r) => r.kind)).toEqual(["ignored", "ignored"]);
  });

  it("accepts SETTLED / CAPTURED and different amount formats", () => {
    const { valid } = validateRows([row("A1234", "1,25,000.50", "settled"), row("B1234", "₹500", "CAPTURED"), row("C1234", "125,000")]);
    expect(valid.map((v) => v.amountPaise)).toEqual([12_500_050, 50_000, 12_500_000]);
  });

  it("skips blank lines without rejecting them", () => {
    const { valid, rejected } = validateRows([row("MGW1", "100"), { gateway_ref: "", amount_inr: "", status: "", settled_at: "" }]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
});

describe("parseSettledAt", () => {
  it("reads ISO with offset, UTC, local datetime (as IST) and bare dates (as IST)", () => {
    expect(parseSettledAt("2026-09-10T11:00:00+05:30")).toEqual({ iso: "2026-09-10T05:30:00.000Z", date: "2026-09-10" });
    expect(parseSettledAt("2026-09-09T20:00:00Z")?.date).toBe("2026-09-10"); // 01:30 IST next day
    expect(parseSettledAt("2026-09-10 11:00")?.iso).toBe("2026-09-10T05:30:00.000Z");
    expect(parseSettledAt("2026-09-10")?.date).toBe("2026-09-10");
  });
  it("rejects impossible or unsupported dates", () => {
    expect(parseSettledAt("2026-13-01")).toBeNull();
    expect(parseSettledAt("10-09-2026")).toBeNull();
    expect(parseSettledAt("")).toBeNull();
  });
});

describe("settlementWindow", () => {
  it("is T+1: settled dates shifted back a day", () => {
    const { valid } = validateRows([row("A1111", "1", "SUCCESS", "2026-08-11"), row("B1111", "1", "SUCCESS", "2026-09-22")]);
    expect(settlementWindow(valid)).toEqual({ from: "2026-08-10", to: "2026-09-21" });
  });
});

describe("CSV parsing", () => {
  it("requires the four columns, in any order and case", () => {
    expect(missingColumns(["Status", "GATEWAY_REF", "settled_at", "amount_inr"])).toEqual([]);
    expect(missingColumns(["gateway_ref", "amount"])).toEqual(["amount_inr", "status", "settled_at"]);
    const r = parseSettlementCsv("ref,amount\nA,1\n");
    expect(r).toMatchObject({ ok: false, code: "missing_columns" });
  });

  it("rejects an empty file", () => {
    expect(parseSettlementCsv("")).toMatchObject({ ok: false, code: "empty_file" });
    expect(parseSettlementCsv("﻿  \n")).toMatchObject({ ok: false, code: "empty_file" });
  });

  it("keeps line numbers aligned across blank lines and rejects rows with wrong field counts", () => {
    const csv = [
      "gateway_ref,amount_inr,status,settled_at",
      "MGW1,100.00,SUCCESS,2026-09-10",
      "",
      "MGW2,100.00,SUCCESS",
      "MGW3,100.00,SUCCESS,2026-09-10,extra",
      "MGW4,abc,SUCCESS,2026-09-10",
      "",
    ].join("\n");
    const result = reconcileCsv(csv, [pay("MGW1", 10_000, "SUCCESS")]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.items.map((i) => [i.gatewayRef, i.bucket])).toEqual([["MGW1", "MATCHED"]]);
    expect(result.rejected.map((r) => [r.line, r.kind, r.gatewayRef])).toEqual([
      [4, "invalid", "MGW2"],
      [5, "invalid", "MGW3"],
      [6, "invalid", "MGW4"],
    ]);
    expect(result.totals).toMatchObject({ rows: 4, valid: 1, rejected: 3 });
  });

  it("handles quoted amounts with commas, CRLF line endings and a BOM", () => {
    const csv = '﻿gateway_ref,amount_inr,status,settled_at\r\nMGW1,"1,25,000.00",SUCCESS,2026-09-10\r\n';
    const result = reconcileCsv(csv, [pay("MGW1", 12_500_000, "SUCCESS")]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.items[0]?.bucket).toBe("MATCHED");
  });

  it("the shipped sample file parses cleanly with no rejected rows", () => {
    const text = readFileSync(join(__dirname, "../../public/samples/settlement_sample.csv"), "utf8");
    const parsed = parseSettlementCsv(text);
    if (!parsed.ok) throw new Error(parsed.message);
    const { valid, rejected } = validateRows(parsed.rows);
    expect(rejected).toEqual([]);
    expect(valid.length).toBeGreaterThan(30);
  });
});
