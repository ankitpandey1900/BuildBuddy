import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center select-none font-sans max-w-sm mx-auto",
        className
      )}
    >
      {icon && (
        <div className="w-10 h-10 rounded-md bg-subtle border border-border-default flex items-center justify-center text-text-muted mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-body font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 text-caption text-text-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
