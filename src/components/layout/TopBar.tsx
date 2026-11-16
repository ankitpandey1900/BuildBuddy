import React, { useState } from "react";
import {
  Folder,
  FolderOpen,
  ChevronDown,
  Sun,
  Moon,
  Search,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Project, ScanProgressPayload } from "@/types/ipc";

interface TopBarProps {
  currentProject: Project | null;
  recentProjects: Project[];
  isScanning: boolean;
  scanProgress: ScanProgressPayload | null;
  theme: "dark" | "light";
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  onTriggerScan: () => void;
  onCancelScan: () => void;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentProject,
  recentProjects,
  isScanning,
  scanProgress,
  theme,
  onOpenFolder,
  onReopenProject,
  onTriggerScan,
  onCancelScan,
  onToggleTheme,
  onOpenCommandPalette,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-10 bg-surface border-b border-border-default px-3 flex items-center justify-between select-none z-20 flex-shrink-0">
      {/* Left: Project Selector */}
      <div className="flex items-center gap-2 relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-hover text-text-primary text-body font-medium transition-colors border border-transparent hover:border-border-default focus-ring"
        >
          <Folder className="w-4 h-4 text-accent" />
          <span className="truncate max-w-[200px]">
            {currentProject ? currentProject.name : "Select Project..."}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-9 left-0 w-72 bg-surface border border-border-default shadow-lg rounded-md p-1 z-50 text-meta">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onOpenFolder();
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-sm hover:bg-hover text-text-primary mb-1 border-b border-border-subtle"
            >
              <FolderOpen className="w-4 h-4 text-accent" />
              <span>Open Project Folder...</span>
            </button>

            {recentProjects.length > 0 && (
              <>
                <div className="px-2 py-1 text-micro font-mono text-text-muted uppercase tracking-wider">
                  Recent Workspaces
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {recentProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setDropdownOpen(false);
                        onReopenProject(p.root_path);
                      }}
                      className="w-full flex flex-col items-start px-2 py-1 text-left rounded-sm hover:bg-hover text-text-primary group"
                    >
                      <span className="font-medium text-meta">{p.name}</span>
                      <span className="text-micro font-mono text-text-muted truncate w-full group-hover:text-text-secondary">
                        {p.root_path.replace(/^(\\\\\?\\|\/\/\?\/)/, "")}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Scan indicator */}
        {isScanning ? (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-accent/10 border border-accent/20 rounded-md text-caption text-accent-text font-mono">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>
              {scanProgress?.stage === "parsing"
                ? `Parsing... (${scanProgress.files_scanned} files)`
                : scanProgress?.stage === "analyzing"
                ? "Analyzing..."
                : scanProgress?.stage === "scanned"
                ? `Scanned ${scanProgress.files_scanned} files`
                : `Scanning... (${scanProgress ? scanProgress.files_scanned : 0} files)`}
            </span>
            <button
              onClick={onCancelScan}
              title="Cancel scan"
              className="hover:text-red-400 p-0.5"
            >
              <XCircle className="w-3 h-3" />
            </button>
          </div>
        ) : currentProject ? (
          <Button
            size="sm"
            variant="subtle"
            onClick={onTriggerScan}
            title="Re-scan project"
            icon={<RefreshCw className="w-3 h-3 text-text-muted" />}
          >
            Re-scan
          </Button>
        ) : null}
      </div>

      {/* Middle: Command Palette Quick Trigger */}
      <div className="flex-1 max-w-sm mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full h-7 px-2.5 flex items-center justify-between bg-canvas border border-border-default rounded-md text-meta text-text-muted hover:border-border-strong transition-colors focus-ring"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search files, commands...</span>
          </div>
          <kbd className="text-micro font-mono bg-subtle px-1.5 py-0.5 rounded border border-border-subtle text-text-muted">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Theme Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-md hover:bg-hover text-text-muted hover:text-text-primary transition-colors focus-ring"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
};

