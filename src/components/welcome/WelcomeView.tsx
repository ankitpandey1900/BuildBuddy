import React, { useState, useCallback } from "react";
import { FolderOpen, Clock, ShieldCheck, HardDrive, ArrowRight, FolderGit2 } from "lucide-react";
import type { Project } from "@/types/ipc";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Kbd } from "@/components/ui/Kbd";

export interface WelcomeViewProps {
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  recentProjects: Project[];
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onOpenFolder,
  onReopenProject,
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
      className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto bg-canvas text-text-primary select-none font-sans"
    >
      <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-8 animate-in fade-in duration-150">
        {/* App Title & Purpose */}
        <div className="flex flex-col items-center space-y-2.5">
          <div className="w-12 h-12 rounded-lg bg-surface border border-border-default flex items-center justify-center shadow-xs mb-1">
            <FolderGit2 className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-display font-semibold tracking-tight text-text-primary">
            BuildBuddy
          </h1>
          <p className="text-subheading text-text-secondary max-w-lg leading-relaxed">
            Understand what you've built. Know how it works. Take control of your codebase.
          </p>
        </div>

        {/* Drag-and-Drop Area & Primary Open Button */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="welcome-dropzone"
          className={`w-full p-8 rounded-lg border-2 border-dashed transition-all duration-150 flex flex-col items-center justify-center gap-4 ${
            isDragOver
              ? "border-accent bg-accent-subtle/50 scale-[1.01]"
              : "border-border-default bg-surface/50 hover:bg-surface/80"
          }`}
        >
          <div className="flex flex-col items-center gap-1.5">
            <FolderOpen className={`w-8 h-8 transition-colors ${isDragOver ? "text-accent" : "text-text-muted"}`} />
            <span className="text-body font-medium text-text-primary">
              {isDragOver ? "Drop folder to analyze" : "Open a repository folder"}
            </span>
            <span className="text-caption text-text-muted">
              Drag and drop any local project directory here, or browse with dialog
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <Button
              variant="primary"
              size="md"
              onClick={onOpenFolder}
              data-testid="welcome-open-btn"
              icon={<FolderOpen className="w-4 h-4" />}
            >
              Open Project Folder...
            </Button>
            <div className="hidden sm:flex items-center gap-1 text-caption text-text-muted">
              <span>or press</span>
              <Kbd>Ctrl+O</Kbd>
            </div>
          </div>
        </div>

        {/* Recent Workspaces List */}
        {recentProjects.length > 0 && (
          <div className="w-full text-left space-y-2.5">
            <div className="flex items-center gap-1.5 px-1 text-caption font-medium text-text-muted">
              <Clock className="w-3.5 h-3.5" />
              <span>Recent Projects</span>
            </div>
            <Card className="divide-y divide-border-subtle overflow-hidden">
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.id || project.root_path}
                  onClick={() => onReopenProject(project.root_path)}
                  data-testid="welcome-recent-item"
                  className="w-full flex items-center justify-between p-3 hover:bg-hover transition-colors duration-150 text-left cursor-pointer group focus-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <HardDrive className="w-4 h-4 text-text-muted flex-shrink-0 group-hover:text-accent transition-colors" />
                    <div className="min-w-0">
                      <div className="text-body font-medium text-text-primary truncate">
                        {project.name}
                      </div>
                      <div className="text-caption font-mono text-text-muted truncate">
                        {project.root_path}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0" />
                </button>
              ))}
            </Card>
          </div>
        )}

        {/* Local Analysis Assurance Note */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-sm bg-subtle border border-border-default text-caption text-text-secondary">
          <ShieldCheck className="w-4 h-4 text-status-success-text flex-shrink-0" />
          <span>
            <strong>100% Local Analysis:</strong> Code parsing, AST generation, and dependency intelligence run entirely offline on this device.
          </span>
        </div>
      </div>
    </div>
  );
};
