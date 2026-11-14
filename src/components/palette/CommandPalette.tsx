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
} from "lucide-react";
import type { FileRecord, ViewType } from "@/types/ipc";

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
        } else {
          // Open handled externally
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
    { id: "apis", label: "Go to API Inventory", icon: <Network className="w-4 h-4" /> },
    { id: "database", label: "Go to Database Schema", icon: <Database className="w-4 h-4" /> },
    { id: "intelligence", label: "Go to Code Intelligence", icon: <Code2 className="w-4 h-4" /> },
    { id: "security", label: "Go to Security & Risk", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "reports", label: "Go to Engineering Reports", icon: <FileBarChart className="w-4 h-4" /> },
    { id: "documentation", label: "Go to Documentation", icon: <BookOpen className="w-4 h-4" /> },
  ];

  const filteredNav = navigationCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredFiles = files
    .filter((f) => f.relative_path.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24 select-none">
      <div className="w-[540px] bg-surface border border-border-default shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[460px]">
        {/* Input */}
        <div className="h-11 border-b border-border-default px-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-text-primary placeholder:text-text-muted text-body outline-none"
          />
          <kbd className="text-micro font-mono bg-subtle px-1.5 py-0.5 rounded border border-border-subtle text-text-muted">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="flex-1 overflow-y-auto p-1.5 text-meta">
          {/* Quick Actions */}
          <div className="px-2 py-1 text-micro font-mono text-text-muted uppercase tracking-wider">
            Actions
          </div>
          <button
            onClick={() => {
              onClose();
              onOpenFolder();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-left"
          >
            <FolderOpen className="w-4 h-4 text-accent" />
            <span>Open Project Folder...</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onTriggerScan();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-left"
          >
            <RefreshCw className="w-4 h-4 text-text-muted" />
            <span>Re-scan Repository</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onToggleTheme();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-left"
          >
            <Sun className="w-4 h-4 text-text-muted" />
            <span>Toggle Dark/Light Theme</span>
          </button>

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <>
              <div className="px-2 py-1 mt-2 text-micro font-mono text-text-muted uppercase tracking-wider">
                Navigation
              </div>
              {filteredNav.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    onClose();
                    onSelectView(cmd.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-left"
                >
                  <span className="text-text-muted">{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </button>
              ))}
            </>
          )}

          {/* Files */}
          {filteredFiles.length > 0 && (
            <>
              <div className="px-2 py-1 mt-2 text-micro font-mono text-text-muted uppercase tracking-wider">
                Files
              </div>
              {filteredFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    onClose();
                    onSelectView("explorer");
                    onSelectFile(f);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-hover text-text-primary text-left group"
                >
                  <span className="truncate">{f.relative_path}</span>
                  <span className="text-micro font-mono text-text-muted">
                    {f.line_count > 0 ? `${f.line_count}L` : ""}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
