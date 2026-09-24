import { handle } from "@/lib/api/handler";
import { searchParamsObject, studentsQuerySchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { listStudents } from "@/lib/data/students";

// GET /api/students?q=&status=&course=
export const GET = handle(async (req) => {
  await requireRole("students.view_all");
  const filters = studentsQuerySchema.parse(searchParamsObject(req.nextUrl.searchParams));
  return listStudents(filters);
});
