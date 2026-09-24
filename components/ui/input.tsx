import * as React from "react";
import { cn } from "@/lib/cn";

export const controlClass =
  "h-9 w-full rounded border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-muted/80 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-debit";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, "h-auto min-h-[76px] py-2 leading-5", className)} {...props} />;
});

/** Native select, styled to match. Native keeps keyboard and mobile behaviour for free. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        controlClass,
        "select-chevron appearance-none pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-debit">
      {children}
    </p>
  );
}
