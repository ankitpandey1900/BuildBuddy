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
  Monitor,
  Server,
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

const KIND_TAGS: Record<DiagramNodeKind, string> = {
  file: "FILE",
  module: "MODULE",
  class: "CLASS",
  component: "SVC",
  external: "EXT",
};

// Standard consistent node dimensions for diagrams
export const NODE_CARD_WIDTH = 230;
export const NODE_CARD_HEIGHT = 70;

export const DiagramNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const layer: ArchitectureLayer = node.layer || classifyNodeLayer(node);
  const layerStyle = LAYER_STYLES[layer] || LAYER_STYLES.unclassified;

  let Icon = KIND_ICONS[node.kind] || FileCode;
  if (node.id.includes("client_browser") || node.id.includes("client")) {
    Icon = Monitor;
  } else if (node.id.includes("app_engine") || node.id.includes("engine")) {
    Icon = Server;
  } else if (node.id.includes("db_cluster") || node.id.includes("database") || layer === "data") {
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

    if (layer !== "unclassified") {
      return layerStyle.label;
    }

    return null;
  }, [node, layer, layerStyle]);

  // States:
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted && !node.isHoveredEndpoint;

  let stateClasses = "border border-border-default hover:border-border-strong";

  if (selected) {
    stateClasses = "border border-accent-default ring-1 ring-accent-default shadow-sm";
  } else if (node.isSearchMatch) {
    stateClasses = "border border-accent-text ring-1 ring-accent-text/40";
  } else if (node.isHoveredEndpoint) {
    stateClasses = "border border-accent-default ring-1 ring-accent-default shadow-sm";
  } else if (node.isHighlighted) {
    if (node.isUpstream) {
      stateClasses = "border border-warning ring-1 ring-warning/30";
    } else if (node.isDownstream) {
      stateClasses = "border border-success ring-1 ring-success/30";
    } else {
      stateClasses = "border border-accent-text ring-1 ring-accent-text/30";
    }
  }

  // 3px left accent in layer color per PRD 3.3.4 (responsive to theme tokens)
  const domainTokenName = layer === "data" ? "database" : layer;
  const accentBorderColor =
    layer === "unclassified"
      ? "var(--border-strong)"
      : `var(--domain-${domainTokenName}-border, ${layerStyle.accentColorDark})`;
  const inCount = node.inDegree ?? 0;
  const outCount = node.outDegree ?? 0;
  const kindTag = KIND_TAGS[node.kind] || "NODE";
  const hasFooter = Boolean(secondary || (layer && layer !== "unclassified"));
  const cardHeight = Math.max(node.height && node.height > 0 ? node.height : NODE_CARD_HEIGHT, hasFooter ? 66 : 50);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${node.kind} node: ${node.label}`}
      data-testid={`diagram-node-${node.id}`}
      onKeyDown={handleKeyDown}
      style={{
        width: node.width && node.width > 0 ? node.width : NODE_CARD_WIDTH,
        height: cardHeight,
        minHeight: `${cardHeight}px`,
        borderLeftColor: accentBorderColor,
        borderLeftWidth: "3px",
      }}
      className={`group relative flex flex-col justify-between px-2.5 py-1.5 bg-surface text-text-primary rounded-[3px] select-none cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus transition-all duration-150 ${stateClasses} ${
        isDimmed ? "opacity-35" : "opacity-100"
      }`}
    >
      {/* Handles for orthogonal connections on all 4 faces */}
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        className="!w-1.5 !h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!w-1.5 !h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !bg-border-strong opacity-0 group-hover:opacity-100"
      />

      {/* Header: Kind Tag + Degree Metrics */}
      <div className="flex items-center justify-between w-full min-w-0 font-mono text-[10px] text-text-muted leading-none">
        <div className="flex items-center space-x-1.5 min-w-0">
          <Icon className="w-3 h-3 text-text-muted flex-shrink-0" />
          <span className="uppercase tracking-wider font-semibold text-text-faint">{kindTag}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-muted tracking-tight">
          <span title={`${inCount} incoming dependencies`}>↓{inCount}</span>
          <span title={`${outCount} outgoing dependencies`}>↑{outCount}</span>
        </div>
      </div>

      {/* Body: Node Label (high contrast, bold, clean) */}
      <div className="flex items-center w-full min-w-0 my-0.5">
        <span
          className="truncate font-sans font-semibold text-[13px] leading-tight text-text-primary tracking-tight"
          title={node.label}
        >
          {node.label}
        </span>
      </div>

      {/* Footer: Metadata / File Info (only rendered if metadata exists) */}
      {hasFooter && (
        <div className="flex items-center justify-between text-[11px] font-mono text-text-muted truncate">
          <span className="truncate text-text-faint" title={secondary || ""}>
            {secondary || ""}
          </span>
          {layer !== "unclassified" && (
            <span className="text-[10px] uppercase tracking-wider text-text-faint ml-1">
              {layer}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
