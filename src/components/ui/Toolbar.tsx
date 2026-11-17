import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Toolbar: React.FC<ToolbarProps> = ({ children, className, ...props }) => {
  return (
    <div
      role="toolbar"
      className={twMerge(
        clsx(
          "h-10 px-3 bg-surface border-b border-border-default flex items-center justify-between text-body font-sans select-none z-10 flex-shrink-0",
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const ToolbarGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div className={twMerge(clsx("flex items-center gap-1.5", className))} {...props}>
      {children}
    </div>
  );
};

export const ToolbarDivider: React.FC = () => {
  return <div className="w-[1px] h-4 bg-border-subtle mx-1" role="separator" />;
};
