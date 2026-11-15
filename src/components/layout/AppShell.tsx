import React from "react";
import { TopBar } from "./TopBar";
import { NavRail } from "./NavRail";
import { InspectorPanel } from "./InspectorPanel";
import { StatusBar } from "./StatusBar";
import type { FileRecord, Project, ScanProgressPayload, SymbolRecord, ViewType } from "@/types/ipc";
import type { SelectedDiagramElement } from "@/types/diagram";

interface AppShellProps {
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
  onSelectView: (view: ViewType) => void;
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
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
  onSelectView,
  onOpenFolder,
  onReopenProject,
  onTriggerScan,
  onCancelScan,
  onToggleTheme,
  onToggleInspector,
  onOpenCommandPalette,
  onSelectSymbol,
  onNavigateToSource,
  children,
}) => {
  return (
    <div className="h-screen w-screen flex flex-col bg-canvas text-text-primary overflow-hidden font-sans">
      <TopBar
        currentProject={currentProject}
        recentProjects={recentProjects}
        isScanning={isScanning}
        scanProgress={scanProgress}
        theme={theme}
        onOpenFolder={onOpenFolder}
        onReopenProject={onReopenProject}
        onTriggerScan={onTriggerScan}
        onCancelScan={onCancelScan}
        onToggleTheme={onToggleTheme}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      <div className="flex-1 flex overflow-hidden">
        <NavRail activeView={activeView} onSelectView={onSelectView} />

        <main className="flex-1 flex overflow-hidden bg-canvas">
          {children}
        </main>

        <InspectorPanel
          isOpen={inspectorOpen}
          onToggle={onToggleInspector}
          width={inspectorWidth}
          selectedFile={selectedFile}
          selectedSymbol={selectedSymbol}
          selectedDiagramElement={selectedDiagramElement}
          onClearDiagramElement={onClearDiagramElement}
          onSelectSymbol={onSelectSymbol}
          onNavigateToSource={onNavigateToSource}
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

