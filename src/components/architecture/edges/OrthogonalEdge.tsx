import React, { useState } from "react";
import {
  EdgeProps,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
} from "@xyflow/react";
import type { DiagramEdge, Point } from "../../../types/diagram";

export interface OrthogonalEdgeData extends DiagramEdge {
  [key: string]: unknown;
  points?: Point[];
  direction?: "DOWN" | "RIGHT";
  isHighlighted?: boolean;
  isUpstream?: boolean;
  isDownstream?: boolean;
  onEdgeHover?: (edgeId: string | null) => void;
}

export const OrthogonalEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  const edgeData = data as unknown as OrthogonalEdgeData | undefined;
  const points = edgeData?.points;
  const relationship = edgeData?.relationship || "import";
  const confidence = edgeData?.confidence || "static";
  const label = edgeData?.label;
  const isHorizontal = edgeData?.direction === "RIGHT";

  // 1. Generate orthogonal path with rounded corners (borderRadius: 6)
  let pathD = "";
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  // Validate that points actually connect near the source and target handles in canvas coordinates.
  // If points are in local container coordinates or detached from handles, use React Flow's canonical getSmoothStepPath.
  const isPointsValid =
    points &&
    points.length >= 2 &&
    Math.hypot(points[0].x - sourceX, points[0].y - sourceY) <= 80 &&
    Math.hypot(points[points.length - 1].x - targetX, points[points.length - 1].y - targetY) <= 80;

  if (isPointsValid && points) {
    // Generate SVG path with rounded corners through bend points
    const r = 6;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      if (!next) {
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        // Round corner towards next
        const dx1 = Math.sign(curr.x - prev.x);
        const dy1 = Math.sign(curr.y - prev.y);
        const dx2 = Math.sign(next.x - curr.x);
        const dy2 = Math.sign(next.y - curr.y);

        const beforeCornerX = curr.x - dx1 * r;
        const beforeCornerY = curr.y - dy1 * r;
        const afterCornerX = curr.x + dx2 * r;
        const afterCornerY = curr.y + dy2 * r;

        d += ` L ${beforeCornerX} ${beforeCornerY} Q ${curr.x} ${curr.y} ${afterCornerX} ${afterCornerY}`;
      }
    }
    pathD = d;
    const midIdx = Math.floor(points.length / 2);
    labelX = points[midIdx].x;
    labelY = points[midIdx].y;
  } else {
    const defaultSourcePos = isHorizontal ? Position.Right : Position.Bottom;
    const defaultTargetPos = isHorizontal ? Position.Left : Position.Top;

    const [smoothPath, sx, sy] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePosition || defaultSourcePos,
      targetX,
      targetY,
      targetPosition: targetPosition || defaultTargetPos,
      borderRadius: 8,
    });
    pathD = smoothPath;
    labelX = sx;
    labelY = sy;
  }

  // 2. Determine stroke styles per relationship & confidence
  // Never color alone: distinct dash patterns, widths, text badges
  let strokeDasharray: string | undefined = undefined;
  let strokeWidth = 1.5;
  let strokeColor = "var(--text-muted, #8B949E)";

  if (relationship === "entry") {
    strokeWidth = 2.5;
    strokeColor = "var(--accent-default, #388BFD)";
  } else if (relationship === "instantiation") {
    strokeDasharray = "5,4";
  } else if (relationship === "declared_dependency") {
    strokeDasharray = "2,3";
  } else if (relationship === "inheritance") {
    strokeWidth = 1.75;
    strokeColor = "var(--text-secondary, #C9D1D9)";
  }

  // Confidence overrides
  if (confidence === "inferred") {
    strokeDasharray = "6,4"; // distinct dashed style
  } else if (confidence === "unknown") {
    strokeDasharray = "2,2"; // fine dotted style
  }

  const isHovered = isLocalHovered || edgeData?.isHighlighted;

  if (selected) {
    strokeColor = "var(--accent-default, #388BFD)";
    strokeWidth = Math.max(strokeWidth, 2.5);
  } else if (isHovered) {
    if (edgeData?.isUpstream) {
      strokeColor = "var(--status-warning-text, #D29922)";
    } else if (edgeData?.isDownstream) {
      strokeColor = "var(--status-success-text, #3FB950)";
    } else {
      strokeColor = "var(--accent-default, #388BFD)";
    }
    strokeWidth = Math.max(strokeWidth, 2);
  }

  // Marker configuration
  let markerEnd: string | undefined = undefined;
  let markerStart: string | undefined = undefined;
  const isErForeignKey =
    relationship === "declared_dependency" ||
    (Boolean(label) && (label!.toUpperCase().includes("FK") || label!.toUpperCase().includes("REFERENCES")));

  if (relationship === "inheritance") {
    markerEnd = "url(#bb-arrow-inheritance)";
  } else if (relationship === "entry") {
    markerEnd = "url(#bb-arrow-entry)";
  } else if (isErForeignKey) {
    // Professional Crow's foot cardinality notation for ER database relationships
    markerEnd = isHovered || selected ? "url(#bb-crowfoot-highlight)" : "url(#bb-crowfoot)";
    markerStart = isHovered || selected ? "url(#bb-one-highlight)" : "url(#bb-one)";
  } else {
    markerEnd = "url(#bb-arrow-default)";
  }

  const handleMouseEnter = () => {
    setIsLocalHovered(true);
    if (edgeData?.onEdgeHover) {
      edgeData.onEdgeHover(id);
    }
  };

  const handleMouseLeave = () => {
    setIsLocalHovered(false);
    if (edgeData?.onEdgeHover) {
      edgeData.onEdgeHover(null);
    }
  };

  // Edge labels only on hover or selection (or highlighted)
  const isLabelVisible = selected || isHovered;

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="cursor-pointer"
      data-testid={`diagram-edge-${id}`}
    >
      {/* Invisible wider hit-test stroke for effortless hovering */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="cursor-pointer"
      />

      <BaseEdge
        id={id}
        path={pathD}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          cursor: "pointer",
          transition: "stroke 150ms ease, stroke-width 150ms ease",
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />

      {/* Edge label & Inferred badge - visible on hover or selection */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: isLabelVisible ? "all" : "none",
          }}
          className={`flex items-center space-x-1 select-none transition-opacity duration-150 ${
            isLabelVisible ? "opacity-100 z-30" : "opacity-0"
          }`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {label && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface border shadow-xs text-text-primary ${
                selected ? "border-accent-default font-semibold ring-1 ring-accent-default/30" : "border-border-default"
              }`}
              title={`${relationship}: ${label} (${confidence})`}
            >
              {label}
            </span>
          )}

          {confidence === "inferred" && (
            <span
              data-testid="edge-inferred-badge"
              className="px-1 py-0.2 text-[9px] font-sans font-medium rounded-sm bg-subtle border border-dashed border-border-strong text-text-muted"
              title="Confidence: Inferred (never merged with confirmed)"
            >
              inferred
            </span>
          )}

          {confidence === "unknown" && (
            <span
              data-testid="edge-unknown-badge"
              className="px-1 py-0.2 text-[9px] font-sans font-medium rounded-sm bg-subtle border border-dotted border-border-strong text-text-faint"
              title="Confidence: Unknown"
            >
              unknown
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
};
