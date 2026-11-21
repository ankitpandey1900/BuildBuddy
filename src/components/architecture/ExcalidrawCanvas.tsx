import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Layers,
  ExternalLink,
} from "lucide-react";

import type { DiagramModel, PositionedModel, SelectedDiagramElement } from "../../types/diagram";
import { convertDiagramToExcalidraw } from "../../diagram/excalidraw/converter";

export interface ExcalidrawCanvasProps {
  model: DiagramModel | PositionedModel | null;
  title?: string;
  theme?: "dark" | "light";
  onSelectDiagramElement?: (element: SelectedDiagramElement | null) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export const ExcalidrawCanvas: React.FC<ExcalidrawCanvasProps> = ({
  model,
  title,
  theme = "dark",
  onSelectDiagramElement,
  onNavigateToSource,
  onRefresh,
  children,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPillCollapsed, setIsPillCollapsed] = useState(false);
  const [activeSelectedRef, setActiveSelectedRef] = useState<{ filePath: string; line: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert model to Excalidraw elements whenever model or theme changes
  const initialElements = useMemo(() => {
    if (!model || model.nodes.length === 0) return [];
    try {
      return convertDiagramToExcalidraw(model, {
        theme,
        columnsPerLayer: 3,
        nodeWidth: 240,
        nodeHeight: 68,
      });
    } catch (err) {
      console.error("Failed to convert diagram to Excalidraw elements", err);
      return [];
    }
  }, [model, theme]);

  // Sync elements to Excalidraw canvas when ready or model changes
  useEffect(() => {
    if (!excalidrawAPI || initialElements.length === 0) return;

    excalidrawAPI.updateScene({
      elements: initialElements,
      appState: {
        theme: theme === "dark" ? "dark" : "light",
        viewBackgroundColor: theme === "dark" ? "#0C0C0E" : "#F5F5F7",
      },
    });

    const timer = setTimeout(() => {
      try {
        excalidrawAPI.scrollToContent(initialElements, {
          fitToViewport: true,
          viewportZoomFactor: 0.85,
          animate: true,
        });
      } catch (e) {
        // Safe fallback
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [excalidrawAPI, initialElements, theme]);

  // Handle selection changes to drive InspectorPanel & code jump
  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      const selectedIds = Object.keys(appState.selectedElementIds || {}).filter(
        (id) => appState.selectedElementIds[id]
      );

      if (selectedIds.length === 0) {
        setActiveSelectedRef(null);
        if (onSelectDiagramElement) onSelectDiagramElement(null);
        return;
      }

      const selectedEl = elements.find((el) => el.id === selectedIds[0]);
      if (selectedEl?.customData) {
        const { nodeId, kind, sourceRef, metrics } = selectedEl.customData;

        if (sourceRef?.file_path) {
          setActiveSelectedRef({
            filePath: sourceRef.file_path,
            line: sourceRef.start_line || 1,
          });
        } else {
          setActiveSelectedRef(null);
        }

        if (onSelectDiagramElement) {
          onSelectDiagramElement({
            type: "node",
            node: {
              id: nodeId,
              label: selectedEl.label?.text || nodeId,
              kind: kind || "component",
              source_ref: sourceRef,
              metrics,
              width: selectedEl.width || 240,
              height: selectedEl.height || 68,
              members: [],
            },
          });
        }
      }
    },
    [onSelectDiagramElement]
  );

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleFitToContent = () => {
    if (!excalidrawAPI || initialElements.length === 0) return;
    excalidrawAPI.scrollToContent(initialElements, {
      fitToViewport: true,
      viewportZoomFactor: 0.85,
      animate: true,
    });
  };

  const handleJumpToCode = () => {
    if (activeSelectedRef && onNavigateToSource) {
      onNavigateToSource(activeSelectedRef.filePath, activeSelectedRef.line);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col h-full w-full min-h-0 relative overflow-hidden bg-canvas"
      style={{ minHeight: "500px" }}
    >
      {/* Excalidraw Whiteboard Container */}
      <div className="flex-1 w-full h-full min-h-0 relative">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          theme={theme === "dark" ? "dark" : "light"}
          initialData={{
            elements: initialElements,
            appState: {
              theme: theme === "dark" ? "dark" : "light",
              viewBackgroundColor: theme === "dark" ? "#0C0C0E" : "#F5F5F7",
            },
          }}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              clearCanvas: false,
              export: {
                saveFileToDisk: true,
              },
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: true,
            },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.Item
              onSelect={handleFitToContent}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Fit View to Architecture
            </MainMenu.Item>
            {onRefresh && (
              <MainMenu.Item
                onSelect={onRefresh}
                icon={<Sparkles className="w-4 h-4" />}
              >
                Re-generate 2D Layout
              </MainMenu.Item>
            )}
          </MainMenu>
        </Excalidraw>
      </div>

      {/* Optional Top Floating Island Bar overlay */}
      {children && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
          {children}
        </div>
      )}

      {/* Compact Bottom-Right Floating Controls (Never blocks top/center diagram content) */}
      {title && (
        isPillCollapsed ? (
          <button
            onClick={() => setIsPillCollapsed(false)}
            className="absolute bottom-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-surface/90 backdrop-blur-md border border-border-default shadow-xs text-text-muted hover:text-text-primary hover:bg-hover transition-all cursor-pointer"
            title={`Expand overlay: ${title}`}
          >
            <Layers className="w-3.5 h-3.5 text-text-muted" />
          </button>
        ) : (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface/90 backdrop-blur-md border border-border-default shadow-xs text-[11px] font-sans text-text-muted hover:text-text-primary transition-all">
            <button
              onClick={() => setIsPillCollapsed(true)}
              className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
              title="Minimize pill"
            >
              <Layers className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="font-medium text-text-primary truncate max-w-[150px]">{title}</span>
            </button>

            {activeSelectedRef && onNavigateToSource && (
              <button
                onClick={handleJumpToCode}
                className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent text-white text-[10px] font-sans hover:opacity-90 transition-opacity cursor-pointer"
                title="Jump to Source Code"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                <span>Source</span>
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="ml-0.5 text-text-muted hover:text-text-primary transition-colors p-0.5 rounded hover:bg-hover cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
            </button>
          </div>
        )
      )}
    </div>
  );
};
