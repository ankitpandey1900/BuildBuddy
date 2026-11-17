import React, { useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  delayMs?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = "top",
  className,
  delayMs = 250,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const show = () => {
    const id = setTimeout(() => setIsVisible(true), delayMs);
    setTimeoutId(id);
  };

  const hide = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={twMerge(
            clsx(
              "absolute z-50 px-2 py-1 bg-elevated border border-border-default text-text-primary text-[11px] font-sans font-medium rounded-sm shadow-menu whitespace-nowrap pointer-events-none transition-opacity duration-150 ease-out",
              sideClasses[side],
              className
            )
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};
