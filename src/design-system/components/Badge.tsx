import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-mono font-medium rounded transition-colors select-none tracking-tight",
  {
    variants: {
      variant: {
        confirmed: "bg-status-success-bg text-status-success-text border border-status-success-border",
        static: "bg-domain-backend-bg text-domain-backend-border border border-domain-backend-border/30",
        inferred: "bg-status-warning-bg text-status-warning-text border border-status-warning-border",
        unknown: "bg-muted text-text-muted border border-border-default",
        accent: "bg-accent-subtle text-accent border border-accent/30",
        neutral: "bg-subtle text-text-secondary border border-border-default",
        success: "bg-status-success-bg text-status-success-text border border-status-success-border",
        warning: "bg-status-warning-bg text-status-warning-text border border-status-warning-border",
        danger: "bg-status-danger-bg text-status-danger-text border border-status-danger-border",
        info: "bg-status-info-bg text-status-info-text border border-status-info-border",
      },
      size: {
        sm: "text-[11px] px-1.5 py-0.5 leading-none",
        md: "text-xs px-2 py-0.5 leading-tight",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  size,
  children,
  ...props
}) => {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {children}
    </span>
  );
};
