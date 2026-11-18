import React from "react";
import { NodeProps } from "@xyflow/react";
import { Folder, ChevronDown, ChevronRight } from "lucide-react";
import type { DiagramGroup } from "../../../types/diagram";
import { type ArchitectureLayer } from "../utils/layers";

export interface GroupNodeData extends DiagramGroup {
  [key: string]: unknown;
  width?: number;
  height?: number;
  nodeCount?: number;
  layer?: ArchitectureLayer;
  onToggleCollapse?: (groupId: string) => void;
  onFocusGroup?: (groupId: string) => void;
}

export const GroupNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const group = data as unknown as GroupNodeData;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.onToggleCollapse) {
      group.onToggleCollapse(group.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.onFocusGroup) {
      group.onFocusGroup(group.id);
    } else if (group.onToggleCollapse) {
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
      onDoubleClick={handleDoubleClick}
      style={{
        width: group.width ? `${group.width}px` : "100%",
        height: group.height ? `${group.height}px` : "100%",
        borderRadius: "8px",
      }}
      className={`relative border border-border-default bg-surface/50 p-2.5 select-none transition-colors ${
        selected ? "border-accent-default ring-2 ring-accent-default/30" : "hover:border-border-strong"
      }`}
      data-testid={`diagram-group-${group.id}`}
    >
      {/* Top-left label with count */}
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-border-subtle/80 text-[12px] font-sans text-text-secondary">
        <div className="flex items-center space-x-2 truncate">
          <Folder className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="font-semibold text-text-primary truncate" title={group.label}>
            {group.label}
          </span>
          {group.nodeCount !== undefined && (
            <span className="text-[11px] font-mono text-text-muted bg-subtle px-1.5 py-0.2 rounded border border-border-subtle">
              {group.nodeCount}
            </span>
          )}
        </div>

        <button
          type="button"
          tabIndex={0}
          aria-label={group.collapsed ? `Expand group ${group.label}` : `Collapse group ${group.label}`}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-colors"
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
