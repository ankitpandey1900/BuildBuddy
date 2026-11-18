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
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-body font-medium transition-colors duration-150 border border-transparent hover:border-border-default focus-ring cursor-pointer max-w-[280px]"
        >
          <Folder className="w-[18px] h-[18px] text-accent flex-shrink-0" strokeWidth={2.2} />
          <span className="truncate">
            {currentProject ? currentProject.name : "Select Project..."}
          </span>
          <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-10 left-0 w-80 bg-surface border border-border-default shadow-menu rounded-md p-1.5 z-50 text-body font-sans">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onOpenFolder();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-sm hover:bg-hover text-text-primary mb-1 border-b border-border-subtle cursor-pointer transition-colors duration-150"
            >
              <FolderOpen className="w-4 h-4 text-accent" />
              <span className="font-medium">Open Project Folder...</span>
            </button>

            {recentProjects.length > 0 && (
              <>
                <div className="px-2.5 py-1 text-caption text-text-muted font-medium">
                  Recent Workspaces
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {recentProjects.map((p) => (
                    <div
                      key={p.id}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-sm hover:bg-hover text-text-primary group transition-colors duration-150 cursor-pointer"
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
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-elevated/70 border border-border-subtle text-meta text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success-text" />
          <span>Offline</span>
        </div>

        {/* Scan / Analysis Status */}
        {isScanning ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent-subtle border border-accent/25 rounded-sm text-caption text-accent-text font-sans animate-in fade-in duration-150">
            <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
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
              className="hover:text-status-danger-text p-0.5 rounded-sm transition-colors"
            >
              <XCircle className="w-3 h-3" />
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
      <div className="flex-1 max-w-md mx-6">
        <button
          onClick={onOpenCommandPalette}
          data-testid="topbar-search-trigger"
          className="w-full h-8 px-3 flex items-center justify-between bg-elevated/70 border border-border-default rounded-sm text-body text-text-muted hover:border-border-strong hover:bg-elevated transition-colors duration-150 focus-ring cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span className="text-secondary text-body">Search files, commands...</span>
          </div>
          <Kbd>Ctrl+K</Kbd>
        </button>
      </div>

      {/* Right: Theme Toggle (No clipped edges) */}
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
