import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  FileCode,
  Layers,
  Box,
  Component as ComponentIcon,
  Package,
  Database,
  Settings,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import type { DiagramNode, DiagramNodeKind } from "../../../types/diagram";
import {
  classifyNodeLayer,
  LAYER_STYLES,
  type ArchitectureLayer,
} from "../utils/layers";

export interface DiagramNodeData extends DiagramNode {
  [key: string]: unknown;
  layer?: ArchitectureLayer;
  inDegree?: number;
  outDegree?: number;
  isDimmed?: boolean;
  isSearchMatch?: boolean;
  isHighlighted?: boolean;
  isUpstream?: boolean;
  isDownstream?: boolean;
  isHoveredEndpoint?: boolean;
  onOpenSource?: (filePath: string, line: number) => void;
  secondaryText?: string;
}

const KIND_ICONS: Record<DiagramNodeKind, React.FC<{ className?: string }>> = {
  file: FileCode,
  module: Layers,
  class: Box,
  component: ComponentIcon,
  external: Package,
};

// Standard consistent node dimensions for diagrams
export const NODE_CARD_WIDTH = 230;
export const NODE_CARD_HEIGHT = 70;

export const DiagramNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const layer: ArchitectureLayer = node.layer || classifyNodeLayer(node);
  const layerStyle = LAYER_STYLES[layer] || LAYER_STYLES.unclassified;

  let Icon = KIND_ICONS[node.kind] || FileCode;
  if (layer === "data") {
    Icon = Database;
  } else if (layer === "config") {
    Icon = Settings;
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && node.source_ref && node.onOpenSource) {
      e.stopPropagation();
      node.onOpenSource(node.source_ref.file_path, node.source_ref.start_line);
    }
  };

  // Derive secondary description ("12 files · 340 lines" or lines / file path)
  const secondary = React.useMemo(() => {
    if (node.secondaryText) return node.secondaryText;
    const parts: string[] = [];

    if (node.metrics?.class_count && node.kind === "module") {
      parts.push(`${node.metrics.class_count} classes`);
    }
    if (node.metrics?.function_count) {
      parts.push(`${node.metrics.function_count} fn`);
    }
    if (node.metrics?.line_count) {
      parts.push(`${node.metrics.line_count} lines`);
    } else if (node.source_ref) {
      parts.push(`L${node.source_ref.start_line}-${node.source_ref.end_line}`);
    }

    if (parts.length > 0) {
      return parts.join(" · ");
    }

    if (node.source_ref) {
      return node.source_ref.file_path;
    }

    return layerStyle.label;
  }, [node, layerStyle]);

  // States:
  // - hover: border darkens, subtle lift of 1px
  // - selected: 2px accent border
  // - dimmed: non-related nodes at 35% opacity when something is selected
  // - search match: glowing/distinct focus border
  // - hovered endpoint: edge hover highlights both endpoints
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted && !node.isHoveredEndpoint;

  let stateClasses = "border border-border-default hover:border-border-strong hover:-translate-y-[1px]";

  if (selected) {
    stateClasses = "border-2 border-accent-default ring-2 ring-accent-default/30 shadow-sm";
  } else if (node.isSearchMatch) {
    stateClasses = "border-2 border-accent-text ring-2 ring-accent-text/30";
  } else if (node.isHoveredEndpoint) {
    stateClasses = "border-2 border-accent-default ring-1 ring-accent-default shadow-sm";
  } else if (node.isHighlighted) {
    if (node.isUpstream) {
      stateClasses = "border-2 border-warning ring-1 ring-warning/30";
    } else if (node.isDownstream) {
      stateClasses = "border-2 border-success ring-1 ring-success/30";
    } else {
      stateClasses = "border-2 border-accent-text ring-1 ring-accent-text/30";
    }
  }

  // 3px left accent in layer color
  const accentBorderColor = layerStyle.accentColorDark;

  const inCount = node.inDegree ?? 0;
  const outCount = node.outDegree ?? 0;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${node.kind} node: ${node.label}`}
      data-testid={`diagram-node-${node.id}`}
      onKeyDown={handleKeyDown}
      style={{
        width: node.width && node.width > 0 ? node.width : NODE_CARD_WIDTH,
        height: node.height && node.height > 0 ? node.height : NODE_CARD_HEIGHT,
        borderLeftColor: accentBorderColor,
        borderLeftWidth: "3px",
      }}
      className={`group relative flex flex-col justify-between p-2 bg-surface text-text-primary rounded-md select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus transition-all duration-150 ${stateClasses} ${
        isDimmed ? "opacity-35" : "opacity-100"
      }`}
    >
      {/* Handles for orthogonal connections on all 4 faces */}
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        className="w-1.5 h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        id="bottom"
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

      {/* Header: Icon + Bold Name (13-14px) + Chips */}
      <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Icon className="w-4 h-4 flex-shrink-0 text-text-muted" />
          <span
            className="truncate font-sans font-semibold text-[13px] leading-tight text-text-primary"
            title={node.label}
          >
            {node.label}
          </span>
        </div>

        {/* Small in/out edge metric chips */}
        <div className="flex items-center gap-1 flex-shrink-0 font-mono text-[10px]">
          <span
            className="flex items-center px-1 py-0.2 rounded bg-subtle text-text-muted border border-border-subtle"
            title={`${inCount} incoming dependencies`}
          >
            <ArrowDownRight className="w-2.5 h-2.5 mr-0.5 text-text-muted" />
            {inCount}
          </span>
          <span
            className="flex items-center px-1 py-0.2 rounded bg-subtle text-text-muted border border-border-subtle"
            title={`${outCount} outgoing dependencies`}
          >
            <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 text-text-muted" />
            {outCount}
          </span>
        </div>
      </div>

      {/* Secondary Line: ("12 files · 340 lines" or metrics) - min 12px readable text */}
      <div className="flex items-center justify-between text-[12px] text-text-muted font-sans truncate mt-1">
        <span className="truncate" title={secondary}>
          {secondary}
        </span>
        <span className="text-[11px] font-sans font-medium text-text-faint ml-1">
          {layer}
        </span>
      </div>
    </div>
  );
};
