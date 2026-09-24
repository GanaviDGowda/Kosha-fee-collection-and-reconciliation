import { cn } from "@/lib/cn";

export type Tone = "credit" | "pending" | "debit" | "reversed" | "accent" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  credit: "tint-credit",
  pending: "tint-pending",
  debit: "tint-debit",
  reversed: "tint-reversed",
  accent: "tint-accent",
  neutral: "tint-neutral",
};

const DOT_CLASS: Record<Tone, string> = {
  credit: "bg-credit",
  pending: "bg-pending",
  debit: "bg-debit",
  reversed: "bg-reversed",
  accent: "bg-accent",
  neutral: "bg-muted",
};

/** Status is always a dot plus a text label, never colour alone. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium", TONE_CLASS[tone], className)}>
      <span className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} aria-hidden />
      {children}
    </span>
  );
}

// Mappings from domain statuses to tone + label, shared by every screen.
export const PAYMENT_TONE = {
  INITIATED: ["neutral", "Initiated"],
  PENDING: ["pending", "Pending"],
  SUCCESS: ["credit", "Success"],
  FAILED: ["debit", "Failed"],
  REVERSED: ["reversed", "Reversed"],
} as const satisfies Record<string, readonly [Tone, string]>;

export const STUDENT_TONE = {
  OVERDUE: ["debit", "Overdue"],
  DUE: ["pending", "Due"],
  PAID: ["credit", "Paid"],
  ADVANCE: ["accent", "Advance"],
} as const satisfies Record<string, readonly [Tone, string]>;

export const INSTALLMENT_TONE = {
  OVERDUE: ["debit", "Overdue"],
  DUE: ["neutral", "Due"],
  PARTIAL: ["pending", "Partly paid"],
  PAID: ["credit", "Paid"],
} as const satisfies Record<string, readonly [Tone, string]>;

export function MappedBadge<K extends string>({ map, value }: { map: Record<K, readonly [Tone, string]>; value: K }) {
  const [tone, label] = map[value];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
