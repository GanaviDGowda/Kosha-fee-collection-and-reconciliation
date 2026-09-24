// Runs against the database in .env.local through the same path the API uses
// (supabase-js rpc with the service role). Resets demo data before and after.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = class {} as any;
}

const hasDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.DATABASE_URL);
if (!hasDb) console.warn("Skipping integration tests: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local");

let sb: SupabaseClient;

type Payment = { id: string; status: string; receipt_no: string | null; replayed?: boolean; amount_paise: number };
type RpcError = { message: string; hint: string | null; code: string };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { hint: error.hint, code: error.code });
  return data as T;
}

async function rpcError(fn: string, args: Record<string, unknown>): Promise<RpcError> {
  const { error } = await sb.rpc(fn, args);
  if (!error) throw new Error(`${fn} was expected to fail`);
  return { message: error.message, hint: error.hint, code: error.code };
}

async function studentId(roll: string): Promise<string> {
  const { data, error } = await sb.from("students").select("id").eq("roll_no", roll).single();
  if (error) throw error;
  return data.id as string;
}

async function installment(student: string, label: string) {
  const { data, error } = await sb.from("v_installment_status").select("*").eq("student_id", student).eq("label", label).single();
  if (error) throw error;
  return data as { installment_id: string; demand_paise: number; paid_paise: number; concession_paise: number; remaining_paise: number; status: string };
}

async function ledgerFor(paymentId: string) {
  const { data, error } = await sb.from("ledger_entries").select("type, amount_paise").eq("ref_id", paymentId);
  if (error) throw error;
  return data as { type: string; amount_paise: number }[];
}

async function balance(student: string) {
  const [{ data: view }, { data: ledger }] = await Promise.all([
    sb.from("v_student_balances").select("balance_paise").eq("student_id", student).single(),
    sb.from("ledger_entries").select("amount_paise").eq("student_id", student),
  ]);
  return { view: Number(view!.balance_paise), ledger: (ledger ?? []).reduce((s, e) => s + Number(e.amount_paise), 0) };
}

const cash = (student: string, amountPaise: number, key = randomUUID()) =>
  rpc<Payment>("record_payment", {
    p_student_id: student,
    p_amount_paise: amountPaise,
    p_mode: "CASH",
    p_idempotency_key: key,
    p_simulate: null,
    p_actor: "accountant",
  });

