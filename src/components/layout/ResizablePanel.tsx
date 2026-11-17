import React, { useState, useEffect, useCallback } from "react";

export interface ResizablePanelProps {
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onResize: (newWidth: number) => void;
  side?: "left" | "right";
  children: React.ReactNode;
  className?: string;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  width,
  minWidth = 260,
  maxWidth = 600,
  onResize,
  side = "right",
  children,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = width;
      if (side === "right") {
        newWidth = window.innerWidth - e.clientX;
      } else {
        newWidth = e.clientX;
      }

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        onResize(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, width, minWidth, maxWidth, onResize, side]);

  return (
    <div
      style={{ width }}
      className={`relative h-full flex-shrink-0 flex flex-col bg-surface border-border-default select-none ${
        side === "right" ? "border-l" : "border-r"
      } ${className}`}
    >
      {/* 1px Hairline + 6px invisible grab handle for easy resizing */}
      <div
        onMouseDown={handleMouseDown}
        aria-hidden="true"
        className={`absolute top-0 bottom-0 z-30 cursor-col-resize ${
          side === "right" ? "-left-1 w-2.5" : "-right-1 w-2.5"
        } hover:bg-accent/30 transition-colors ${isDragging ? "bg-accent/40" : ""}`}
        title="Drag to resize panel"
      />
      {children}
    </div>
  );
};
