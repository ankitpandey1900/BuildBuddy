import React, { useState, useEffect } from "react";
import { TopBar } from "./TopBar";
import { NavRail } from "./NavRail";
import { InspectorPanel } from "./InspectorPanel";
import { StatusBar } from "./StatusBar";
import { PipelineProgress } from "@/components/pipeline/PipelineProgress";
import type { FileRecord, Project, ScanProgressPayload, SymbolRecord, ViewType } from "@/types/ipc";
import type { SelectedDiagramElement } from "@/types/diagram";

export interface AppShellProps {
  currentProject: Project | null;
  recentProjects: Project[];
  files: FileRecord[];
  selectedFile: FileRecord | null;
  selectedSymbol?: SymbolRecord | null;
  selectedDiagramElement?: SelectedDiagramElement | null;
  onClearDiagramElement?: () => void;
  isScanning: boolean;
  scanProgress: ScanProgressPayload | null;
  activeView: ViewType;
  theme: "dark" | "light";
  inspectorOpen: boolean;
  inspectorWidth: number;
  onResizeInspector?: (width: number) => void;
  onSelectView: (view: ViewType) => void;
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  onRemoveProject?: (projectId: number) => void;
  onTriggerScan: () => void;
  onCancelScan: () => void;
  onToggleTheme: () => void;
  onToggleInspector: () => void;
  onOpenCommandPalette: () => void;
  onSelectSymbol?: (symbol: SymbolRecord | null) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentProject,
  recentProjects,
  files,
  selectedFile,
  selectedSymbol,
  selectedDiagramElement,
  onClearDiagramElement,
  isScanning,
  scanProgress,
  activeView,
  theme,
  inspectorOpen,
  inspectorWidth,
  onResizeInspector,
  onSelectView,
  onOpenFolder,
  onReopenProject,
  onRemoveProject,
  onTriggerScan,
  onCancelScan,
  onToggleTheme,
  onToggleInspector,
  onOpenCommandPalette,
  onSelectSymbol,
  onNavigateToSource,
  children,
}) => {
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle nav sidebar with Cmd/Ctrl + B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsNavCollapsed((prev) => !prev);
      }
      // Toggle inspector with Cmd/Ctrl + I
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        onToggleInspector();
      }
      // Open folder with Cmd/Ctrl + O
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        onOpenFolder();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleInspector, onOpenFolder]);

  return (
    <div className="h-screen w-full flex flex-col bg-canvas text-text-primary overflow-hidden font-sans">
      <TopBar
        currentProject={currentProject}
        recentProjects={recentProjects}
        isScanning={isScanning}
        scanProgress={scanProgress}
        theme={theme}
        onOpenFolder={onOpenFolder}
        onReopenProject={onReopenProject}
        onRemoveProject={onRemoveProject}
        onTriggerScan={onTriggerScan}
        onCancelScan={onCancelScan}
        onToggleTheme={onToggleTheme}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      {isScanning && (
        <PipelineProgress
          stage={
            scanProgress?.stage === "parsing"
              ? "parse"
              : scanProgress?.stage === "analyzing"
              ? "analyze"
              : "scan"
          }
          filesProcessed={scanProgress?.files_scanned || 0}
          currentFile={scanProgress?.current_file}
          onCancel={onCancelScan}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <NavRail
          activeView={activeView}
          onSelectView={onSelectView}
          isCollapsed={isNavCollapsed}
          onToggleCollapse={() => setIsNavCollapsed((prev) => !prev)}
        />

        <main className="flex-1 min-w-0 flex overflow-hidden bg-canvas">
          {children}
        </main>

        <InspectorPanel
          isOpen={inspectorOpen}
          onToggle={onToggleInspector}
          width={inspectorWidth}
          onResize={onResizeInspector}
          selectedFile={selectedFile}
          selectedSymbol={selectedSymbol}
          selectedDiagramElement={selectedDiagramElement}
          onClearDiagramElement={onClearDiagramElement}
          onSelectSymbol={onSelectSymbol}
          onNavigateToSource={onNavigateToSource}
          onTriggerScan={onTriggerScan}
        />
      </div>

      <StatusBar
        currentProject={currentProject}
        files={files}
        isScanning={isScanning}
      />
    </div>
  );
};

