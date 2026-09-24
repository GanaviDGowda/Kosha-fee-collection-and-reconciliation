"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Balance, Money } from "@/components/money";
import { MappedBadge, STUDENT_TONE } from "@/components/ui/status-badge";
import type { StudentBalance } from "@/lib/data/students";

const COURSE_SHORT: Record<string, string> = { CSE: "B.Tech CSE", BCA: "BCA", BCOM: "B.Com" };

export function StudentsTable({ students }: { students: StudentBalance[] }) {
  const router = useRouter();
  return (
    <>
      {/* Phones: a compact list; the full table needs more width than a phone has. */}
      <ul className="divide-y divide-line sm:hidden">
        {students.map((s) => (
          <li key={s.studentId}>
            <Link href={`/students/${s.rollNo}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-canvas">
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block font-mono text-xs text-muted">
                  {s.rollNo} · {COURSE_SHORT[s.courseCode] ?? s.courseCode}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Balance paise={s.balancePaise} className="block font-medium" />
                <span className="mt-1 inline-block">
                  <MappedBadge map={STUDENT_TONE} value={s.status} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    <div className="hidden max-h-[calc(100vh-260px)] min-h-[240px] overflow-auto sm:block">
      <table className="ledger-table min-w-[860px]">
        <thead>
          <tr>
            <th scope="col">Roll no</th>
            <th scope="col">Name</th>
            <th scope="col">Course</th>
            <th scope="col" className="num" title="Fee demand after concessions">
              Billed
            </th>
            <th scope="col" className="num">
              Paid
            </th>
            <th scope="col" className="num">
              Balance
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr
              key={s.studentId}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) return;
                router.push(`/students/${s.rollNo}`);
              }}
              className="cursor-pointer transition-colors hover:bg-canvas/70"
            >
              <td className="whitespace-nowrap font-mono text-sm text-muted">{s.rollNo}</td>
              <td>
                <Link href={`/students/${s.rollNo}`} className="font-medium hover:text-accent hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="whitespace-nowrap text-muted">
                {COURSE_SHORT[s.courseCode] ?? s.courseCode} <span className="text-sm">· Year {s.year}</span>
              </td>
              <td className="num">
                <Money paise={s.totalDemandPaise - s.totalConcessionPaise} />
              </td>
              <td className="num">
                <Money paise={s.totalPaidPaise} className={s.totalPaidPaise === 0 ? "text-muted" : undefined} />
              </td>
              <td className="num font-medium">
                <Balance paise={s.balancePaise} />
              </td>
              <td>
                <span className="inline-flex items-center gap-2">
                  <MappedBadge map={STUDENT_TONE} value={s.status} />
                  {s.pendingCount > 0 ? <span className="whitespace-nowrap text-xs text-pending">{s.pendingCount} pending</span> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
