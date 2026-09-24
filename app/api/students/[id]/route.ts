import { assertCanViewStudent } from "@/lib/api/access";
import { handle } from "@/lib/api/handler";
import { getRole } from "@/lib/auth/session";
import { getStudentDetail, resolveStudentId } from "@/lib/data/students";

// GET /api/students/:id  (id may be a uuid or a roll number)
// Profile, installments, fee-head summary, statement with running balance, payments.
export const GET = handle<{ id: string }>(async (_req, { id }) => {
  const role = await getRole();
  const studentId = await resolveStudentId(id);
  await assertCanViewStudent(role, studentId);
  return getStudentDetail(studentId);
});