describe.runIf(hasDb)("money functions against the database", () => {
  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    sb = createClient(url, key, { auth: { persistSession: false } });
    await rpc("reset_demo", { p_actor: "admin" });
  });

  afterAll(async () => {
    await rpc("reset_demo", { p_actor: "admin" });
  });

  describe("idempotency", () => {
    it("the same idempotency key twice creates one payment", async () => {
      const student = await studentId("BCOM26-001");
      const key = randomUUID();
      const first = await cash(student, 500_000, key);
      const second = await cash(student, 500_000, key);
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.id).toBe(first.id);
      const { count } = await sb.from("payments").select("id", { count: "exact", head: true }).eq("idempotency_key", key);
      expect(count).toBe(1);
      expect(await ledgerFor(first.id)).toHaveLength(1);
    });

    it("a double submit racing in parallel still creates one payment", async () => {
      const student = await studentId("BCOM26-001");
      const key = randomUUID();
      const results = await Promise.all([cash(student, 100_000, key), cash(student, 100_000, key), cash(student, 100_000, key)]);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(results.filter((r) => r.replayed === false)).toHaveLength(1);
    });

    it("reusing a key with a different amount is refused", async () => {
      const student = await studentId("BCOM26-001");
      const key = randomUUID();
      await cash(student, 100_000, key);
      const err = await rpcError("record_payment", {
        p_student_id: student, p_amount_paise: 200_000, p_mode: "CASH", p_idempotency_key: key, p_simulate: null, p_actor: "accountant",
      });
      expect(err.hint).toBe("idempotency_conflict");
    });
  });

  describe("gateway timeout", () => {
    it("timeout then confirm writes exactly one ledger entry", async () => {
      const student = await studentId("BCA26-002");
      const p = await rpc<Payment>("record_payment", {
        p_student_id: student, p_amount_paise: 1_000_000, p_mode: "UPI", p_idempotency_key: randomUUID(), p_simulate: "TIMEOUT", p_actor: "student",
      });
      expect(p.status).toBe("PENDING");
      expect(p.receipt_no).toBeNull();
      expect(await ledgerFor(p.id)).toHaveLength(0);

      const confirmed = await rpc<Payment>("confirm_payment", { p_payment_id: p.id, p_actor: "accountant", p_note: "Check status" });
      expect(confirmed.status).toBe("SUCCESS");
      expect(confirmed.receipt_no).toMatch(/^KSH\/2026-27\/\d{6}$/);

      const again = await rpcError("confirm_payment", { p_payment_id: p.id, p_actor: "accountant", p_note: null });
      expect(again.hint).toBe("payment_already_success");
      expect(await ledgerFor(p.id)).toEqual([{ type: "PAYMENT", amount_paise: -1_000_000 }]);

      const { data: events } = await sb.from("payment_events").select("from_status, to_status").eq("payment_id", p.id).order("id");
      expect(events).toEqual([
        { from_status: null, to_status: "INITIATED" },
        { from_status: "INITIATED", to_status: "PENDING" },
        { from_status: "PENDING", to_status: "SUCCESS" },
      ]);
    });

    it("confirm racing itself (check status vs reconciliation) posts one entry", async () => {
      const student = await studentId("BCA26-002");
      const p = await rpc<Payment>("record_payment", {
        p_student_id: student, p_amount_paise: 50_000, p_mode: "CARD", p_idempotency_key: randomUUID(), p_simulate: "TIMEOUT", p_actor: "student",
      });
      const outcomes = await Promise.allSettled([
        rpc("confirm_payment", { p_payment_id: p.id, p_actor: "accountant", p_note: "A" }),
        rpc("confirm_payment", { p_payment_id: p.id, p_actor: "admin", p_note: "B" }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await ledgerFor(p.id)).toHaveLength(1);
    });

    it("a failed online payment writes no ledger entry and cannot be confirmed later", async () => {
      const student = await studentId("BCA26-002");
      const p = await rpc<Payment>("record_payment", {
        p_student_id: student, p_amount_paise: 50_000, p_mode: "UPI", p_idempotency_key: randomUUID(), p_simulate: "FAIL", p_actor: "student",
      });
      expect(p.status).toBe("FAILED");
      expect(await ledgerFor(p.id)).toHaveLength(0);
      expect((await rpcError("confirm_payment", { p_payment_id: p.id, p_actor: "admin", p_note: null })).hint).toBe("payment_failed");
    });
  });

  describe("reversal", () => {
    it("reversing a payment reopens the installment it paid", async () => {
      const student = await studentId("BCOM26-001");
      const tuitionBefore = await installment(student, "Tuition Term 2");
      // Clear everything due before Tuition Term 2 so the next payment lands on it.
      const { data: open } = await sb.from("v_installment_status").select("remaining_paise, due_date, label").eq("student_id", student).gt("remaining_paise", 0);
      const before = (open ?? []).filter((i) => i.due_date < "2027-01-15").reduce((s, i) => s + Number(i.remaining_paise), 0);
      if (before > 0) await cash(student, before);

      const p = await cash(student, tuitionBefore.remaining_paise);
      expect((await installment(student, "Tuition Term 2")).status).toBe("PAID");

      const reversed = await rpc<Payment>("reverse_payment", { p_payment_id: p.id, p_reason: "Counterfeit notes found in the deposit", p_actor: "admin" });
      expect(reversed.status).toBe("REVERSED");

      const after = await installment(student, "Tuition Term 2");
      expect(after.remaining_paise).toBe(tuitionBefore.remaining_paise);
      expect(after.status).toBe("DUE");
      expect((await ledgerFor(p.id)).map((e) => e.type).sort()).toEqual(["PAYMENT", "REVERSAL"]);

      // allocation rows are kept (append-only), they just stop counting
      const { count } = await sb.from("payment_allocations").select("id", { count: "exact", head: true }).eq("payment_id", p.id);
      expect(count).toBeGreaterThan(0);

      const b = await balance(student);
      expect(b.view).toBe(b.ledger);
    });

    it("cannot reverse twice, and only admin can reverse", async () => {
      const student = await studentId("BCOM26-001");
      const p = await cash(student, 10_000);
      expect((await rpcError("reverse_payment", { p_payment_id: p.id, p_reason: "Chargeback", p_actor: "accountant" })).hint).toBe("forbidden");
      await rpc("reverse_payment", { p_payment_id: p.id, p_reason: "Chargeback raised", p_actor: "admin" });
      const err = await rpcError("reverse_payment", { p_payment_id: p.id, p_reason: "Chargeback raised", p_actor: "admin" });
      expect(err.hint).toBe("payment_already_reversed");
      expect(err.message).toBe("This payment was already reversed.");
    });
  });

  describe("concessions", () => {
    it("a concession above the remaining demand is rejected; exactly the remainder is accepted", async () => {
      const student = await studentId("CSE24-001"); // Rohan: hostel partly paid
      const hostel = await installment(student, "Hostel Term 1");
      expect(hostel.paid_paise).toBeGreaterThan(0);
      expect(hostel.remaining_paise).toBeGreaterThan(0);

      const tooMuch = await rpcError("apply_concession", {
        p_installment_id: hostel.installment_id, p_amount_paise: hostel.remaining_paise + 1, p_reason: "Hardship", p_approved_by: "Principal", p_actor: "admin",
      });
      expect(tooMuch.hint).toBe("concession_exceeds_remaining");

      await rpc("apply_concession", {
        p_installment_id: hostel.installment_id, p_amount_paise: hostel.remaining_paise, p_reason: "Hardship waiver", p_approved_by: "Principal", p_actor: "admin",
      });
      const after = await installment(student, "Hostel Term 1");
      expect(after.remaining_paise).toBe(0);
      expect(after.status).toBe("PAID");

      const again = await rpcError("apply_concession", {
        p_installment_id: hostel.installment_id, p_amount_paise: 1, p_reason: "More", p_approved_by: "Principal", p_actor: "admin",
      });
      expect(again.hint).toBe("concession_exceeds_remaining");
    });

    it("only admin can apply a concession", async () => {
      const student = await studentId("CSE24-001");
      const exam = await installment(student, "Exam Term 2");
      const err = await rpcError("apply_concession", {
        p_installment_id: exam.installment_id, p_amount_paise: 100, p_reason: "Test", p_approved_by: "Dean", p_actor: "accountant",
      });
      expect(err.hint).toBe("forbidden");
    });
  });

  describe("concurrency", () => {
    it("parallel payments on one student allocate correctly", async () => {
      const student = await studentId("CSE24-003"); // Arjun: tuition reopened after reversal
      const { data: before } = await sb.from("v_installment_status").select("installment_id, remaining_paise").eq("student_id", student);
      const openBefore = (before ?? []).reduce((s, i) => s + Number(i.remaining_paise), 0);

      const amounts = [1_000_000, 2_500_000, 700_000, 1_300_000, 3_100_000, 900_000];
      const payments = await Promise.all(amounts.map((a) => cash(student, a)));
      const total = amounts.reduce((s, a) => s + a, 0);

      expect(new Set(payments.map((p) => p.receipt_no)).size).toBe(amounts.length);

      const { data: allocs } = await sb.from("payment_allocations").select("payment_id, amount_paise").in("payment_id", payments.map((p) => p.id));
      const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.amount_paise), 0);
      expect(allocated).toBe(Math.min(total, openBefore));

      // each payment allocated at most its own amount
      for (const p of payments) {
        const mine = (allocs ?? []).filter((a) => a.payment_id === p.id).reduce((s, a) => s + Number(a.amount_paise), 0);
        expect(mine).toBeLessThanOrEqual(Number(p.amount_paise));
      }

      // no installment went over its demand
      const { data: after } = await sb.from("v_installment_status").select("remaining_paise").eq("student_id", student);
      expect((after ?? []).every((i) => Number(i.remaining_paise) >= 0)).toBe(true);
      const openAfter = (after ?? []).reduce((s, i) => s + Number(i.remaining_paise), 0);
      expect(openAfter).toBe(openBefore - allocated);

      const b = await balance(student);
      expect(b.view).toBe(b.ledger);
    });
  });

  describe("database guarantees", () => {
    it("the API role cannot write to the ledger directly", async () => {
      const { error } = await sb.from("ledger_entries").insert({ student_id: await studentId("BCOM26-001"), type: "PAYMENT", amount_paise: -1, ref_table: "payments", ref_id: randomUUID() });
      expect(error?.code).toBe("42501");
      const upd = await sb.from("payments").update({ status: "SUCCESS" }).eq("status", "FAILED");
      expect(upd.error?.code).toBe("42501");
    });

    it("verify-ledger.sql passes after all of the above", async () => {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      const notices: string[] = [];
      client.on("notice", (n) => notices.push(n.message ?? ""));
      await client.connect();
      try {
        await client.query("begin");
        await client.query(readFileSync(join(root, "scripts/verify-ledger.sql"), "utf8"));
        await client.query("rollback");
      } finally {
        await client.end();
      }
      expect(notices.filter((n) => n.startsWith("[FAIL]"))).toEqual([]);
      expect(notices).toContain("All ledger checks passed.");
    });
  });

});
