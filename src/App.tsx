import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExplorerView } from "@/components/explorer/ExplorerView";
import { DependenciesView } from "@/components/dependencies/DependenciesView";
import { CodeIntelligenceView } from "@/components/intelligence/CodeIntelligenceView";
import { OverviewView } from "@/components/overview/OverviewView";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { WelcomeView } from "@/components/welcome/WelcomeView";
import { useProjectState } from "@/stores/projectStore";
import { useUIState } from "@/stores/uiStore";
import type { SelectedDiagramElement } from "@/types/diagram";
import { ApiView } from "@/components/api/ApiView";
import { DatabaseView } from "@/components/database/DatabaseView";
import { FindingsView } from "@/components/findings/FindingsView";
import { DocumentationView } from "@/components/docs/DocumentationView";
import { ReportsView } from "@/components/reports/ReportsView";

// Lazy-load Architecture screen with dynamic import() to keep main bundle lean
const ArchitectureView = React.lazy(() =>
  import("@/components/architecture/ArchitectureView").then((m) => ({
    default: m.ArchitectureView,
  }))
);

export const App: React.FC = () => {
  const project = useProjectState();
  const ui = useUIState();
  const [selectedDiagramElement, setSelectedDiagramElement] = useState<SelectedDiagramElement | null>(null);

  const handleSelectDiagramElement = (el: SelectedDiagramElement | null) => {
    setSelectedDiagramElement(el);
    if (el && !ui.inspectorOpen) {
      ui.setInspectorOpen(true);
    }
  };

  const renderActiveView = () => {
    switch (ui.activeView) {
      case "explorer":
        return (
          <ExplorerView
            files={project.files}
            selectedFile={project.selectedFile}
            fileContent={project.fileContent}
            isLoadingContent={project.isLoadingContent}
            searchQuery={project.searchQuery}
            onSearchChange={project.setSearchQuery}
            languageFilter={project.languageFilter}
            onLanguageFilterChange={project.setLanguageFilter}
            onSelectFile={project.selectFile}
            onOpenFolder={project.openFolder}
            theme={ui.theme}
            targetLine={project.targetLine}
          />
        );
      case "overview":
        return (
          <OverviewView
            projectId={project.currentProject?.id}
            currentProject={project.currentProject}
            lastAnalysisRunId={project.lastAnalysisRunId}
            isScanning={project.isScanning}
            scanProgress={project.scanProgress}
            onNavigateToView={(view) => ui.setActiveView(view)}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
            onFilterFilesByLanguage={(lang) => {
              project.setLanguageFilter(lang);
              ui.setActiveView("explorer");
            }}
            onOpenFolder={project.openFolder}
            onReanalyze={project.triggerScan}
          />
        );
      case "architecture":
        return (
          <React.Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center font-mono text-xs text-text-muted">
                Loading Architecture Screen...
              </div>
            }
          >
            <ArchitectureView
              defaultDiagramType="system_flow"
              projectId={project.currentProject?.id}
              projectRootPath={project.currentProject?.root_path}
              theme={ui.theme}
              onSelectDiagramElement={handleSelectDiagramElement}
              onRunPipeline={project.triggerScan}
              onTriggerScan={project.triggerScan}
              lastAnalysisRunId={project.lastAnalysisRunId}
              onNavigateToSource={(filePath, line) => {
                project.openFileAtLine(filePath, line);
                ui.setActiveView("explorer");
              }}
            />
          </React.Suspense>
        );
      case "dependencies":
        return (
          <DependenciesView
            currentProject={project.currentProject}
            lastAnalysisRunId={project.lastAnalysisRunId}
            onSelectFile={(filePath) => {
              const match = project.files.find((f) => f.relative_path === filePath);
              if (match) {
                project.selectFile(match);
                ui.setActiveView("explorer");
              }
            }}
          />
        );
      case "apis":
        return (
          <ApiView
            projectId={project.currentProject?.id}
            lastAnalysisRunId={project.lastAnalysisRunId}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
          />
        );
      case "database":
        return (
          <DatabaseView
            projectId={project.currentProject?.id}
            lastAnalysisRunId={project.lastAnalysisRunId}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
          />
        );
      case "intelligence":
        return (
          <CodeIntelligenceView
            projectId={project.currentProject?.id}
            lastAnalysisRunId={project.lastAnalysisRunId}
            selectedSymbol={project.selectedSymbol}
            onSelectSymbol={project.setSelectedSymbol}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
          />
        );
      case "security":
        return (
          <FindingsView projectId={project.currentProject?.id} onNavigateToFileLine={(filePath, line) => { project.openFileAtLine(filePath, line); ui.setActiveView("explorer"); }} />
        );
      case "reports":
        return (
          <ReportsView
            projectId={project.currentProject?.id}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
            onNavigateToDocs={(_docType) => {
              ui.setActiveView("documentation");
            }}
          />
        );
      case "documentation":
        return (
          <DocumentationView
            projectId={project.currentProject?.id}
            lastAnalysisRunId={project.lastAnalysisRunId}
            onNavigateToFileLine={(filePath, line) => {
              project.openFileAtLine(filePath, line);
              ui.setActiveView("explorer");
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <AppShell
        currentProject={project.currentProject}
        recentProjects={project.recentProjects}
        files={project.files}
        selectedFile={project.selectedFile}
        selectedSymbol={project.selectedSymbol}
        selectedDiagramElement={selectedDiagramElement}
        onClearDiagramElement={() => setSelectedDiagramElement(null)}
        isScanning={project.isScanning}
        scanProgress={project.scanProgress}
        activeView={ui.activeView}
        theme={ui.theme}
        inspectorOpen={ui.inspectorOpen}
        inspectorWidth={ui.inspectorWidth}
        onResizeInspector={ui.setInspectorWidth}
        onSelectView={ui.setActiveView}
        onOpenFolder={project.openFolder}
        onReopenProject={project.reopenProject}
        onRemoveProject={project.removeRecentProject}
        onTriggerScan={project.triggerScan}
        onCancelScan={project.abortScan}
        onToggleTheme={ui.toggleTheme}
        onToggleInspector={ui.toggleInspector}
        onOpenCommandPalette={() => ui.setCommandPaletteOpen(true)}
        onSelectSymbol={project.setSelectedSymbol}
        onNavigateToSource={(filePath, line) => {
          project.openFileAtLine(filePath, line);
          ui.setActiveView("explorer");
        }}
      >
        {!project.currentProject ? (
          <WelcomeView
            onOpenFolder={project.openFolder}
            onReopenProject={project.reopenProject}
            onRemoveProject={project.removeRecentProject}
            recentProjects={project.recentProjects}
          />
        ) : (
          renderActiveView()
        )}
      </AppShell>

      <CommandPalette
        isOpen={ui.commandPaletteOpen}
        onClose={() => ui.setCommandPaletteOpen(false)}
        files={project.files}
        activeView={ui.activeView}
        onSelectView={ui.setActiveView}
        onOpenFolder={project.openFolder}
        onTriggerScan={project.triggerScan}
        onToggleTheme={ui.toggleTheme}
        onSelectFile={project.selectFile}
      />
    </>
  );
};

export default App;

