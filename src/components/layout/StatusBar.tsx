import React from "react";
import { HardDrive, CheckCircle2 } from "lucide-react";
import type { FileRecord, Project } from "@/types/ipc";

interface StatusBarProps {
  currentProject: Project | null;
  files: FileRecord[];
  isScanning: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  currentProject,
  files,
  isScanning,
}) => {
  const totalLines = files.reduce((acc, f) => acc + f.line_count, 0);
  const displayPath = currentProject
    ? currentProject.root_path.replace(/^(\\\\\?\\|\/\/\?\/)/, "")
    : "No project open";

  return (
    <footer className="h-6 bg-surface border-t border-border-default px-3 flex items-center justify-between text-caption font-sans text-text-muted select-none flex-shrink-0 z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-text-muted" />
          <span className="font-mono" title={displayPath}>{displayPath}</span>
        </div>

        {currentProject && (
          <>
            <span className="text-border-strong">•</span>
            <span>{files.length.toLocaleString()} files</span>
            <span className="text-border-strong">•</span>
            <span>{totalLines.toLocaleString()} lines</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isScanning ? (
          <span className="text-accent animate-pulse">Analyzing codebase...</span>
        ) : (
          <div className="flex items-center gap-1 text-status-success-text font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>Offline Analysis Engine</span>
          </div>
        )}
        <span className="text-border-strong">•</span>
        <span>BuildBuddy v0.1.0</span>
      </div>
    </footer>
  );
};

