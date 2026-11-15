import React from "react";
import { EdgeProps, BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { DiagramEdge, Point } from "../../../types/diagram";

export interface OrthogonalEdgeData extends DiagramEdge {
  [key: string]: unknown;
  points?: Point[];
  isHighlighted?: boolean;
  isUpstream?: boolean;
  isDownstream?: boolean;
}

export const OrthogonalEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}) => {
  const edgeData = data as unknown as OrthogonalEdgeData | undefined;
  const points = edgeData?.points;
  const relationship = edgeData?.relationship || "import";
  const confidence = edgeData?.confidence || "static";
  const label = edgeData?.label;

  // 1. Generate path from ELK bend points or fallback smooth step
  let pathD = "";
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (points && points.length >= 2) {
    pathD = `M ${points[0].x} ${points[0].y}` + points.slice(1).map((p) => ` L ${p.x} ${p.y}`).join("");
    // Pick the midpoint of the bend points for the label
    const midIdx = Math.floor(points.length / 2);
    labelX = points[midIdx].x;
    labelY = points[midIdx].y;
  } else {
    const [smoothPath, sx, sy] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      borderRadius: 4,
    });
    pathD = smoothPath;
    labelX = sx;
    labelY = sy;
  }

  // 2. Determine stroke styles per relationship & confidence
  // NEVER rely on color alone: distinct dash patterns, widths, and text badges
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

  if (selected) {
    strokeColor = "var(--accent-default, #388BFD)";
    strokeWidth = Math.max(strokeWidth, 2.5);
  } else if (edgeData?.isHighlighted) {
    strokeColor = edgeData.isUpstream
      ? "var(--status-warning-text, #D29922)"
      : "var(--status-success-text, #3FB950)";
    strokeWidth = Math.max(strokeWidth, 2);
  }

  // Determine marker
  let markerEnd: string | undefined = undefined;
  if (relationship === "inheritance") {
    markerEnd = "url(#bb-arrow-inheritance)";
  } else if (relationship === "entry") {
    markerEnd = "url(#bb-arrow-entry)";
  } else {
    markerEnd = "url(#bb-arrow-default)";
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={pathD}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          cursor: "pointer",
        }}
        markerEnd={markerEnd}
      />

      {/* Edge label & Inferred badge */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="flex items-center space-x-1 select-none"
        >
          {label && (
            <span
              className={`px-1 py-0.5 text-[9px] font-mono rounded bg-surface border text-text-secondary ${
                selected ? "border-accent-default font-semibold text-text-primary" : "border-border-subtle"
              }`}
              title={`${relationship}: ${label} (${confidence})`}
            >
              {label}
            </span>
          )}

          {confidence === "inferred" && (
            <span
              data-testid="edge-inferred-badge"
              className="px-1 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded bg-subtle border border-dashed border-border-strong text-text-muted"
              title="Confidence: Inferred (never merged with confirmed)"
            >
              inferred
            </span>
          )}

          {confidence === "unknown" && (
            <span
              data-testid="edge-unknown-badge"
              className="px-1 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded bg-subtle border border-dotted border-border-strong text-text-faint"
              title="Confidence: Unknown"
            >
              unknown
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
