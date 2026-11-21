import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
      className={twMerge(
        clsx(
          "flex flex-col items-center justify-center p-8 text-center select-none max-w-md mx-auto my-auto",
          className
        )
      )}
    >
      {icon && (
        <div className="w-10 h-10 rounded-full bg-elevated border border-border-default flex items-center justify-center text-text-muted mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-subheading font-sans font-semibold text-text-primary mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-text-secondary text-body font-sans max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
