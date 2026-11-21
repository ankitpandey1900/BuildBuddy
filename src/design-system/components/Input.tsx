import React from "react";
import { Search, X } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  onClear?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, onClear, value, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {icon && (
          <div className="absolute left-2.5 flex items-center pointer-events-none text-text-muted">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          value={value}
          className={cn(
            "w-full h-7 bg-surface text-text-primary placeholder:text-text-muted text-body rounded-sm border border-border-default focus-ring px-2.5 transition-colors font-sans",
            icon && "pl-8",
            onClear && value && "pr-7",
            className
          )}
          {...props}
        />
        {onClear && value && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 p-0.5 text-text-muted hover:text-text-primary rounded focus-ring"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface SearchInputProps extends Omit<InputProps, "icon" | "size"> {
  size?: "sm" | "md";
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, size = "sm", ...props }, ref) => {
    return (
      <Input
        ref={ref}
        icon={<Search className="w-3.5 h-3.5" strokeWidth={1.8} />}
        className={cn(size === "md" && "h-8 text-body", className)}
        {...props}
      />
    );
  }
);
SearchInput.displayName = "SearchInput";
