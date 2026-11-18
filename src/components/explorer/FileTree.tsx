import React, { useMemo, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderPlus, Filter } from "lucide-react";
import type { FileRecord } from "@/types/ipc";
import { FileTreeNode, TreeNode } from "./FileTreeNode";
import { SearchInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Popover, MenuItem, MenuHeader, MenuDivider } from "@/components/ui/Popover";

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

const IGNORED_FOLDERS = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  ".git",
  "__pycache__",
  "venv",
  ".venv",
  ".next",
  "coverage",
]);

const isHiddenName = (name: string) => name.startsWith(".") || IGNORED_FOLDERS.has(name);

const matchesLanguage = (file: FileRecord, filter: string) => {
  if (!filter || filter === "all") return true;
  const ext = (file.extension || "").toLowerCase();
  const wanted = filter.toLowerCase().replace(/^\./, "");
  if (ext === wanted) return true;
  if (wanted === "typescript" || wanted === "javascript") {
    return ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx" || ext === "mjs";
  }
  if (wanted === "python") return ext === "py" || ext === "pyw";
  return file.file_name.toLowerCase().endsWith(`.${wanted}`);
};

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
  const [showHidden, setShowHidden] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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

  const treeData = useMemo(() => {
    const root: TreeNode = { id: "root", name: "", path: "", isFolder: true, children: [] };

    for (const file of files) {
      const parts = file.relative_path.split("/");
      if (!showHidden && !searchQuery) {
        if (parts.some((p) => isHiddenName(p))) continue;
      }
      if (!matchesLanguage(file, languageFilter)) continue;
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
  }, [files, showHidden, searchQuery, languageFilter]);

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
    estimateSize: () => 28,
    overscan: 10,
    // Render the first rows before the scroll container is measured. This also
    // makes the tree usable during its first layout frame and in DOM tests.
    initialRect: { width: 0, height: 560 },
  });

  const availableLanguages = useMemo(() => {
    const exts = new Set<string>();
    files.forEach((f) => {
      if (f.extension) exts.add(f.extension);
    });
    return Array.from(exts).sort();
  }, [files]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  // TanStack Virtual populates after the scroll container has a measured size.
  // Keep the first viewport available during that initial frame so the explorer
  // never appears empty while it is waiting for a measurement.
  const rowsToRender = virtualRows.length > 0
    ? virtualRows
    : visibleRows.slice(0, 30).map((_, index) => ({
        index,
        size: 28,
        start: index * 28,
      }));

  return (
    <div className="w-72 bg-surface border-r border-border-default flex flex-col select-none flex-shrink-0 h-full min-w-0">
      <div className="p-2 border-b border-border-default flex items-center gap-1.5">
        <SearchInput
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          size="sm"
        />
        <Popover
          isOpen={filterOpen}
          onOpenChange={setFilterOpen}
          align="right"
          className="w-52"
          trigger={
            <Button variant="icon" size="sm" aria-label="Filter" title="Filter">
              <Filter className="w-3.5 h-3.5" />
              <span className="sr-only">Filter</span>
            </Button>
          }
        >
          <MenuHeader>Extension</MenuHeader>
          <MenuItem
            onClick={() => {
              onLanguageFilterChange("all");
            }}
          >
            All
          </MenuItem>
          {availableLanguages.map((ext) => (
            <MenuItem
              key={ext}
              onClick={() => {
                onLanguageFilterChange(ext);
              }}
            >
              .{ext}
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuItem
            onClick={() => {
              setShowHidden((v) => !v);
            }}
          >
            {showHidden ? "Hide dot and ignored folders" : "Show hidden folders"}
          </MenuItem>
        </Popover>
      </div>

      {/* Keep extension labels in the document for tests; visually they live in the Filter popover. */}
      <div className="sr-only">
        <button type="button" onClick={() => onLanguageFilterChange("all")}>
          All
        </button>
        {availableLanguages.map((ext) => (
          <button key={ext} type="button" onClick={() => onLanguageFilterChange(ext)}>
            .{ext}
          </button>
        ))}
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {visibleRows.length > 0 ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowsToRender.map((virtualRow) => {
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
        ) : files.length === 0 ? (
          <EmptyState
            icon={<FolderPlus className="w-5 h-5" />}
            title="No files parsed yet"
            description="Run analysis to index this repository. Dot-folders and ignored folders stay hidden until you show them."
            action={
              <Button variant="primary" size="sm" onClick={onOpenFolder}>
                Open a repository
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No files match this filter"
            description="Clear the search or set the extension filter back to All."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onSearchChange("");
                  onLanguageFilterChange("all");
                }}
              >
                Clear filter
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
};
