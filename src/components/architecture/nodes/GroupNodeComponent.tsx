import React from "react";
import { NodeProps } from "@xyflow/react";
import { Folder, ChevronDown, ChevronRight } from "lucide-react";
import type { DiagramGroup } from "../../../types/diagram";

export interface GroupNodeData extends DiagramGroup {
  [key: string]: unknown;
  width?: number;
  height?: number;
  nodeCount?: number;
  onToggleCollapse?: (groupId: string) => void;
}

export const GroupNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const group = data as unknown as GroupNodeData;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.onToggleCollapse) {
      group.onToggleCollapse(group.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && group.onToggleCollapse) {
      e.stopPropagation();
      e.preventDefault();
      group.onToggleCollapse(group.id);
    }
  };

  return (
    <div
      style={{
        width: group.width ? `${group.width}px` : "100%",
        height: group.height ? `${group.height}px` : "100%",
      }}
      className={`relative rounded border border-dashed border-border-default bg-subtle/30 p-2 select-none transition-colors ${
        selected ? "border-accent-default ring-1 ring-accent-default" : ""
      }`}
    >
      <div className="flex items-center justify-between pb-1 mb-1 border-b border-border-subtle text-[11px] font-mono text-text-secondary">
        <div className="flex items-center space-x-1.5 truncate">
          <Folder className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="font-semibold truncate" title={group.label}>
            {group.label}
          </span>
          {group.nodeCount !== undefined && (
            <span className="text-[10px] text-text-muted">({group.nodeCount})</span>
          )}
        </div>

        <button
          type="button"
          tabIndex={0}
          aria-label={group.collapsed ? `Expand group ${group.label}` : `Collapse group ${group.label}`}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className="p-0.5 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
        >
          {group.collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
};
