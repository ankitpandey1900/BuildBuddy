import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children, className, ...props }) => {
  return (
    <kbd
      className={twMerge(
        clsx(
          "inline-flex items-center justify-center font-sans font-medium text-[11px] leading-tight px-1.5 py-0.5 rounded-sm bg-elevated border border-border-default text-text-muted select-none shadow-xs",
          className
        )
      )}
      {...props}
    >
      {children}
    </kbd>
  );
};
