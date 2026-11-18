import React from "react";
import {
  FileCode,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileJson,
  FileText,
} from "lucide-react";
import type { FileRecord } from "@/types/ipc";
import { Badge } from "@/components/ui/Badge";

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

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "json") return FileJson;
  if (ext === "md" || ext === "txt") return FileText;
  return FileCode;
};

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
        className="h-7 flex items-center gap-1.5 cursor-pointer hover:bg-hover text-text-primary text-body select-none group rounded-sm mx-1"
      >
        <span className="text-text-muted group-hover:text-text-primary">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
        {isExpanded ? (
          <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-text-muted" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  const file = node.fileRecord;
  const Icon = fileIcon(node.name);
  return (
    <div
      style={{ paddingLeft }}
      onClick={() => file && onSelectFile(file)}
      className={`h-7 flex items-center justify-between pr-2 cursor-pointer text-body select-none group transition-colors duration-150 rounded-sm mx-1 ${
        isSelected
          ? "bg-accent-subtle text-accent-text"
          : "hover:bg-hover text-text-secondary hover:text-text-primary"
      }`}
    >
      <div className="flex items-center gap-1.5 truncate min-w-0">
        <span className="w-3.5" />
        <Icon className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
        <span className="truncate">{node.name}</span>
      </div>

      {file && (
        <div className="flex items-center gap-1.5 flex-shrink-0 text-caption text-text-muted">
          {file.status && file.status !== "parsed" && file.status !== "pending" && (
            <span title={`Parse status: ${file.status}`}>
              <Badge variant="neutral" size="sm">
                {file.status === "skipped_too_large" ? "oversized" : file.status}
              </Badge>
            </span>
          )}
          {file.line_count > 0 && (
            <span className="tabular-nums text-right min-w-[2.5rem]">
              {file.line_count.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
