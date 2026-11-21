import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BaseNodeProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

export const BaseNode = forwardRef<HTMLDivElement, BaseNodeProps>(
  ({ className, selected, children, ...props }, ref) => (
    <div
      ref={ref}
      data-selected={selected}
      className={cn(
        "relative rounded-lg border border-border-default bg-surface/90 text-text-primary backdrop-blur-sm shadow-subtle transition-all duration-150 select-none",
        "hover:border-border-strong hover:shadow-menu",
        selected && "border-accent ring-2 ring-accent/40 ring-offset-1 ring-offset-canvas shadow-menu",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
BaseNode.displayName = "BaseNode";

export const BaseNodeHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-elevated/40 text-caption font-medium rounded-t-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
BaseNodeHeader.displayName = "BaseNodeHeader";

export const BaseNodeHeaderTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "font-semibold text-text-primary text-body tracking-tight truncate",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  )
);
BaseNodeHeaderTitle.displayName = "BaseNodeHeaderTitle";

export const BaseNodeContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-3 text-caption text-text-secondary", className)}
      {...props}
    >
      {children}
    </div>
  )
);
BaseNodeContent.displayName = "BaseNodeContent";

export const BaseNodeFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between px-3 py-1.5 border-t border-border-subtle/70 bg-elevated/20 text-micro text-text-muted rounded-b-lg font-mono",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
BaseNodeFooter.displayName = "BaseNodeFooter";
