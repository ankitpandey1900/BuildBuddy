import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "plain" | "subtle" | "danger" | "icon";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
  disabled,
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center font-sans font-medium transition-colors duration-150 ease-out cursor-pointer select-none border disabled:opacity-50 disabled:cursor-not-allowed focus-ring";

  const sizeClasses = {
    sm: "text-caption h-6 px-2 gap-1 rounded-sm",
    md: "text-body h-7 px-2.5 gap-1.5 rounded-sm",
    lg: "text-body h-8 px-3 gap-2 rounded-sm",
  };

  const iconOnlySizeClasses = {
    sm: "w-6 h-6 p-0 rounded-sm",
    md: "w-7 h-7 p-0 rounded-sm",
    lg: "w-8 h-8 p-0 rounded-sm",
  };

  const isIconOnly = variant === "icon" || (!children && Boolean(icon));

  const variantClasses = {
    primary:
      "bg-accent text-white border-accent hover:bg-accent-hover active:opacity-95 shadow-xs",
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
  };

  return (
    <button
      className={twMerge(
        clsx(
          base,
          isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
          variantClasses[variant],
          className
        )
      )}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0 flex items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
};
