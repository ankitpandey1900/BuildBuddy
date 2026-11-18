import React, { useRef, useEffect } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  ariaLabel?: string;
}

export const Menu: React.FC<MenuProps> = ({
  isOpen,
  onClose,
  children,
  className,
  align = "left",
  ariaLabel = "Menu",
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      {/* Floating Menu with soft elevation */}
      <div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        className={twMerge(
          clsx(
            "absolute top-full mt-1 bg-surface border border-border-default rounded-md shadow-menu py-1 z-50 text-body font-sans select-none animate-in fade-in zoom-in-95 duration-150",
            align === "right" ? "right-0" : "left-0",
            className
          )
        )}
      >
        {children}
      </div>
    </>
  );
};

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
}

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  shortcut,
  danger,
  children,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      className={twMerge(
        clsx(
          "w-full flex items-center justify-between px-3 py-1.5 text-left text-body transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          danger
            ? "text-status-danger-text hover:bg-status-danger-bg"
            : "text-text-primary hover:bg-hover",
          className
        )
      )}
      {...props}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="flex-shrink-0 text-text-muted">{icon}</span>}
        <span className="truncate">{children}</span>
      </div>
      {shortcut && (
        <span className="text-[11px] font-sans text-text-muted ml-3 flex-shrink-0">
          {shortcut}
        </span>
      )}
    </button>
  );
};

export const MenuDivider: React.FC = () => {
  return <div className="h-[1px] bg-border-subtle my-1" role="separator" />;
};

export const MenuHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="px-3 py-1 text-[11px] font-sans font-medium text-text-muted">
      {children}
    </div>
  );
};

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  children,
  align = "left",
  isOpen,
  onOpenChange,
  className,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="relative inline-flex">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {trigger}
      </div>
      <Menu isOpen={open} onClose={() => setOpen(false)} align={align} className={className}>
        {children}
      </Menu>
    </div>
  );
};
