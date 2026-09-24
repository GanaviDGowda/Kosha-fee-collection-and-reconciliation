// The plain sentence under a student's balance, e.g.
// "Next installment of ₹18,000 due on 15 Oct 2026" or "Advance of ₹2,500".

import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export type BalanceFacts = {
  balancePaise: number;
  overduePaise: number;
  oldestOverdueDate: string | null;
  nextDueDate: string | null;
  nextDuePaise: number;
};

/** `sentence` carries the tone (e.g. red for overdue); `followUp` is secondary information. */
export type BalanceSummary = { label: string; sentence: string; followUp?: string; tone: "debit" | "credit" | "accent" | "ink" };

const money = (p: number) => formatINR(p, { paise: "auto" });

export function describeBalance(f: BalanceFacts): BalanceSummary {
  const next = f.nextDueDate && f.nextDuePaise > 0 ? `Next installment of ${money(f.nextDuePaise)} due on ${formatDate(f.nextDueDate)}.` : null;

  if (f.balancePaise < 0) {
    return { label: "Advance", sentence: `Paid ${money(-f.balancePaise)} more than billed. It will be used against future fees.`, tone: "accent" };
  }
  if (f.balancePaise === 0) {
    return { label: "Balance", sentence: "All fees for 2026-27 are paid.", tone: "credit" };
  }
  if (f.overduePaise > 0) {
    const since = f.oldestOverdueDate ? ` since ${formatDate(f.oldestOverdueDate)}` : "";
    return { label: "Balance due", sentence: `${money(f.overduePaise)} overdue${since}.`, ...(next ? { followUp: next } : {}), tone: "debit" };
  }
  return { label: "Balance due", sentence: next ?? "Nothing is overdue.", tone: "ink" };
}
