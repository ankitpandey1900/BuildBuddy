import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors select-none focus-ring disabled:opacity-50 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-neutral-900 text-white border border-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:border-white dark:hover:bg-neutral-100 shadow-sm font-medium",
        secondary:
          "bg-surface text-text-primary border border-border-default hover:bg-hover hover:border-border-strong active:bg-active",
        outline:
          "bg-transparent text-text-primary border border-border-default hover:bg-hover hover:border-border-strong active:bg-active",
        ghost:
          "bg-transparent text-text-secondary hover:text-text-primary hover:bg-hover active:bg-active border border-transparent",
        danger:
          "bg-status-danger-bg text-status-danger-text border border-status-danger-border hover:bg-status-danger-bg/80 active:bg-status-danger-bg",
      },
      size: {
        xs: "h-6 px-2 text-micro",
        sm: "h-7 px-2.5 text-caption",
        md: "h-8 px-3 text-body",
        lg: "h-9 px-4 text-body",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
