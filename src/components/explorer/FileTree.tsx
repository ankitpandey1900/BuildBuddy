import React, { useMemo, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, FolderPlus } from "lucide-react";
import type { FileRecord } from "@/types/ipc";
import { FileTreeNode, TreeNode } from "./FileTreeNode";

interface FileTreeProps {
  files: FileRecord[];
  selectedFile: FileRecord | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  languageFilter: string;
  onLanguageFilterChange: (lang: string) => void;
  onSelectFile: (file: FileRecord) => void;
  onOpenFolder: () => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFile,
  searchQuery,
  onSearchChange,
  languageFilter,
  onLanguageFilterChange,
  onSelectFile,
  onOpenFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["src"]));

  const toggleExpand = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Convert flat files into hierarchical tree
  const treeData = useMemo(() => {
    const root: TreeNode = { id: "root", name: "", path: "", isFolder: true, children: [] };

    for (const file of files) {
      const parts = file.relative_path.split("/");
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join("/");

        if (isLast) {
          current.children = current.children || [];
          current.children.push({
            id: currentPath,
            name: part,
            path: currentPath,
            isFolder: false,
            fileRecord: file,
          });
        } else {
          current.children = current.children || [];
          let folder = current.children.find((c) => c.isFolder && c.name === part);
          if (!folder) {
            folder = {
              id: currentPath,
              name: part,
              path: currentPath,
              isFolder: true,
              children: [],
            };
            current.children.push(folder);
          }
          current = folder;
        }
      }
    }

    // Sort folders first, then files
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isFolder === b.isFolder) {
          return a.name.localeCompare(b.name);
        }
        return a.isFolder ? -1 : 1;
      });
      for (const n of nodes) {
        if (n.children) sortNodes(n.children);
      }
    };

    if (root.children) sortNodes(root.children);
    return root.children || [];
  }, [files]);

  // Flatten visible nodes for virtualization
  const visibleRows = useMemo(() => {
    const rows: { node: TreeNode; depth: number }[] = [];

    const traverse = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({ node, depth });
        if (node.isFolder && (searchQuery || expandedFolders.has(node.path))) {
          if (node.children) {
            traverse(node.children, depth + 1);
          }
        }
      }
    };

    traverse(treeData, 0);
    return rows;
  }, [treeData, expandedFolders, searchQuery]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

  const availableLanguages = useMemo(() => {
    const exts = new Set<string>();
    files.forEach((f) => {
      if (f.extension) exts.add(f.extension);
    });
    return Array.from(exts).slice(0, 5);
  }, [files]);

  return (
    <div className="w-72 bg-surface border-r border-border-default flex flex-col select-none flex-shrink-0 h-full">
      {/* Top Filter Bar */}
      <div className="p-2 border-b border-border-default flex flex-col gap-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-text-muted" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-7 pl-7 pr-2 bg-canvas border border-border-default rounded-md text-meta text-text-primary placeholder:text-text-muted focus-ring"
          />
        </div>

        {/* Language Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 text-caption font-mono scrollbar-none">
          <button
            onClick={() => onLanguageFilterChange("all")}
            className={`flex-shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-sm transition-colors border ${
              languageFilter === "all"
                ? "bg-accent/20 text-accent font-medium border-accent/30"
                : "text-text-muted hover:text-text-primary border-transparent hover:border-border-default"
            }`}
          >
            All
          </button>
          {availableLanguages.map((ext) => (
            <button
              key={ext}
              onClick={() => onLanguageFilterChange(ext)}
              className={`flex-shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-sm uppercase transition-colors border ${
                languageFilter === ext
                  ? "bg-accent/20 text-accent font-medium border-accent/30"
                  : "text-text-muted hover:text-text-primary border-transparent hover:border-border-default"
              }`}
            >
              .{ext}
            </button>
          ))}
        </div>
      </div>

      {/* Virtualized Tree List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {visibleRows.length > 0 ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = visibleRows[virtualRow.index];
              return (
                <div
                  key={item.node.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileTreeNode
                    node={item.node}
                    depth={item.depth}
                    isExpanded={searchQuery ? true : expandedFolders.has(item.node.path)}
                    isSelected={selectedFile?.relative_path === item.node.path}
                    onToggleExpand={toggleExpand}
                    onSelectFile={onSelectFile}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted gap-2">
            <FolderPlus className="w-8 h-8 text-text-faint" />
            <p className="text-caption">No files discovered in workspace.</p>
            <button
              onClick={onOpenFolder}
              className="text-meta text-accent hover:underline font-medium"
            >
              Open a repository
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
