// zod schemas for every API input. The database checks the same rules again.

import { z } from "zod";
import { ONLINE_MODES, PAYMENT_MODES, PAYMENT_STATUSES, SIMULATED_OUTCOMES } from "@/lib/domain/payment-state";

export const MAX_PAYMENT_PAISE = 100_000_000; // ₹10,00,000, same limit as record_payment()

const paise = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number of paise.`, required_error: `${label} is required.` })
    .int(`${label} must be whole paise.`)
    .positive(`${label} must be greater than zero.`);

const text = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const uuid = z.string().uuid("That id is not valid.");

export const createPaymentSchema = z
  .object({
    studentId: uuid,
    amountPaise: paise("Amount").max(MAX_PAYMENT_PAISE, "Amount is above the ₹10,00,000 limit for one payment."),
    mode: z.enum(PAYMENT_MODES, { errorMap: () => ({ message: "Choose cash, UPI, card or bank transfer." }) }),
    idempotencyKey: z.string().uuid("Missing form key. Reopen the payment form."),
    simulate: z.enum(SIMULATED_OUTCOMES).nullish(),
    reference: z.string().trim().max(120, "Reference must be at most 120 characters.").nullish(),
  })
  .superRefine((v, ctx) => {
    const online = ONLINE_MODES.includes(v.mode);
    if (online && !v.simulate) {
      ctx.addIssue({ code: "custom", path: ["simulate"], message: "Choose a simulated gateway outcome." });
    }
    if (!online && v.simulate) {
      ctx.addIssue({ code: "custom", path: ["simulate"], message: "Gateway simulation only applies to UPI and card." });
    }
  });

export const confirmSchema = z.object({ note: z.string().trim().max(200).nullish() });
export const failSchema = z.object({ reason: text("Reason", 3, 300) });
export const reverseSchema = z.object({ reason: text("Reason", 5, 300) });

export const concessionSchema = z.object({
  installmentId: uuid,
  amountPaise: paise("Concession amount"),
  reason: text("Reason", 3, 300),
  approvedBy: text("Approved by", 2, 120),
});

export const resolveSchema = z.object({
  resolution: z.enum(["MARKED_PAID", "REVIEWED"], { errorMap: () => ({ message: "Choose mark as paid or reviewed." }) }),
  note: z.string().trim().max(500).nullish(),
});

export const STUDENT_STATUSES = ["OVERDUE", "DUE", "PAID", "ADVANCE"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const studentsQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  course: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, "Unknown course.")
    .optional(),
});

export const paymentsQuerySchema = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const AUDIT_ENTITIES = ["payment", "concession", "reconciliation_run", "reconciliation_item", "demo"] as const;

export const auditQuerySchema = z.object({
  actor: z.enum(["admin", "accountant", "student", "gateway", "system"]).optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const roleSchema = z.object({ role: z.enum(["admin", "accountant", "student"]) });

/** Query-string params to a plain object, dropping empty values. */
export function searchParamsObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    if (v.trim() !== "") out[k] = v;
  });
  return out;
}

/** Strips characters that have meaning in PostgREST filter syntax, so search text is always literal. */
export function safeSearch(q: string | undefined): string | undefined {
  const cleaned = q?.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
