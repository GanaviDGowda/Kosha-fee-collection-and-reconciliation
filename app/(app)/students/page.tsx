import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { StudentFilters } from "@/components/students/student-filters";
import { StudentsTable } from "@/components/students/students-table";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { studentsQuerySchema } from "@/lib/api/schemas";
import { guardPage } from "@/lib/auth/page-guard";
import { listCourses, listStudents } from "@/lib/data/students";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await guardPage("students.view_all");
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  // Bad filter values (e.g. a hand-edited URL) are ignored rather than erroring the page.
  const parsed = studentsQuerySchema.safeParse({ q: first(raw.q), status: first(raw.status), course: first(raw.course) });
  const filters = parsed.success ? parsed.data : {};

  const [students, courses] = await Promise.all([listStudents(filters), listCourses()]);
  const outstanding = students.reduce((s, x) => s + Math.max(x.balancePaise, 0), 0);
  const overdue = students.reduce((s, x) => s + x.overduePaise, 0);
  const filtered = Boolean(filters.q || filters.status || filters.course);

  return (
    <>
      <PageHeader title="Students" description="Every student's fee account for 2026-27. Open a row to see the statement." />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <StudentFilters courses={courses} />
          <p className="text-sm text-muted" aria-live="polite">
            <span className="figure">{students.length}</span> {students.length === 1 ? "student" : "students"}
            {students.length > 0 ? (
              <>
                {" · "}
                <Money paise={outstanding} auto /> outstanding{overdue > 0 ? (
                  <>
                    {", "}
                    <Money paise={overdue} auto className="text-debit" /> overdue
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        {students.length === 0 ? (
          <EmptyState
            title={filtered ? "No students match these filters" : "No students yet"}
            action={
              filtered ? (
                <Link href="/students" className="text-accent hover:underline">
                  Clear the filters
                </Link>
              ) : undefined
            }
          >
            {filtered ? "Try a different name, roll number, course or status." : "Run npm run db:setup to load the demo data."}
          </EmptyState>
        ) : (
          <StudentsTable students={students} />
        )}
      </Panel>
    </>
  );
}
