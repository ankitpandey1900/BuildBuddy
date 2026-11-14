import React from "react";
import { FileCode, ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import type { FileRecord } from "@/types/ipc";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
  fileRecord?: FileRecord;
}

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: (path: string) => void;
  onSelectFile: (file: FileRecord) => void;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelectFile,
}) => {
  const paddingLeft = `${depth * 14 + 8}px`;

  if (node.isFolder) {
    return (
      <div
        style={{ paddingLeft }}
        onClick={() => onToggleExpand(node.path)}
        className="h-6 flex items-center gap-1.5 cursor-pointer hover:bg-hover text-text-primary text-meta select-none group"
      >
        <span className="text-text-muted group-hover:text-text-primary">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
        {isExpanded ? (
          <FolderOpen className="w-3.5 h-3.5 text-accent" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-text-muted" />
        )}
        <span className="truncate font-medium">{node.name}</span>
      </div>
    );
  }

  const file = node.fileRecord;
  return (
    <div
      style={{ paddingLeft }}
      onClick={() => file && onSelectFile(file)}
      className={`h-6 flex items-center justify-between pr-2 cursor-pointer text-meta select-none group transition-colors ${
        isSelected
          ? "bg-accent/15 text-accent-text border-l-2 border-accent"
          : "hover:bg-hover text-text-secondary hover:text-text-primary"
      }`}
    >
      <div className="flex items-center gap-1.5 truncate min-w-0">
        <span className="w-3.5" /> {/* Align with folder arrow */}
        <FileCode className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-accent" : "text-text-muted"}`} />
        <span className="truncate">{node.name}</span>
      </div>

      {file && (
        <div className="flex items-center gap-1.5 flex-shrink-0 text-caption font-mono text-text-muted">
          {file.status && file.status !== "parsed" && file.status !== "pending" && (
            <span
              className={`text-[9px] px-1 py-0.2 rounded font-mono border uppercase tracking-wider ${
                file.status === "partial"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : file.status === "unsupported"
                  ? "bg-surface-raised text-text-muted border-border-subtle"
                  : file.status === "skipped_too_large"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
              }`}
              title={`Parse status: ${file.status}`}
            >
              {file.status === "skipped_too_large" ? "oversized" : file.status}
            </span>
          )}
          {file.function_count + file.class_count > 0 && (
            <span
              className="text-[10px] px-1 py-0.5 rounded bg-surface-raised text-accent font-semibold border border-border-subtle"
              title={`${file.function_count} functions, ${file.class_count} classes`}
            >
              {file.function_count + file.class_count} sym
            </span>
          )}
          {file.line_count > 0 && (
            <span>{file.line_count.toLocaleString()}L</span>
          )}
        </div>
      )}
    </div>
  );
};
