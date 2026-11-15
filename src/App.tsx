import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExplorerView } from "@/components/explorer/ExplorerView";
import { DependenciesView } from "@/components/dependencies/DependenciesView";
import { CodeIntelligenceView } from "@/components/intelligence/CodeIntelligenceView";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { useProjectState } from "@/stores/projectStore";
import { useUIState } from "@/stores/uiStore";
import { LayoutDashboard, GitGraph, Network, Database, ShieldAlert, FileBarChart, BookOpen } from "lucide-react";

export const App: React.FC = () => {
  const project = useProjectState();
  const ui = useUIState();

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
          <PlaceholderView
            title="Overview"
            icon={<LayoutDashboard className="w-8 h-8 text-accent" />}
            description="System metrics, detected entry points, and high-level architectural summary."
            badge="Phase 3 / Task 8"
          />
        );
      case "architecture":
        return (
          <PlaceholderView
            title="Architecture Diagrams"
            icon={<GitGraph className="w-8 h-8 text-accent" />}
            description="Interactive dependency graphs and layered architectural layout via React Flow and ELK.js."
            badge="Phase 4 / Task 7"
          />
        );
      case "dependencies":
        return (
          <DependenciesView
            currentProject={project.currentProject}
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
          <PlaceholderView
            title="API Endpoints"
            icon={<Network className="w-8 h-8 text-accent" />}
            description="HTTP routes, parameter schemas, controller mappings, and middleware analysis."
            badge="Phase 3"
          />
        );
      case "database":
        return (
          <PlaceholderView
            title="Database & Models"
            icon={<Database className="w-8 h-8 text-accent" />}
            description="Entity-relationship models, schema declarations, and query mapping."
            badge="Phase 3"
          />
        );
      case "intelligence":
        return (
          <CodeIntelligenceView
            projectId={project.currentProject?.id}
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
          <PlaceholderView
            title="Security & Health"
            icon={<ShieldAlert className="w-8 h-8 text-accent" />}
            description="Rule-based static findings: dead code, hardcoded secrets, and unsafe patterns."
            badge="Phase 3"
          />
        );
      case "reports":
        return (
          <PlaceholderView
            title="Engineering Reports"
            icon={<FileBarChart className="w-8 h-8 text-accent" />}
            description="Structured codebase health audits and technical debt metrics."
            badge="Phase 5"
          />
        );
      case "documentation":
        return (
          <PlaceholderView
            title="Documentation Engine"
            icon={<BookOpen className="w-8 h-8 text-accent" />}
            description="Deterministic HLD, LLD, and ADR workspace with markdown export."
            badge="Phase 5 / Task 8-9"
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
        isScanning={project.isScanning}
        scanProgress={project.scanProgress}
        activeView={ui.activeView}
        theme={ui.theme}
        inspectorOpen={ui.inspectorOpen}
        inspectorWidth={ui.inspectorWidth}
        onSelectView={ui.setActiveView}
        onOpenFolder={project.openFolder}
        onReopenProject={project.reopenProject}
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
        {renderActiveView()}
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

interface PlaceholderViewProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  badge: string;
}

const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  title,
  icon,
  description,
  badge,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted select-none">
      <div className="p-3 bg-surface border border-border-default rounded-lg mb-3">
        {icon}
      </div>
      <h2 className="text-heading font-semibold text-text-primary mb-1">{title}</h2>
      <p className="text-body text-text-secondary max-w-md mb-3">{description}</p>
      <span className="text-micro font-mono bg-subtle text-accent-text border border-border-default px-2 py-0.5 rounded">
        Planned for {badge}
      </span>
    </div>
  );
};

export default App;

