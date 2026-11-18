import React, { useState, useCallback } from "react";
import {
  FolderOpen,
  Clock,
  ShieldCheck,
  ArrowRight,
  FolderGit2,
  X,
  GitGraph,
  Layers,
  Code2,
  FileSearch,
} from "lucide-react";
import type { Project } from "@/types/ipc";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Kbd } from "@/components/ui/Kbd";

export interface WelcomeViewProps {
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  onRemoveProject?: (projectId: number) => void;
  recentProjects: Project[];
}

const CAPABILITY_CARDS = [
  {
    icon: <Layers className="w-4 h-4" strokeWidth={2} />,
    title: "Architecture Diagrams",
    desc: "Auto-generated HLD & LLD flow diagrams grounded in your actual AST.",
  },
  {
    icon: <GitGraph className="w-4 h-4" strokeWidth={2} />,
    title: "Dependency Graph",
    desc: "Visualize module imports, circular refs, and external package usage.",
  },
  {
    icon: <Code2 className="w-4 h-4" strokeWidth={2} />,
    title: "Code Intelligence",
    desc: "SQLite-indexed symbols — functions, classes, interfaces, callers, callees.",
  },
  {
    icon: <FileSearch className="w-4 h-4" strokeWidth={2} />,
    title: "Smart Documentation",
    desc: "Generated docs from live AST evidence — not AI hallucinations.",
  },
];

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onOpenFolder,
  onReopenProject,
  onRemoveProject,
  recentProjects = [],
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

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

  return (
    <div
      data-testid="welcome-screen"
      className="flex-1 flex flex-col items-center justify-center p-8 md:p-14 overflow-y-auto bg-canvas text-text-primary select-none font-sans"
    >
      <div className="w-full max-w-3xl flex flex-col items-center text-center space-y-8">
        {/* Logo + Title */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-14 h-14 rounded-xl bg-surface border border-border-default flex items-center justify-center shadow-sm">
            <FolderGit2 className="w-7 h-7 text-accent" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-display font-semibold tracking-tight text-text-primary">
              BuildBuddy
            </h1>
            <p className="text-subheading text-text-secondary mt-1 max-w-xl leading-relaxed">
              Understand what you've built. Know how it works. Take control of your codebase.
            </p>
          </div>
        </div>

        {/* Capability cards */}
        <div className="grid grid-cols-2 gap-3 w-full text-left">
          {CAPABILITY_CARDS.map((cap) => (
            <div
              key={cap.title}
              className="flex items-start gap-3 px-4 py-3 rounded-md bg-surface border border-border-default"
            >
              <span className="mt-0.5 flex-shrink-0 text-accent">{cap.icon}</span>
              <div>
                <div className="text-body font-semibold text-text-primary leading-snug">{cap.title}</div>
                <div className="text-caption text-text-muted mt-0.5 leading-snug">{cap.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="welcome-dropzone"
          className={`w-full min-h-48 p-8 rounded-lg border-2 border-dashed transition-all duration-150 flex flex-col items-center justify-center gap-4 ${
            isDragOver
              ? "border-accent bg-accent-subtle/40 scale-[1.01]"
              : "border-border-default bg-surface/40 hover:bg-surface/70 hover:border-border-strong"
          }`}
        >
          <div className="flex flex-col items-center gap-1.5">
            <FolderOpen
              className={`w-9 h-9 transition-colors ${isDragOver ? "text-accent" : "text-text-muted"}`}
              strokeWidth={1.6}
            />
            <span className="text-subheading font-semibold text-text-primary">
              {isDragOver ? "Drop folder to analyze" : "Open a repository folder"}
            </span>
            <span className="text-caption text-text-muted">
              Drag & drop any local project directory, or use the dialog below
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={onOpenFolder}
              data-testid="welcome-open-btn"
              icon={<FolderOpen className="w-[17px] h-[17px]" />}
            >
              Open Project Folder...
            </Button>
            <div className="hidden sm:flex items-center gap-1 text-caption text-text-muted">
              <span>or press</span>
              <Kbd>Ctrl+O</Kbd>
            </div>
          </div>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="w-full text-left space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-caption font-semibold text-text-muted">
                <Clock className="w-3.5 h-3.5" />
                <span>Recent Projects</span>
              </div>
              {onRemoveProject && recentProjects.length > 1 && (
                <button
                  type="button"
                  onClick={() => recentProjects.forEach((p) => onRemoveProject(p.id))}
                  className="text-[11px] text-text-muted hover:text-danger transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
            <Card className="divide-y divide-border-subtle overflow-hidden p-0">
              {recentProjects.map((project) => (
                <div
                  key={project.id || project.root_path}
                  data-testid="welcome-recent-item"
                  className="group/item w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors duration-150"
                >
                  <button
                    type="button"
                    onClick={() => onReopenProject(project.root_path)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left focus:outline-none"
                  >
                    <FolderGit2
                      className="w-4 h-4 text-text-muted flex-shrink-0 group-hover/item:text-accent transition-colors"
                      strokeWidth={2}
                    />
                    <div className="min-w-0">
                      <div className="text-body font-semibold text-text-primary truncate">
                        {project.name}
                      </div>
                      <div className="text-caption font-mono text-text-muted truncate">
                        {project.root_path}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {onRemoveProject && (
                      <button
                        type="button"
                        title="Remove from recent projects"
                        aria-label={`Remove ${project.name} from recent projects`}
                        data-testid={`remove-project-${project.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveProject(project.id);
                        }}
                        className="p-1.5 rounded hover:bg-elevated text-text-muted hover:text-danger opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition-all duration-150 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onReopenProject(project.root_path)}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="p-1 text-text-muted opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Local Analysis Assurance Note */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-surface border border-border-default text-caption text-text-secondary w-full">
          <ShieldCheck className="w-4 h-4 text-status-success-text flex-shrink-0" />
          <span>
            Analysis runs locally on this device. Parsing, indexes, and dependency intelligence do not require a network or LLM.
          </span>
        </div>
      </div>
    </div>
  );
};
