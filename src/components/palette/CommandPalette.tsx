import React, { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  RefreshCw,
  Sun,
  Search,
  LayoutDashboard,
  FolderTree,
  GitGraph,
  Boxes,
  Network,
  Database,
  Code2,
  ShieldAlert,
  FileBarChart,
  BookOpen,
  FileCode,
} from "lucide-react";
import type { FileRecord, ViewType } from "@/types/ipc";
import { Kbd } from "@/components/ui/Kbd";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileRecord[];
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  onOpenFolder: () => void;
  onTriggerScan: () => void;
  onToggleTheme: () => void;
  onSelectFile: (file: FileRecord) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  files,
  onSelectView,
  onOpenFolder,
  onTriggerScan,
  onToggleTheme,
  onSelectFile,
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navigationCommands: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Go to Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "explorer", label: "Go to Repository Explorer", icon: <FolderTree className="w-4 h-4" /> },
    { id: "architecture", label: "Go to Architecture Diagrams", icon: <GitGraph className="w-4 h-4" /> },
    { id: "dependencies", label: "Go to Dependencies", icon: <Boxes className="w-4 h-4" /> },
    { id: "intelligence", label: "Go to Code Intelligence", icon: <Code2 className="w-4 h-4" /> },
    { id: "apis", label: "Go to API Inventory", icon: <Network className="w-4 h-4" /> },
    { id: "database", label: "Go to Database Schema", icon: <Database className="w-4 h-4" /> },
    { id: "documentation", label: "Go to Documentation", icon: <BookOpen className="w-4 h-4" /> },
    { id: "security", label: "Go to Security & Health", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "reports", label: "Go to Engineering Reports", icon: <FileBarChart className="w-4 h-4" /> },
  ];

  const filteredNav = navigationCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredFiles = files
    .filter((f) => f.relative_path.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-start justify-center pt-20 px-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="command-palette-backdrop"
    >
      <div
        className="w-full max-w-[560px] bg-surface border border-border-default shadow-modal rounded-lg overflow-hidden flex flex-col max-h-[480px] font-sans animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="h-11 border-b border-border-default px-3.5 flex items-center gap-2.5 bg-elevated/40">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-text-primary placeholder:text-text-muted text-body outline-none font-sans"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Command & File Groups */}
        <div className="flex-1 overflow-y-auto p-2 text-body">
          {/* Quick Actions */}
          <div className="px-2 py-1 text-caption text-text-muted font-medium">
            Actions
          </div>
          <button
            onClick={() => {
              onClose();
              onOpenFolder();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-left cursor-pointer transition-colors duration-150"
          >
            <div className="flex items-center gap-2.5">
              <FolderOpen className="w-4 h-4 text-text-muted" />
              <span>Open Project Folder...</span>
            </div>
            <Kbd>Ctrl+O</Kbd>
          </button>
          <button
            onClick={() => {
              onClose();
              onTriggerScan();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-left cursor-pointer transition-colors duration-150"
          >
            <RefreshCw className="w-4 h-4 text-text-muted" />
            <span>Re-scan Repository</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onToggleTheme();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-left cursor-pointer transition-colors duration-150"
          >
            <Sun className="w-4 h-4 text-text-muted" />
            <span>Toggle Dark / Light Theme</span>
          </button>

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <>
              <div className="px-2 py-1 mt-2 text-caption text-text-muted font-medium border-t border-border-subtle pt-2">
                Views & Navigation
              </div>
              {filteredNav.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    onClose();
                    onSelectView(cmd.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-left cursor-pointer transition-colors duration-150"
                >
                  <span className="text-text-muted">{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </button>
              ))}
            </>
          )}

          {/* File Results */}
          {filteredFiles.length > 0 && (
            <>
              <div className="px-2 py-1 mt-2 text-caption text-text-muted font-medium border-t border-border-subtle pt-2">
                Matching Files
              </div>
              {filteredFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => {
                    onClose();
                    onSelectFile(file);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm hover:bg-hover text-text-primary text-left cursor-pointer transition-colors duration-150"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <span className="truncate font-mono text-caption text-text-secondary">
                      {file.relative_path}
                    </span>
                  </div>
                  <span className="text-caption text-text-muted ml-2 flex-shrink-0 font-sans">
                    {file.line_count} lines
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="h-8 border-t border-border-subtle px-3 flex items-center justify-between text-caption text-text-muted bg-elevated/20">
          <div className="flex items-center gap-2">
            <span>Navigate</span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </div>
          <div className="flex items-center gap-2">
            <span>Select</span>
            <Kbd>↵</Kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
