import React from "react";
import { cn } from "@/lib/utils";

export interface SegmentItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel = "Segmented control",
}: SegmentedControlProps<T>) {
  const containerSizeClasses = {
    sm: "p-0.5 gap-0.5 h-6",
    md: "p-0.5 gap-0.5 h-7",
  };

  const itemSizeClasses = {
    sm: "text-caption px-2 py-0.5 rounded-sm",
    md: "text-body px-2.5 py-1 rounded-sm",
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center bg-elevated border border-border-default rounded-sm select-none",
        containerSizeClasses[size],
        className
      )}
    >
      {items.map((item) => {
        const isSelected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center justify-center font-sans font-medium transition-colors duration-150 ease-out focus-ring cursor-pointer whitespace-nowrap",
              itemSizeClasses[size],
              isSelected
                ? "bg-surface text-text-primary shadow-xs border border-border-default/60 font-semibold"
                : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
            )}
          >
            {item.icon && <span className="mr-1.5 flex-shrink-0 flex items-center">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  "ml-1.5 px-1 py-0.2 rounded-full text-[10px] font-sans",
                  isSelected
                    ? "bg-accent-subtle text-accent-text"
                    : "bg-surface text-text-muted border border-border-subtle"
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
