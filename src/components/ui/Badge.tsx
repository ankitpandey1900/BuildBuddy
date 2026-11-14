import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface BadgeProps {
  variant?: "confirmed" | "static" | "inferred" | "unknown" | "neutral" | "accent";
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
  const base = "inline-flex items-center font-mono font-medium rounded-sm border select-none";

  const sizeClasses = {
    sm: "text-[9px] px-1 py-0.2 gap-1 leading-tight",
    md: "text-micro px-1.5 py-0.5 gap-1.5 leading-normal",
  };

  const variantClasses = {
    confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    static: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    inferred: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    unknown: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    neutral: "bg-subtle text-text-muted border-border-subtle",
    accent: "bg-accent/15 text-accent-text border-accent/30",
  };

  const dotClasses = {
    confirmed: "bg-emerald-400",
    static: "bg-blue-400",
    inferred: "bg-amber-400",
    unknown: "bg-zinc-400",
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

