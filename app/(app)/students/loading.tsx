import { PageHeader, Panel, Skeleton } from "@/components/ui/panel";

// Shaped like the real table: filter bar, header row, ten ruled rows.
export default function Loading() {
  return (
    <>
      <PageHeader title="Students" description="Every student's fee account for 2026-27. Open a row to see the statement." />
      <Panel aria-busy aria-label="Loading students">
        <div className="flex gap-2 border-b border-line px-4 py-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="grid grid-cols-[90px_1.4fr_1fr_110px_110px_120px_90px] items-center gap-4 px-4 py-3.5">
              <Skeleton className="w-16" />
              <Skeleton className="w-40" />
              <Skeleton className="w-28" />
              <Skeleton className="ml-auto w-20" />
              <Skeleton className="ml-auto w-20" />
              <Skeleton className="ml-auto w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
