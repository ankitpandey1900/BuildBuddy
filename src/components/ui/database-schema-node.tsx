import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface DatabaseSchemaNodeProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

export const DatabaseSchemaNode = forwardRef<HTMLDivElement, DatabaseSchemaNodeProps>(
  ({ className, selected, children, ...props }, ref) => (
    <div
      ref={ref}
      data-selected={selected}
      className={cn(
        "relative rounded-lg border border-border-default bg-surface/95 text-text-primary backdrop-blur-md shadow-subtle transition-all duration-150 overflow-hidden select-none",
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
DatabaseSchemaNode.displayName = "DatabaseSchemaNode";

export const DatabaseSchemaNodeHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-border-default bg-elevated/80 text-caption font-semibold",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
DatabaseSchemaNodeHeader.displayName = "DatabaseSchemaNodeHeader";

export const DatabaseSchemaNodeBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("divide-y divide-border-subtle/40 text-micro font-mono max-h-72 overflow-y-auto", className)}
      {...props}
    >
      {children}
    </div>
  )
);
DatabaseSchemaNodeBody.displayName = "DatabaseSchemaNodeBody";

export const DatabaseSchemaTableRow = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center justify-between px-3 py-1.5 hover:bg-hover/50 transition-colors group",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
DatabaseSchemaTableRow.displayName = "DatabaseSchemaTableRow";

export const DatabaseSchemaTableCell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-1.5 truncate", className)}
      {...props}
    >
      {children}
    </div>
  )
);
DatabaseSchemaTableCell.displayName = "DatabaseSchemaTableCell";
