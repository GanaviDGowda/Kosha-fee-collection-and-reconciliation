import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAYMENT_STATUSES,
  TRANSITIONS,
  IllegalTransitionError,
  assertTransition,
  availableActions,
  canTransition,
  isOnlineMode,
  isTerminal,
  type PaymentStatus,
} from "@/lib/domain/payment-state";

const LEGAL: [PaymentStatus, PaymentStatus][] = [
  ["INITIATED", "PENDING"],
  ["INITIATED", "SUCCESS"],
  ["PENDING", "SUCCESS"],
  ["PENDING", "FAILED"],
  ["SUCCESS", "REVERSED"],
];

describe("payment state machine", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  const illegal = PAYMENT_STATUSES.flatMap((from) => PAYMENT_STATUSES.map((to) => [from, to] as [PaymentStatus, PaymentStatus])).filter(
    ([from, to]) => !LEGAL.some(([f, t]) => f === from && t === to),
  );

  it.each(illegal)("rejects %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
  });

  it("has exactly the five legal transitions", () => {
    expect(illegal).toHaveLength(25 - 5);
  });

  it("treats FAILED and REVERSED as terminal", () => {
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("REVERSED")).toBe(true);
    expect(isTerminal("SUCCESS")).toBe(false);
    expect(isTerminal("PENDING")).toBe(false);
  });

  it("key illegal moves a real system must block", () => {
    expect(canTransition("FAILED", "SUCCESS")).toBe(false); // a failed payment can't be revived
    expect(canTransition("REVERSED", "SUCCESS")).toBe(false); // no un-reversing
    expect(canTransition("SUCCESS", "FAILED")).toBe(false); // success is reversed, never failed
    expect(canTransition("PENDING", "REVERSED")).toBe(false); // can't reverse what never settled
    expect(canTransition("SUCCESS", "SUCCESS")).toBe(false); // double confirm
  });

  it("offers the right actions per status", () => {
    expect(availableActions("PENDING")).toEqual({ checkStatus: true, fail: true, reverse: false, receipt: false });
    expect(availableActions("SUCCESS")).toEqual({ checkStatus: false, fail: false, reverse: true, receipt: true });
    expect(availableActions("REVERSED")).toEqual({ checkStatus: false, fail: false, reverse: false, receipt: true });
    expect(availableActions("FAILED")).toEqual({ checkStatus: false, fail: false, reverse: false, receipt: false });
  });

  it("knows which modes go through the gateway", () => {
    expect(isOnlineMode("UPI")).toBe(true);
    expect(isOnlineMode("CARD")).toBe(true);
    expect(isOnlineMode("CASH")).toBe(false);
    expect(isOnlineMode("BANK_TRANSFER")).toBe(false);
  });
});

describe("TypeScript transitions match the database", () => {
  it("equals the payment_transitions rows inserted by 001_schema.sql", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/001_schema.sql"), "utf8");
    const block = sql.slice(sql.indexOf("insert into payment_transitions"), sql.indexOf(";", sql.indexOf("insert into payment_transitions")));
    const fromSql = [...block.matchAll(/\('([A-Z]+)',\s*'([A-Z]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`).sort();
    const fromTs = Object.entries(TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`))
      .sort();
    expect(fromSql.length).toBeGreaterThan(0);
    expect(fromTs).toEqual(fromSql);
  });
});
