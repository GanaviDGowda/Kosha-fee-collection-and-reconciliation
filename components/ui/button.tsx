import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-[#223052]",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-canvas",
        danger: "bg-debit text-white hover:bg-[#9a1d14]",
        link: "h-auto px-0 text-accent underline-offset-2 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-3.5 text-base",
        lg: "h-10 px-4 text-base",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, disables the button and keeps its width stable. */
    loading?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});

export { buttonVariants };
