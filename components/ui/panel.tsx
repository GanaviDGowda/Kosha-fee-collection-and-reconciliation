import { cn } from "@/lib/cn";

/** Bordered panel. Borders, not shadows. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-panel border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h2 className="text-md font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block h-3.5", className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>
        {description ? <p className="mt-1 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
