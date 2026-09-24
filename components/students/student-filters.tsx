"use client";

import { UrlFilters } from "@/components/ui/url-filters";

const COURSE_LABEL: Record<string, string> = { CSE: "B.Tech CSE", BCOM: "B.Com" };

export function StudentFilters({ courses }: { courses: { code: string; name: string }[] }) {
  return (
    <UrlFilters
      searchLabel="Search students"
      searchPlaceholder="Name or roll number"
      selects={[
        { name: "course", label: "Course", allLabel: "All courses", options: courses.map((c) => ({ value: c.code, label: COURSE_LABEL[c.code] ?? c.code })) },
        {
          name: "status",
          label: "Status",
          allLabel: "Any status",
          options: [
            { value: "OVERDUE", label: "Overdue" },
            { value: "DUE", label: "Due" },
            { value: "PAID", label: "Paid" },
            { value: "ADVANCE", label: "Advance" },
          ],
        },
      ]}
    />
  );
}
