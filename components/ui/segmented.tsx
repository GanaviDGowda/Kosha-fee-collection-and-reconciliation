"use client";

// Segmented control built on native radio inputs: arrow keys, labels and form semantics for free.

import { cn } from "@/lib/cn";

export type SegmentedOption<V extends string> = { value: V; label: string; disabled?: boolean };

export function Segmented<V extends string>({
  name,
  value,
  onChange,
  options,
  label,
  className,
}: {
  name: string;
  value: V;
  onChange: (value: V) => void;
  options: SegmentedOption<V>[];
  label: string;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {/* Four or more options wrap to 2 x 2 on phones so labels are never truncated. */}
      <div className={cn("grid gap-0.5 rounded border border-line-strong bg-surface p-0.5", options.length > 3 ? "grid-cols-2 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none" : "auto-cols-fr grid-flow-col")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative flex h-8 cursor-pointer items-center justify-center rounded-sm px-2 text-sm font-medium text-muted transition-colors hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent",
              value === o.value && "bg-ink text-white hover:text-white",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
