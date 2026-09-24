import { Panel, Skeleton } from "@/components/ui/panel";

// Shaped like the statement: header with balance, fee-head bars, passbook rows.
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy aria-label="Loading statement">
      <Skeleton className="h-4 w-20" />
      <Panel>
        <div className="space-y-2 px-6 py-5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="w-80" />
        </div>
        <div className="flex items-end justify-between border-t border-line px-6 py-5">
          <div className="space-y-2">
            <Skeleton className="w-20" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="w-72" />
          </div>
          <Skeleton className="hidden h-14 w-80 md:block" />
        </div>
      </Panel>
      <Panel>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="w-24" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[120px_1fr_200px] items-center gap-5 border-b border-line px-5 py-4 last:border-0">
            <Skeleton className="w-20" />
            <Skeleton className="h-2.5 rounded-full" />
            <Skeleton className="ml-auto w-28" />
          </div>
        ))}
      </Panel>
      <Panel>
        <div className="flex gap-6 border-b border-line px-5 py-3">
          <Skeleton className="w-20" />
          <Skeleton className="w-24" />
          <Skeleton className="w-20" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr_140px_110px_110px_120px] items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
            <Skeleton className="w-20" />
            <Skeleton className="w-56" />
            <Skeleton className="w-28" />
            <Skeleton className="ml-auto w-20" />
            <Skeleton className="ml-auto w-20" />
            <Skeleton className="ml-auto w-24" />
          </div>
        ))}
      </Panel>
    </div>
  );
}
