import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileCode, Layers, Box, Component as ComponentIcon, Package } from "lucide-react";
import type { DiagramNode, DiagramNodeKind } from "../../../types/diagram";
import { getNodeSizeForKind } from "../../../types/diagram";

export interface DiagramNodeData extends DiagramNode {
  [key: string]: unknown;
  isHighlighted?: boolean;
  isUpstream?: boolean;
  isDownstream?: boolean;
  onOpenSource?: (filePath: string, line: number) => void;
}

const KIND_ICONS: Record<DiagramNodeKind, React.FC<{ className?: string }>> = {
  file: FileCode,
  module: Layers,
  class: Box,
  component: ComponentIcon,
  external: Package,
};

export const DiagramNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const size = getNodeSizeForKind(node.kind);
  const Icon = KIND_ICONS[node.kind] || FileCode;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && node.source_ref && node.onOpenSource) {
      e.stopPropagation();
      node.onOpenSource(node.source_ref.file_path, node.source_ref.start_line);
    }
  };

  // Determine border and background styles based on selection and dependency highlighting
  let borderClasses = "border border-border-default";
  let ringClasses = "";

  if (selected) {
    borderClasses = "border-accent-default";
    ringClasses = "ring-2 ring-accent-default";
  } else if (node.isHighlighted) {
    if (node.isUpstream) {
      borderClasses = "border-warning";
      ringClasses = "ring-1 ring-warning";
    } else if (node.isDownstream) {
      borderClasses = "border-success";
      ringClasses = "ring-1 ring-success";
    } else {
      borderClasses = "border-accent-text";
      ringClasses = "ring-1 ring-accent-text";
    }
  }

  // Domain coloring subtle indicator from DESIGN_TOKENS (thin accent border left)
  let domainIndicator = "border-l-2 border-l-border-strong";
  if (node.kind === "component") {
    domainIndicator = "border-l-2 border-l-[#58A6FF]";
  } else if (node.kind === "module") {
    domainIndicator = "border-l-2 border-l-[#3FB950]";
  } else if (node.kind === "class") {
    domainIndicator = "border-l-2 border-l-[#D29922]";
  } else if (node.kind === "external") {
    domainIndicator = "border-l-2 border-l-[#BC8CFF]";
  }

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${node.kind} node: ${node.label}`}
      data-testid={`diagram-node-${node.id}`}
      onKeyDown={handleKeyDown}
      style={{
        width: size.width,
        height: size.height,
      }}
      className={`group relative flex items-center px-2.5 py-1.5 bg-surface text-text-primary rounded text-xs select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus transition-colors ${domainIndicator} ${borderClasses} ${ringClasses}`}
    >
      {/* React Flow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-1.5 h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-1.5 h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="w-1.5 h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="w-1.5 h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />

      <div className="flex items-center space-x-2 w-full min-w-0">
        <Icon className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="truncate font-mono font-medium text-[11px] leading-tight text-text-primary"
            title={node.label}
          >
            {node.label}
          </span>
          {node.source_ref && (
            <span
              className="truncate font-mono text-[9px] text-text-muted leading-none mt-0.5"
              title={`${node.source_ref.file_path}:${node.source_ref.start_line}`}
            >
              L{node.source_ref.start_line}
            </span>
          )}
        </div>

        {/* Small subtle metrics pill if available */}
        {node.metrics && (
          <div className="flex-shrink-0 text-[9px] font-mono text-text-muted px-1 py-0.5 bg-subtle rounded">
            {node.metrics.function_count !== undefined && (
              <span>{node.metrics.function_count}f</span>
            )}
            {node.metrics.class_count !== undefined && (
              <span>{node.metrics.class_count}c</span>
            )}
            {node.metrics.line_count !== undefined && (
              <span>{node.metrics.line_count}l</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
