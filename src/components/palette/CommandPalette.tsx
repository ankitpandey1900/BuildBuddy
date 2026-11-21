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
  Code,
} from "lucide-react";
import type { FileRecord, ViewType, SymbolRecord } from "@/types/ipc";
import { Kbd } from "@/components/ui/Kbd";
import { Badge } from "@/components/ui/Badge";
import { listSymbols } from "@/lib/tauri";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileRecord[];
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  onOpenFolder: () => void;
  onTriggerScan: () => void;
  onToggleTheme: () => void;
  onSelectFile: (file: FileRecord) => void;
  projectId?: number;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialSymbols?: SymbolRecord[];
}

interface PaletteItem {
  id: string;
  type: "action" | "navigation" | "file" | "symbol";
  label: string;
  sublabel?: string;
  badge?: string;
  icon: React.ReactNode;
  onSelect: () => void;
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
  projectId,
  onNavigateToFileLine,
  initialSymbols = [],
}) => {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolRecord[]>(initialSymbols);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSymbols(initialSymbols);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialSymbols]);

  // Debounced symbol search via local SQLite FTS5
  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen) return;

    if (initialSymbols.length > 0) {
      const filtered = initialSymbols.filter(
        (s) =>
          s.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          s.file_path.toLowerCase().includes(trimmed.toLowerCase())
      );
      setSymbols(filtered.slice(0, 8));
      return;
    }

    if (trimmed.length < 2 || !projectId) {
      setSymbols([]);
      return;
    }

    const timer = setTimeout(() => {
      listSymbols(projectId, { fts_query: trimmed, limit: 8 })
        .then((res) => {
          setSymbols(res || []);
        })
        .catch(() => {
          setSymbols([]);
        });
    }, 120);

    return () => clearTimeout(timer);
  }, [query, isOpen, projectId, initialSymbols]);

  // Build unified items list for seamless keyboard navigation
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
    .slice(0, 6);

  // Flattened items for arrow-key navigation
  const allItems: PaletteItem[] = [];

  // Actions (when query matches or is empty)
  if (!query.trim() || "open project folder".includes(query.toLowerCase())) {
    allItems.push({
      id: "action-open",
      type: "action",
      label: "Open Project Folder...",
      icon: <FolderOpen className="w-4 h-4 text-text-muted" />,
      onSelect: () => {
        onClose();
        onOpenFolder();
      },
    });
  }
  if (!query.trim() || "re-scan repository".includes(query.toLowerCase())) {
    allItems.push({
      id: "action-rescan",
      type: "action",
      label: "Re-scan Repository",
      icon: <RefreshCw className="w-4 h-4 text-text-muted" />,
      onSelect: () => {
        onClose();
        onTriggerScan();
      },
    });
  }
  if (!query.trim() || "toggle dark light theme".includes(query.toLowerCase())) {
    allItems.push({
      id: "action-theme",
      type: "action",
      label: "Toggle Dark / Light Theme",
      icon: <Sun className="w-4 h-4 text-text-muted" />,
      onSelect: () => {
        onClose();
        onToggleTheme();
      },
    });
  }

  // Navigation commands
  filteredNav.forEach((cmd) => {
    allItems.push({
      id: `nav-${cmd.id}`,
      type: "navigation",
      label: cmd.label,
      icon: <span className="text-text-muted">{cmd.icon}</span>,
      onSelect: () => {
        onClose();
        onSelectView(cmd.id);
      },
    });
  });

  // Matching symbols
  symbols.forEach((sym) => {
    allItems.push({
      id: `sym-${sym.id}-${sym.name}`,
      type: "symbol",
      label: sym.name,
      sublabel: `${sym.file_path}:${sym.start_line}`,
      badge: sym.kind,
      icon: <Code className="w-3.5 h-3.5 text-text-muted" />,
      onSelect: () => {
        onClose();
        onNavigateToFileLine?.(sym.file_path, sym.start_line);
      },
    });
  });

  // Matching files
  filteredFiles.forEach((file) => {
    allItems.push({
      id: `file-${file.id}`,
      type: "file",
      label: file.relative_path,
      sublabel: `${file.line_count} lines`,
      icon: <FileCode className="w-4 h-4 text-text-muted flex-shrink-0" />,
      onSelect: () => {
        onClose();
        onSelectFile(file);
      },
    });
  });

  // Keep index within bounds
  useEffect(() => {
    if (selectedIndex >= allItems.length) {
      setSelectedIndex(Math.max(0, allItems.length - 1));
    }
  }, [allItems.length, selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
      if (!isOpen || allItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = allItems[selectedIndex];
        if (selected) {
          selected.onSelect();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, allItems, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center pt-20 px-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="command-palette-backdrop"
    >
      <div
        className="w-full max-w-[580px] bg-surface border border-border-default shadow-modal rounded-lg overflow-hidden flex flex-col max-h-[500px] font-sans animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="h-11 border-b border-border-default px-3.5 flex items-center gap-2.5 bg-elevated/40">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, files, or symbols (e.g. handleAuth, UserTable)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-text-primary placeholder:text-text-muted text-body outline-none font-sans"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Command, Symbol & File Groups */}
        <div className="flex-1 overflow-y-auto p-2 text-body space-y-1">
          {/* Quick Actions */}
          {allItems.some((item) => item.type === "action") && (
            <div>
              <div className="px-2 py-1 text-caption text-text-muted font-medium">Actions</div>
              {allItems
                .filter((item) => item.type === "action")
                .map((item) => {
                  const globalIdx = allItems.findIndex((x) => x.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.onSelect}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-left cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? "bg-neutral-800 text-white dark:bg-[#27272a] dark:text-white font-medium"
                          : "hover:bg-hover text-text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {item.id === "action-open" && <Kbd>Ctrl+O</Kbd>}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <div className="border-t border-border-subtle pt-1 mt-1">
              <div className="px-2 py-1 text-caption text-text-muted font-medium">Views & Navigation</div>
              {allItems
                .filter((item) => item.type === "navigation")
                .map((item) => {
                  const globalIdx = allItems.findIndex((x) => x.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.onSelect}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-left cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? "bg-neutral-800 text-white dark:bg-[#27272a] dark:text-white font-medium"
                          : "hover:bg-hover text-text-primary"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Symbols & Functions (From FTS5 Index) */}
          {symbols.length > 0 && (
            <div className="border-t border-border-subtle pt-1 mt-1" data-testid="command-palette-symbols">
              <div className="px-2 py-1 text-caption text-text-muted font-medium flex items-center justify-between">
                <span>Symbols & Definitions</span>
                <span className="text-[11px] font-mono text-text-muted font-normal">{symbols.length} found</span>
              </div>
              {allItems
                .filter((item) => item.type === "symbol")
                .map((item) => {
                  const globalIdx = allItems.findIndex((x) => x.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.onSelect}
                      data-testid={`symbol-result-${item.label}`}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-left cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? "bg-neutral-800 text-white dark:bg-[#27272a] dark:text-white font-medium"
                          : "hover:bg-hover text-text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {item.icon}
                        <span className="font-mono text-body truncate font-semibold">
                          {item.label}
                        </span>
                        {item.badge && (
                          <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                      <span className="font-mono text-caption text-text-muted ml-3 truncate max-w-[200px] text-right">
                        {item.sublabel}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          {/* File Results */}
          {filteredFiles.length > 0 && (
            <div className="border-t border-border-subtle pt-1 mt-1">
              <div className="px-2 py-1 text-caption text-text-muted font-medium">Matching Files</div>
              {allItems
                .filter((item) => item.type === "file")
                .map((item) => {
                  const globalIdx = allItems.findIndex((x) => x.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.onSelect}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-left cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? "bg-neutral-800 text-white dark:bg-[#27272a] dark:text-white font-medium"
                          : "hover:bg-hover text-text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.icon}
                        <span className="truncate font-mono text-caption text-text-secondary">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-caption text-text-muted ml-2 flex-shrink-0 font-sans">
                        {item.sublabel}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          {allItems.length === 0 && (
            <div className="py-8 text-center text-caption text-text-muted font-sans">
              No matching commands, files, or symbols found for &quot;{query}&quot;
            </div>
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
            <span>Jump to Code</span>
            <Kbd>↵</Kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
