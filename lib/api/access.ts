// Ownership rules on top of the permission matrix: the student role only ever sees and
// acts on the one demo student account.

import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/api/schemas";
import { can, type Role } from "@/lib/auth/permissions";
import { forbidden } from "@/lib/auth/session";
import { getDemoStudentId } from "@/lib/data/students";

/** Path ids that aren't uuids are a 404, not a database error. */
export function parseId(value: string, what: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new ApiError(404, "not_found", `${what} not found.`);
  return parsed.data.toLowerCase();
}

/** Throws 403 unless the role may see this student's statement. */
export async function assertCanViewStudent(role: Role, studentId: string): Promise<void> {
  if (can(role, "students.view_all")) return;
  if (can(role, "statement.view_own") && studentId === (await getDemoStudentId())) return;
  throw new ApiError(403, "forbidden", "Students can only see their own statement.");
}

/** For the student role: throws 403 if the payment isn't on their own account. */
export async function assertOwnPaymentIfStudent(role: Role, paymentStudentId: string): Promise<void> {
  if (role !== "student") return;
  if (paymentStudentId !== (await getDemoStudentId())) throw forbidden(role, "payment.record");
}
