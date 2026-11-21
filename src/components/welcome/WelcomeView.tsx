import React, { useState, useCallback, useMemo } from "react";
import {
  FolderOpen,
  Clock,
  ArrowRight,
  X,
  Search,
  CheckCircle2,
} from "lucide-react";
import type { Project } from "@/types/ipc";
import { Button } from "@/components/ui/Button";

export interface WelcomeViewProps {
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  onRemoveProject?: (projectId: number) => void;
  recentProjects: Project[];
}

const SAMPLE_PROJECTS = [
  {
    name: "Full-Stack Web (React + Express)",
    path: "fixtures/arch-react-express",
  },
  {
    name: "FastAPI Microservice",
    path: "fixtures/arch-fastapi",
  },
];

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onOpenFolder,
  onReopenProject,
  onRemoveProject,
  recentProjects = [],
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const item = e.dataTransfer.files[0];
        const filePath = (item as unknown as { path?: string }).path;
        if (filePath) {
          onReopenProject(filePath);
          return;
        }
      }
      onOpenFolder();
    },
    [onOpenFolder, onReopenProject]
  );

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return recentProjects;
    const q = searchQuery.toLowerCase();
    return recentProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.root_path.toLowerCase().includes(q)
    );
  }, [recentProjects, searchQuery]);

  return (
    <div
      data-testid="welcome-screen"
      className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-y-auto bg-canvas text-text-primary select-none font-sans"
    >
      <div className="w-full max-w-xl flex flex-col space-y-6 my-auto">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden flex-shrink-0">
            <img src="/app-icon.png" alt="BuildBuddy Logo" className="w-full h-full object-contain rounded-2xl" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              BuildBuddy
            </h1>
            <p className="text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
              Understand what you've built. Know how it works. Take control of your codebase.
            </p>
          </div>
        </div>

        {/* Dropzone Hero */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="welcome-dropzone"
          className={`w-full p-6 rounded-lg border border-dashed transition-all duration-150 flex flex-col items-center justify-center text-center gap-3 ${
            isDragOver
              ? "border-border-strong bg-hover scale-[1.01]"
              : "border-border-default bg-surface hover:border-border-strong"
          }`}
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-text-primary">
              {isDragOver ? "Drop directory to analyze" : "Open a repository"}
            </span>
            <span className="text-xs text-text-muted">
              Drag and drop any project folder, or browse your local disk.
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="primary"
              size="md"
              onClick={onOpenFolder}
              data-testid="welcome-open-btn"
              icon={<FolderOpen className="w-4 h-4" />}
            >
              Open Project Folder...
            </Button>
          </div>
        </div>

        {/* Sample Fixtures */}
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <span>Try a sample:</span>
          {SAMPLE_PROJECTS.map((sample) => (
            <button
              key={sample.path}
              type="button"
              onClick={() => onReopenProject(sample.path)}
              className="px-2 py-0.5 rounded border border-border-default bg-surface hover:bg-hover hover:text-text-primary text-text-secondary transition-colors cursor-pointer text-xs flex items-center gap-1"
            >
              <span>{sample.name}</span>
              <ArrowRight className="w-3 h-3 text-text-muted" />
            </button>
          ))}
        </div>

        {/* Recent Workspaces */}
        {recentProjects.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border-default">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span>Recent Projects</span>
                <span className="text-[11px] text-text-muted font-mono">({recentProjects.length})</span>
              </div>

              {recentProjects.length > 2 && (
                <div className="relative w-40">
                  <Search className="w-3 h-3 text-text-muted absolute left-2 top-2" />
                  <input
                    type="text"
                    placeholder="Filter projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-7 pl-6 pr-2 bg-surface border border-border-default rounded text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="rounded-md border border-border-default bg-surface divide-y divide-border-subtle max-h-56 overflow-y-auto">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-hover transition-colors group cursor-pointer text-left"
                >
                  <button
                    type="button"
                    onClick={() => onReopenProject(project.root_path)}
                    className="flex-1 flex flex-col items-start min-w-0 text-left focus:outline-none"
                  >
                    <span className="text-xs font-medium text-text-primary group-hover:text-text-primary transition-colors truncate w-full">
                      {project.name}
                    </span>
                    <span className="text-[11px] text-text-muted font-mono truncate w-full">
                      {project.root_path.replace(/^(\\\\\?\\|\/\/\?\/)/, "")}
                    </span>
                  </button>

                  {onRemoveProject && (
                    <button
                      type="button"
                      data-testid={`remove-project-${project.id}`}
                      title="Remove from recent"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveProject(project.id);
                      }}
                      className="p-1 rounded text-text-muted hover:text-status-danger-text opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Minimal Offline Guarantee Footer */}
        <div className="flex items-center justify-center gap-3 text-[11px] text-text-muted pt-2">
          <div className="flex items-center gap-1 text-status-success-text">
            <CheckCircle2 className="w-3 h-3" />
            <span>Analysis runs locally on this device</span>
          </div>
          <span>•</span>
          <span>Read-only inspection</span>
          <span>•</span>
          <span>Zero telemetry</span>
        </div>
      </div>
    </div>
  );
};
