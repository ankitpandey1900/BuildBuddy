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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import type { Project, ScanProgressPayload } from "@/types/ipc";

interface TopBarProps {
  currentProject: Project | null;
  recentProjects: Project[];
  isScanning: boolean;
  scanProgress: ScanProgressPayload | null;
  theme: "dark" | "light";
  onOpenFolder: () => void;
  onReopenProject: (path: string) => void;
  onRemoveProject?: (projectId: number) => void;
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
  onRemoveProject,
  onTriggerScan,
  onCancelScan,
  onToggleTheme,
  onOpenCommandPalette,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-12 bg-surface border-b border-border-default px-4 flex items-center justify-between select-none z-40 flex-shrink-0 relative w-full min-w-0">
      {/* Click outside backdrop when dropdown is open */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setDropdownOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left: Project Selector & Status */}
      <div className="flex items-center gap-2 relative z-50 min-w-0">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-body font-medium transition-colors duration-150 border border-transparent hover:border-border-default focus-ring cursor-pointer max-w-[280px] group"
        >
          <Folder className="w-[18px] h-[18px] text-text-muted group-hover:text-text-primary flex-shrink-0 transition-colors" strokeWidth={2} />
          <span className="truncate">
            {currentProject ? currentProject.name : "Select Project..."}
          </span>
          <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-10 left-0 w-80 bg-surface border border-border-default shadow-menu rounded-xl p-2 z-50 text-body font-sans">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onOpenFolder();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-hover text-text-primary mb-1 border-b border-border-subtle cursor-pointer transition-colors duration-150"
            >
              <FolderOpen className="w-4 h-4 text-text-muted" />
              <span className="font-medium text-xs">Open Project Folder...</span>
            </button>

            {recentProjects.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Recent Workspaces
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {recentProjects.map((p) => (
                    <div
                      key={p.id}
                      className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg hover:bg-hover text-text-primary group transition-colors duration-150 cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownOpen(false);
                          onReopenProject(p.root_path);
                        }}
                        className="flex-1 flex flex-col items-start min-w-0 text-left cursor-pointer focus:outline-none"
                      >
                        <span className="font-medium text-body truncate w-full">{p.name}</span>
                        <span className="text-caption text-text-muted truncate w-full group-hover:text-text-secondary font-mono">
                          {p.root_path.replace(/^(\\\\\?\\|\/\/\?\/)/, "")}
                        </span>
                      </button>
                      {onRemoveProject && (
                        <button
                          type="button"
                          title="Remove from recent workspaces"
                          aria-label={`Remove ${p.name} from recent workspaces`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveProject(p.id);
                          }}
                          className="p-1 rounded text-text-muted hover:text-danger hover:bg-surface opacity-0 group-hover:opacity-100 transition-all ml-1 flex-shrink-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Calm Offline Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-elevated/80 border border-border-subtle text-meta text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success-text" />
          <span>Offline</span>
        </div>

        {/* Scan / Analysis Status */}
        {isScanning ? (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-elevated border border-border-default rounded-md text-caption text-text-primary font-sans animate-in fade-in duration-150">
            <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0 text-status-success-text" />
            <span className="truncate max-w-[180px]">
              {scanProgress?.stage === "parsing"
                ? `Parsing (${scanProgress.files_scanned} files)`
                : scanProgress?.stage === "analyzing"
                ? "Analyzing dependencies"
                : scanProgress?.stage === "scanned"
                ? `Scanned ${scanProgress.files_scanned} files`
                : `Scanning (${scanProgress ? scanProgress.files_scanned : 0})`}
            </span>
            <button
              onClick={onCancelScan}
              title="Cancel scan"
              className="text-text-muted hover:text-status-danger-text p-0.5 rounded-sm transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : currentProject ? (
          <Button
            size="sm"
            variant="plain"
            onClick={onTriggerScan}
            title="Re-scan project"
            icon={<RefreshCw className="w-3 h-3 text-text-muted" />}
          >
            Re-scan
          </Button>
        ) : null}
      </div>

      {/* Middle: Command Palette Quick Trigger */}
      <div className="flex-1 max-w-md mx-2 sm:mx-6 min-w-0">
        <button
          onClick={onOpenCommandPalette}
          data-testid="topbar-search-trigger"
          className="w-full h-8 px-3 flex items-center justify-between bg-elevated/70 border border-border-default rounded-md text-body text-text-muted hover:border-border-strong hover:bg-elevated transition-colors duration-150 focus-ring cursor-pointer min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="text-text-secondary text-body truncate">Search files, commands...</span>
          </div>
          <Kbd className="flex-shrink-0">Ctrl+K</Kbd>
        </button>
      </div>

      {/* Right: Theme Toggle */}
      <div className="flex items-center gap-1 pr-1 flex-shrink-0">
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-hover text-text-muted hover:text-text-primary transition-colors duration-150 focus-ring cursor-pointer"
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
