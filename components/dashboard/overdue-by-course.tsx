import Link from "next/link";
import { formatINR } from "@/lib/money";

const SHORT: Record<string, string> = { CSE: "B.Tech CSE", BCA: "BCA", BCOM: "B.Com" };

/** Horizontal bars, one hue, exact figure beside each bar; each row filters the student list. */
export function OverdueByCourse({ rows }: { rows: { courseCode: string; courseName: string; overduePaise: number; students: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.overduePaise));
  if (rows.every((r) => r.overduePaise === 0)) return <p className="px-5 py-8 text-center text-muted">Nothing is overdue in any course.</p>;
  return (
    <ul className="space-y-1 px-2 py-3">
      {rows.map((r) => (
        <li key={r.courseCode}>
          <Link
            href={`/students?course=${r.courseCode}&status=OVERDUE`}
            className="group grid grid-cols-[84px_1fr] items-center gap-x-3 gap-y-1 rounded px-3 py-2 hover:bg-canvas sm:grid-cols-[96px_1fr_150px]"
            title={`${r.courseName}: ${formatINR(r.overduePaise)} overdue across ${r.students} students`}
          >
            <span className="font-medium">{SHORT[r.courseCode] ?? r.courseCode}</span>
            <span className="h-3 rounded-r bg-canvas" aria-hidden>
              <span className="block h-full rounded-r bg-debit/85 group-hover:bg-debit" style={{ width: `${(r.overduePaise / max) * 100}%` }} />
            </span>
            <span className="figure col-span-2 text-sm sm:col-span-1 sm:text-right">
              <span className="font-medium">{formatINR(r.overduePaise, { paise: "auto" })}</span>
              <span className="text-muted"> · {r.students} {r.students === 1 ? "student" : "students"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
