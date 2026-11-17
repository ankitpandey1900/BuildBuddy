import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={twMerge(
        clsx("flex items-center gap-1 border-b border-border-default px-2 select-none", className)
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={twMerge(
              clsx(
                "flex items-center gap-1.5 px-3 py-2 text-body font-sans font-medium transition-colors duration-150 relative -mb-[1px] border-b-2 focus-ring cursor-pointer",
                isActive
                  ? "border-accent text-text-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border-strong"
              )
            )}
          >
            {tab.icon && <span className="w-3.5 h-3.5 flex items-center">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={clsx(
                  "ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-sans",
                  isActive
                    ? "bg-accent-subtle text-accent-text"
                    : "bg-elevated text-text-muted"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
