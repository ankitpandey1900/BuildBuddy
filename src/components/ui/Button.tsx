import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-sans font-medium transition-colors duration-150 ease-out select-none border disabled:opacity-50 disabled:cursor-not-allowed focus-ring cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:border-white dark:hover:bg-neutral-100 active:opacity-95 shadow-xs font-medium",
        secondary:
          "bg-surface text-text-primary border-border-default hover:bg-hover hover:border-border-strong active:bg-active",
        plain:
          "bg-transparent text-text-secondary border-transparent hover:bg-hover hover:text-text-primary active:bg-active",
        subtle:
          "bg-transparent text-text-secondary border-transparent hover:bg-hover hover:text-text-primary active:bg-active",
        danger:
          "bg-surface text-status-danger-text border-status-danger-text/30 hover:bg-status-danger-bg active:opacity-90",
        icon:
          "bg-transparent text-text-muted border-transparent hover:bg-hover hover:text-text-primary active:bg-active",
        outline:
          "border border-border-default bg-surface hover:bg-hover hover:text-text-primary text-text-primary",
        ghost:
          "hover:bg-hover hover:text-text-primary text-text-secondary border-transparent",
      },
      size: {
        sm: "text-caption h-6 px-2 gap-1 rounded-sm",
        md: "text-body h-7 px-2.5 gap-1.5 rounded-sm",
        lg: "text-body h-8 px-3 gap-2 rounded-sm",
        icon: "h-7 w-7 p-0 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, icon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isIconOnly = variant === "icon" || (!children && Boolean(icon));
    const effectiveSize = isIconOnly ? "icon" : size;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size: effectiveSize, className }))}
        ref={ref}
        {...props}
      >
        {icon && <span className="flex-shrink-0 flex items-center justify-center">{icon}</span>}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
