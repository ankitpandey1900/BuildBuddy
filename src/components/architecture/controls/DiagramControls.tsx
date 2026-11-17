import React from "react";
import { Plus, Minus, Maximize2, RotateCcw } from "lucide-react";

export interface DiagramControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetZoom?: () => void;
  showFitAllPrompt?: boolean;
}

export const DiagramControls: React.FC<DiagramControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetZoom,
  showFitAllPrompt = false,
}) => {
  return (
    <div
      className="absolute bottom-4 left-4 z-20 flex flex-col items-center bg-surface border border-border-default rounded-md shadow-md p-0.5 select-none font-mono"
      data-testid="diagram-zoom-controls-pill"
      role="toolbar"
      aria-label="Zoom and Viewport Controls"
    >
      <button
        type="button"
        tabIndex={0}
        aria-label="Zoom in"
        onClick={onZoomIn}
        className="p-1.5 rounded hover:bg-hover text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        title="Zoom In (+)"
      >
        <Plus className="w-4 h-4" />
      </button>

      <div className="w-3.5 h-[1px] bg-border-subtle my-0.5" />

      <button
        type="button"
        tabIndex={0}
        aria-label="Zoom out"
        onClick={onZoomOut}
        className="p-1.5 rounded hover:bg-hover text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        title="Zoom Out (-)"
      >
        <Minus className="w-4 h-4" />
      </button>

      <div className="w-3.5 h-[1px] bg-border-subtle my-0.5" />

      <button
        type="button"
        tabIndex={0}
        aria-label="Fit graph to view"
        onClick={onFitView}
        className={`p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
          showFitAllPrompt
            ? "bg-accent-subtle text-accent-text font-bold"
            : "hover:bg-hover text-text-primary"
        }`}
        title="Fit All"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {onResetZoom && (
        <>
          <div className="w-3.5 h-[1px] bg-border-subtle my-0.5" />
          <button
            type="button"
            tabIndex={0}
            aria-label="Reset zoom to 100%"
            onClick={onResetZoom}
            className="p-1.5 rounded hover:bg-hover text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
