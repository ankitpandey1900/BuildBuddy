import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Search, X } from "lucide-react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  prefixIcon?: React.ReactNode;
  suffix?: React.ReactNode;
  onClear?: () => void;
  size?: "sm" | "md";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ prefixIcon, suffix, onClear, size = "md", className, value, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-6 text-caption py-0.5",
      md: "h-7 text-body py-1",
    };

    const hasValue = Boolean(value && String(value).length > 0);

    return (
      <div className="relative flex items-center w-full">
        {prefixIcon && (
          <span className="absolute left-2 text-text-muted pointer-events-none flex items-center justify-center">
            {prefixIcon}
          </span>
        )}

        <input
          ref={ref}
          value={value}
          className={twMerge(
            clsx(
              "w-full bg-elevated border border-border-default rounded-sm text-text-primary placeholder:text-text-muted transition-colors duration-150 ease-out focus-ring font-sans",
              prefixIcon ? "pl-7" : "pl-2.5",
              hasValue && onClear ? "pr-7" : suffix ? "pr-8" : "pr-2.5",
              sizeClasses[size],
              className
            )
          )}
          {...props}
        />

        {hasValue && onClear && (
          <button
            type="button"
            aria-label="Clear text"
            onClick={onClear}
            className="absolute right-1.5 p-0.5 rounded-sm hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {suffix && !onClear && (
          <span className="absolute right-2 flex items-center text-text-muted pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface SearchInputProps extends InputProps {}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (props, ref) => {
    return (
      <Input
        ref={ref}
        type="search"
        prefixIcon={<Search className="w-3.5 h-3.5" />}
        {...props}
      />
    );
  }
);

SearchInput.displayName = "SearchInput";
