// Allocation preview for the payment drawer. Mirrors _allocate_credit() in
// 002_functions.sql: oldest due date first, fee head order breaks ties. The database
// does the real allocation; this only tells the user what will happen before they submit.

import { formatINR } from "@/lib/money";

export type OpenInstallment = {
  installmentId: string;
  label: string;
  dueDate: string; // YYYY-MM-DD
  feeHeadOrder: number;
  term: number;
  remainingPaise: number;
};

export type AllocationLine = {
  installmentId: string;
  label: string;
  amountPaise: number;
  clears: boolean; // true when this payment pays the installment off
  remainingBeforePaise: number;
};

export type AllocationPreview = { lines: AllocationLine[]; advancePaise: number };

export function sortForAllocation<T extends Pick<OpenInstallment, "dueDate" | "feeHeadOrder" | "term" | "installmentId">>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.feeHeadOrder - b.feeHeadOrder ||
      a.term - b.term ||
      a.installmentId.localeCompare(b.installmentId),
  );
}

export function previewAllocation(installments: OpenInstallment[], amountPaise: number): AllocationPreview {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { lines: [], advancePaise: 0 };
  let free = amountPaise;
  const lines: AllocationLine[] = [];
  for (const inst of sortForAllocation(installments)) {
    if (free <= 0) break;
    if (inst.remainingPaise <= 0) continue;
    const take = Math.min(free, inst.remainingPaise);
    lines.push({
      installmentId: inst.installmentId,
      label: inst.label,
      amountPaise: take,
      clears: take === inst.remainingPaise,
      remainingBeforePaise: inst.remainingPaise,
    });
    free -= take;
  }
  return { lines, advancePaise: free };
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "₹25,000 will clear Tuition Term 1 (₹18,000) and part of Hostel Term 1 (₹7,000)." */
export function describeAllocation(preview: AllocationPreview, amountPaise: number): string {
  const money = (p: number) => formatINR(p, { paise: "auto" });
  const { lines, advancePaise } = preview;
  if (lines.length === 0) {
    return advancePaise > 0 ? `${money(amountPaise)} will be held as an advance.` : "";
  }
  const only = lines[0]!;
  if (lines.length === 1 && !only.clears) {
    return `${money(amountPaise)} will pay part of ${only.label}; ${money(only.remainingBeforePaise - only.amountPaise)} will still be due.`;
  }
  const parts = lines.map((l) => (l.clears ? `${l.label} (${money(l.amountPaise)})` : `part of ${l.label} (${money(l.amountPaise)})`));
  if (advancePaise > 0) parts.push(`leave ${money(advancePaise)} as advance`);
  return `${money(amountPaise)} will clear ${joinList(parts)}.`;
}
