import React, { useState } from "react";
import {
  Search,
  X,
  Filter,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowDown,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { DiagramType } from "../../../types/diagram";
import type { LayoutDirection } from "../../../diagram/layout/types";
import type { ExportFormat } from "../../../types/export";

export interface DiagramToolbarProps {
  diagramType: DiagramType;
  onSelectDiagramType: (dtype: DiagramType) => void;
  direction: LayoutDirection;
  onToggleDirection: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit?: () => void;
  searchMatchCount?: number;
  filterActiveCount: number;
  onToggleFilterPanel: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onExport: (format: ExportFormat) => void;
  isLayoutRunning: boolean;
  onCancelLayout?: () => void;
}

const DIAGRAM_TYPES: { type: DiagramType; label: string }[] = [
  { type: "module_dependency", label: "Module Dependencies" },
  { type: "file_dependency", label: "File Dependencies" },
  { type: "architecture_overview", label: "Architecture Overview" },
  { type: "class_diagram", label: "Class Diagram" },
];

export const DiagramToolbar: React.FC<DiagramToolbarProps> = ({
  diagramType,
  onSelectDiagramType,
  direction,
  onToggleDirection,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchMatchCount,
  filterActiveCount,
  onToggleFilterPanel,
  onZoomIn,
  onZoomOut,
  onFitView,
  onExport,
  isLayoutRunning,
  onCancelLayout,
}) => {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <header className="h-10 px-3 bg-surface border-b border-border-default flex items-center justify-between text-xs font-mono select-none z-10">
      {/* Left: Diagram Type Selector & Direction */}
      <div className="flex items-center space-x-2">
        <select
          aria-label="Diagram Type"
          value={diagramType}
          onChange={(e) => onSelectDiagramType(e.target.value as DiagramType)}
          className="bg-subtle border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-border-focus font-medium"
        >
          {DIAGRAM_TYPES.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-label={`Layout direction: ${direction === "DOWN" ? "Top to Bottom" : "Left to Right"}`}
          onClick={onToggleDirection}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-subtle border border-border-default hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          title={`Switch direction (currently ${direction === "DOWN" ? "Top to Bottom" : "Left to Right"})`}
        >
          {direction === "DOWN" ? (
            <ArrowDown className="w-3.5 h-3.5" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5" />
          )}
          <span className="text-[11px]">{direction === "DOWN" ? "TB" : "LR"}</span>
        </button>
      </div>

      {/* Middle: Node Search Bar */}
      <div className="flex items-center space-x-1 max-w-xs w-full mx-2">
        <div className="relative w-full flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-text-muted pointer-events-none" />
          <input
            type="text"
            role="searchbox"
            aria-label="Search nodes"
            placeholder="Search nodes (Enter to focus)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSearchSubmit) {
                e.preventDefault();
                onSearchSubmit();
              }
            }}
            className="w-full pl-7 pr-7 py-1 bg-subtle border border-border-default rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-2 text-text-muted hover:text-text-primary p-0.5 rounded focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {searchMatchCount !== undefined && searchQuery && (
          <span className="text-[10px] text-text-muted flex-shrink-0">
            {searchMatchCount} match{searchMatchCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Right: Actions, Filters, Zoom, Export */}
      <div className="flex items-center space-x-1.5">
        {/* Worker Layout Progress & Cancellation Indicator */}
        {isLayoutRunning && (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-accent-subtle text-accent-text text-[11px]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Computing layout...</span>
            {onCancelLayout && (
              <button
                type="button"
                onClick={onCancelLayout}
                className="ml-1 underline text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Filter Panel Toggle */}
        <button
          type="button"
          aria-label="Toggle diagram filters"
          onClick={onToggleFilterPanel}
          className={`flex items-center space-x-1 px-2 py-1 rounded border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
            filterActiveCount > 0
              ? "bg-accent-subtle border-accent-default text-accent-text font-medium"
              : "bg-subtle border-border-default text-text-secondary hover:text-text-primary hover:bg-hover"
          }`}
          title="Filter relationships & confidence"
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="text-[11px]">Filter</span>
          {filterActiveCount > 0 && (
            <span className="px-1 py-0.2 bg-accent-default text-white rounded-full text-[9px]">
              {filterActiveCount}
            </span>
          )}
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center bg-subtle border border-border-default rounded">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="p-1 hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="p-1 hover:bg-hover text-text-secondary hover:text-text-primary border-l border-border-subtle focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Fit to screen"
            onClick={onFitView}
            className="p-1 hover:bg-hover text-text-secondary hover:text-text-primary border-l border-border-subtle focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            title="Fit to screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            type="button"
            aria-label="Export diagram"
            aria-haspopup="true"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-subtle border border-border-default hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="text-[11px]">Export</span>
          </button>

          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 top-8 w-44 bg-surface border border-border-default rounded shadow-lg py-1 z-30 text-xs font-mono"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportOpen(false);
                  onExport("svg");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hover text-text-primary"
              >
                SVG (Vector)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportOpen(false);
                  onExport("png");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hover text-text-primary"
              >
                PNG (High-Res 2x)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportOpen(false);
                  onExport("pdf");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hover text-text-primary"
              >
                PDF (Vector Document)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportOpen(false);
                  onExport("mermaid");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hover text-text-primary border-t border-border-subtle"
              >
                Mermaid (.mmd)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
