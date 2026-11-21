import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center font-sans font-medium rounded-sm border select-none transition-colors",
  {
    variants: {
      variant: {
        confirmed:
          "bg-elevated text-text-primary border-border-strong border-solid",
        success:
          "bg-status-success-bg text-status-success-text border-status-success-text/30",
        static:
          "bg-elevated text-text-primary border-border-default border-solid font-medium",
        inferred:
          "bg-transparent text-text-secondary border-border-strong border-dashed",
        warning:
          "bg-status-warning-bg text-status-warning-text border-status-warning-text/30",
        danger:
          "bg-status-danger-bg text-status-danger-text border-status-danger-text/30",
        unknown:
          "bg-transparent text-text-muted border-border-default border-dotted",
        neutral:
          "bg-elevated text-text-secondary border-border-subtle",
        accent:
          "bg-accent-subtle text-accent-text border-accent/30",
      },
      size: {
        sm: "text-[10px] px-1 py-0.2 gap-1 leading-tight",
        md: "text-caption px-1.5 py-0.5 gap-1.5 leading-normal",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

const dotClasses = {
  confirmed: "bg-status-success-text",
  success: "bg-status-success-text",
  static: "bg-accent-text",
  inferred: "bg-status-warning-text",
  warning: "bg-status-warning-text",
  danger: "bg-status-danger-text",
  unknown: "bg-text-muted",
  neutral: "bg-text-muted",
  accent: "bg-accent",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant = "neutral", size = "md", dot = false, children, ...props }: BadgeProps) {
  const currentVariant = variant || "neutral";
  return (
    <div className={cn(badgeVariants({ variant: currentVariant, size, className }))} {...props}>
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            dotClasses[currentVariant as keyof typeof dotClasses] || "bg-text-muted"
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
