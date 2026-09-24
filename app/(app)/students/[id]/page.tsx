import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { StudentWorkspace } from "@/components/statement/student-workspace";
import { ApiError } from "@/lib/api/errors";
import { can } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";
import { getDemoStudentId, getStudentDetail, resolveStudentId } from "@/lib/data/students";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(id: string) {
  try {
    return await getStudentDetail(await resolveStudentId(decodeURIComponent(id)));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id).toUpperCase() };
}

export default async function StudentPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const role = await getRole();

  const detail = await load(id);
  if (!can(role, "students.view_all") && detail.student.id !== (await getDemoStudentId())) {
    redirect(`/students/${DEMO_STUDENT_ROLL_NO}`);
  }
  const highlight = sp.highlight && /^[0-9a-f-]{36}$/i.test(sp.highlight) ? sp.highlight : null;

  return (
    <div className="space-y-5">
      {can(role, "students.view_all") ? (
        <Link href="/students" className="no-print inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          Students
        </Link>
      ) : null}
      <StudentWorkspace detail={detail} role={role} highlightPaymentId={highlight} />
    </div>
  );
}
