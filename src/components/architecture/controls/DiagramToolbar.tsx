import React from "react";
import {
  Search,
  X,
  Filter,
  Download,
  ArrowDown,
  ArrowRight,
  Loader2,
  Info,
  Layers,
  FileCode,
  Compass,
  Box,
  GitFork,
  Database,
  Workflow,
  Plus,
  Minus,
  Maximize2,
  Network,
  Paintbrush,
} from "lucide-react";
import type { DiagramType } from "../../../types/diagram";
import type { LayoutDirection } from "../../../diagram/layout/types";
import type { ExportFormat } from "../../../types/export";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onResetZoom?: () => void;
  zoomPercent?: number;
  onExport: (format: ExportFormat) => void;
  isLayoutRunning: boolean;
  onCancelLayout?: () => void;
  isLegendOpen?: boolean;
  onToggleLegend?: () => void;
  fileViewMode?: "graph" | "tree";
  onToggleFileViewMode?: () => void;
  canvasMode?: "graph" | "whiteboard";
  onToggleCanvasMode?: (mode: "graph" | "whiteboard") => void;
}

const DIAGRAM_SEGMENTS: { type: DiagramType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: "system_flow", label: "Structure Flow", icon: Workflow },
  { type: "architecture_overview", label: "Overview", icon: Compass },
  { type: "module_dependency", label: "Modules", icon: Layers },
  { type: "file_dependency", label: "Files", icon: FileCode },
  { type: "class_diagram", label: "Classes", icon: Box },
  { type: "call_graph", label: "Calls", icon: GitFork },
  { type: "er_diagram", label: "ER", icon: Database },
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
  onResetZoom,
  zoomPercent,
  onExport,
  isLayoutRunning,
  onCancelLayout,
  isLegendOpen,
  onToggleLegend,
  fileViewMode = "graph",
  onToggleFileViewMode,
  canvasMode = "graph",
  onToggleCanvasMode,
}) => {
  const [exportOpen, setExportOpen] = React.useState(false);

  return (
    <header className="h-10 px-2.5 bg-surface border-b border-border-default flex items-center justify-between text-xs font-sans select-none z-10 flex-shrink-0 overflow-x-auto overflow-y-hidden gap-2">
      {/* Left: Diagram Type Segmented Control & Direction */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {/* Segmented Control */}
        <div
          role="radiogroup"
          aria-label="Diagram Type"
          className="flex items-center p-0.5 bg-subtle border border-border-default rounded-md"
        >
          {DIAGRAM_SEGMENTS.map((seg) => {
            const isSelected = diagramType === seg.type;
            const Icon = seg.icon;
            return (
              <button
                key={seg.type}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectDiagramType(seg.type)}
                className={`flex items-center space-x-1 px-1.5 py-1 rounded text-[11px] font-sans font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
                  isSelected
                    ? "bg-surface text-text-primary shadow-xs border border-border-default font-semibold"
                    : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
                }`}
                title={seg.label}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{seg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Direction Toggle */}
        <button
          type="button"
          aria-label={`Layout direction: ${direction === "DOWN" ? "Top to Bottom" : "Left to Right"}`}
          onClick={onToggleDirection}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-subtle border border-border-default hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors"
          title={`Switch layout direction (currently ${direction === "DOWN" ? "Top to Bottom" : "Left to Right"})`}
        >
          {direction === "DOWN" ? (
            <ArrowDown className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
          )}
          <span className="text-[11px] font-mono">{direction === "DOWN" ? "TB" : "LR"}</span>
        </button>

        {/* Canvas Engine Mode Toggle: Graph vs Excalidraw Whiteboard */}
        {onToggleCanvasMode && (
          <div className="flex items-center p-0.5 bg-subtle border border-border-default rounded-md">
            <button
              type="button"
              onClick={() => onToggleCanvasMode("graph")}
              className={`flex items-center space-x-1 px-1.5 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                canvasMode === "graph"
                  ? "bg-surface text-text-primary shadow-xs border border-border-default font-semibold"
                  : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
              }`}
              title="Interactive Node Graph Mode"
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Graph</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleCanvasMode("whiteboard")}
              className={`flex items-center space-x-1 px-1.5 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                canvasMode === "whiteboard"
                  ? "bg-surface text-text-primary shadow-xs border border-border-default font-semibold"
                  : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
              }`}
              title="Excalidraw Whiteboard Mode (Full Drawing & Architecture Canvas)"
            >
              <Paintbrush className="w-3.5 h-3.5 text-accent-default" />
              <span>Excalidraw</span>
            </button>
          </div>
        )}

        {/* File View Mode Toggle (Obsidian Graph vs Hierarchical Tree) */}
        {diagramType === "file_dependency" && onToggleFileViewMode && (
          <button
            type="button"
            aria-label={`View mode: ${fileViewMode === "graph" ? "Obsidian Graph" : "Tree View"}`}
            onClick={onToggleFileViewMode}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
              fileViewMode === "graph"
                ? "bg-accent text-white border-accent shadow-xs"
                : "bg-subtle text-text-secondary hover:text-text-primary hover:bg-hover border-border-default"
            }`}
            title="Toggle between Obsidian-style Graph View and Hierarchical Tree View"
          >
            <Network className="w-3.5 h-3.5" />
            <span>{fileViewMode === "graph" ? "Graph View" : "Tree View"}</span>
          </button>
        )}
      </div>

      {/* Middle: Node Search Bar */}
      <div className="flex items-center space-x-1.5 min-w-[100px] max-w-[200px] flex-1 mx-1.5">
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
          <span className="text-[10px] text-text-muted flex-shrink-0 font-mono">
            {searchMatchCount} match{searchMatchCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Right: Actions, Filters, Legend, Export */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
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
          className={`flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
            filterActiveCount > 0
              ? "bg-accent-subtle border-accent-default text-accent-text font-medium"
              : "bg-subtle border-border-default text-text-secondary hover:text-text-primary hover:bg-hover"
          }`}
          title="Filter relationships, confidence & layers"
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="text-[11px] font-sans">Filter</span>
          {filterActiveCount > 0 && (
            <span className="px-1 py-0.2 bg-accent-default text-white rounded-full text-[9px]">
              {filterActiveCount}
            </span>
          )}
        </button>

        {/* Zoom Controls in Toolbar */}
        {(onZoomIn || onZoomOut || onFitView) && (
          <div
            className="flex items-center space-x-0.5 bg-subtle border border-border-default rounded p-0.5"
            role="toolbar"
            aria-label="Diagram Zoom Controls"
            data-testid="toolbar-zoom-controls"
          >
            {onZoomOut && (
              <button
                type="button"
                aria-label="Zoom out"
                onClick={onZoomOut}
                className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors"
                title="Zoom Out (Ctrl -)"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}

            {zoomPercent !== undefined && onResetZoom && (
              <button
                type="button"
                aria-label="Reset zoom to 100%"
                onClick={onResetZoom}
                className="px-1.5 py-0.5 rounded text-[11px] font-mono hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus min-w-[42px] text-center transition-colors"
                title="Zoom Level (Click to reset to 100%)"
              >
                {zoomPercent}%
              </button>
            )}

            {onZoomIn && (
              <button
                type="button"
                aria-label="Zoom in"
                onClick={onZoomIn}
                className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors"
                title="Zoom In (Ctrl +)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {onFitView && (
              <>
                <div className="w-[1px] h-3 bg-border-subtle mx-0.5" />
                <button
                  type="button"
                  aria-label="Fit graph to view"
                  onClick={onFitView}
                  className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors"
                  title="Fit to View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Legend Toggle in Toolbar */}
        {onToggleLegend && (
          <button
            type="button"
            aria-label="Toggle diagram legend from toolbar"
            data-testid="toolbar-legend-toggle"
            onClick={onToggleLegend}
            className={`flex items-center space-x-1 px-2 py-1 rounded border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
              isLegendOpen
                ? "bg-accent-subtle border-accent-default text-accent-text"
                : "bg-subtle border-border-default text-text-secondary hover:text-text-primary hover:bg-hover"
            }`}
            title="Toggle legend and line styles"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="text-[11px] font-sans">Legend</span>
          </button>
        )}

        {/* Export Dropdown */}
        <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Export diagram"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((prev) => !prev)}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-subtle border border-border-default hover:bg-hover text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-[11px] font-sans">Export</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 font-mono text-xs">
            <DropdownMenuItem
              onSelect={() => {
                setExportOpen(false);
                onExport("svg");
              }}
            >
              SVG (Vector)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setExportOpen(false);
                onExport("png");
              }}
            >
              PNG (High-Res 2x)
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              disabled
              title="Vector PDF generation is stubbed (requires external PDF generator library)"
            >
              <button
                type="button"
                disabled
                className="w-full text-left cursor-not-allowed opacity-50"
              >
                PDF (Vector - Stubbed)
              </button>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setExportOpen(false);
                onExport("mermaid");
              }}
            >
              Mermaid (.mmd)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
