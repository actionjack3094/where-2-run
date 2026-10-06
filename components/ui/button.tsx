import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground hover:bg-accent-hover",
        gold: "bg-gold-strong font-display font-semibold uppercase tracking-[0.18em] text-stone-900 hover:bg-gold",
        outline:
          "border border-amber-500/40 bg-white text-stone-900 hover:border-amber-500 hover:bg-stone-50",
        ghost: "hover:bg-stone-100",
        secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6",
        full: "h-12 w-full px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
