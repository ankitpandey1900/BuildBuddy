import React from "react";
import { Plus, Minus, Maximize2, Lock, Unlock, Map } from "lucide-react";

export interface DiagramControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetZoom?: () => void;
  zoomPercent?: number;
  showFitAllPrompt?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  isMinimapOpen?: boolean;
  onToggleMinimap?: () => void;
}

export const DiagramControls: React.FC<DiagramControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetZoom,
  zoomPercent,
  showFitAllPrompt = false,
  isLocked = false,
  onToggleLock,
  isMinimapOpen = false,
  onToggleMinimap,
}) => {
  return (
    <div
      className="flex flex-col items-center bg-surface/90 backdrop-blur-md border border-border-default rounded-md shadow-menu p-1 select-none font-mono gap-1"
      data-testid="diagram-zoom-controls-pill"
      role="toolbar"
      aria-label="Zoom and Viewport Controls"
    >
      <button
        type="button"
        tabIndex={0}
        aria-label="Zoom in"
        onClick={onZoomIn}
        className="p-1.5 rounded-sm hover:bg-hover text-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
        title="Zoom In (Ctrl +)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {zoomPercent !== undefined && (
        <button
          type="button"
          tabIndex={0}
          aria-label="Reset zoom to 100%"
          onClick={onResetZoom}
          className="px-1.5 py-0.5 rounded-sm hover:bg-hover text-text-secondary hover:text-text-primary text-[10px] font-mono tracking-tight transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          title="Current Zoom (Click to reset to 100%)"
        >
          {zoomPercent}%
        </button>
      )}

      <button
        type="button"
        tabIndex={0}
        aria-label="Zoom out"
        onClick={onZoomOut}
        className="p-1.5 rounded-sm hover:bg-hover text-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
        title="Zoom Out (Ctrl -)"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <div className="w-4 h-[1px] bg-border-subtle my-0.5" />

      <button
        type="button"
        tabIndex={0}
        aria-label="Fit graph to view"
        onClick={onFitView}
        className={`p-1.5 rounded-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
          showFitAllPrompt
            ? "bg-accent text-white font-bold shadow-xs"
            : "hover:bg-hover text-text-primary"
        }`}
        title="Fit All Graph Elements"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {onToggleLock && (
        <button
          type="button"
          tabIndex={0}
          aria-label={isLocked ? "Unlock canvas" : "Lock canvas"}
          onClick={onToggleLock}
          className={`p-1.5 rounded-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
            isLocked
              ? "bg-status-warning-bg/40 text-status-warning-text"
              : "hover:bg-hover text-text-muted hover:text-text-primary"
          }`}
          title={isLocked ? "Unlock Viewport" : "Lock Viewport"}
        >
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      )}

      {onToggleMinimap && (
        <button
          type="button"
          tabIndex={0}
          aria-label={isMinimapOpen ? "Hide minimap" : "Show minimap"}
          onClick={onToggleMinimap}
          className={`p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
            isMinimapOpen
              ? "bg-accent/15 text-accent"
              : "hover:bg-hover text-text-muted hover:text-text-primary"
          }`}
          title={isMinimapOpen ? "Hide MiniMap" : "Show MiniMap"}
        >
          <Map className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
