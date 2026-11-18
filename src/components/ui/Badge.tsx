import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface BadgeProps {
  variant?:
    | "confirmed"
    | "static"
    | "inferred"
    | "unknown"
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger";
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  size = "md",
  dot = false,
  className,
  children,
}) => {
  const base = "inline-flex items-center font-sans font-medium rounded-sm border select-none transition-colors";

  const sizeClasses = {
    sm: "text-[10px] px-1 py-0.2 gap-1 leading-tight",
    md: "text-caption px-1.5 py-0.5 gap-1.5 leading-normal",
  };

  const variantClasses = {
    confirmed:
      "bg-elevated text-text-primary border-border-strong border-solid",
    success: "bg-status-success-bg text-status-success-text border-status-success-text/30",
    static: "bg-elevated text-text-primary border-border-default border-solid font-medium",
    inferred:
      "bg-transparent text-text-secondary border-border-strong border-dashed",
    warning: "bg-status-warning-bg text-status-warning-text border-status-warning-text/30",
    danger: "bg-status-danger-bg text-status-danger-text border-status-danger-text/30",
    unknown: "bg-transparent text-text-muted border-border-default border-dotted",
    neutral: "bg-elevated text-text-secondary border-border-subtle",
    accent: "bg-accent-subtle text-accent-text border-accent/30",
  };

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

  return (
    <span className={twMerge(clsx(base, sizeClasses[size], variantClasses[variant], className))}>
      {dot && (
        <span
          className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", dotClasses[variant])}
        />
      )}
      {children}
    </span>
  );
};
