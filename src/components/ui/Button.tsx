import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle" | "danger";
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
    "inline-flex items-center justify-center font-sans font-medium transition-colors cursor-pointer select-none border disabled:opacity-50 disabled:cursor-not-allowed focus-ring";

  const sizeClasses = {
    sm: "text-caption h-6 px-2 gap-1 rounded-sm",
    md: "text-meta h-7 px-2.5 gap-1.5 rounded-md",
    lg: "text-body h-8 px-3 gap-2 rounded-md",
  };

  const variantClasses = {
    primary:
      "bg-accent text-white border-accent hover:opacity-90 active:opacity-100",
    secondary:
      "bg-surface text-text-primary border-border-default hover:bg-hover active:bg-active",
    subtle:
      "bg-transparent text-text-secondary border-transparent hover:bg-hover hover:text-text-primary active:bg-active",
    danger:
      "bg-surface text-red-500 border-red-500/30 hover:bg-red-500/10 active:bg-red-500/20",
  };

  return (
    <button
      className={twMerge(clsx(base, sizeClasses[size], variantClasses[variant], className))}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

