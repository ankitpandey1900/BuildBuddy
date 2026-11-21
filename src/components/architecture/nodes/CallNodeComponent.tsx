import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, CornerDownRight } from "lucide-react";
import type { DiagramNodeData } from "./DiagramNodeComponent";
import { FloatingNodeToolbar } from "../controls/FloatingNodeToolbar";

export const CallNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted;

  const inDegree = node.inDegree ?? 0;
  const outDegree = node.outDegree ?? 0;

  // Root or entry point detection (inDegree === 0, or named main/handler/route)
  const isEntryPoint =
    inDegree === 0 ||
    node.label.toLowerCase() === "main" ||
    node.label.toLowerCase() === "__main__" ||
    node.id.includes("entry_point") ||
    node.label.startsWith("GET ") ||
    node.label.startsWith("POST ");

  let stateClasses = "border border-border-default hover:border-border-strong bg-surface text-text-primary";
  if (selected) {
    stateClasses = "border-2 border-accent ring-2 ring-accent/30 shadow-md";
  } else if (node.isSearchMatch) {
    stateClasses = "border-2 border-warning ring-2 ring-warning/30 shadow-sm";
  } else if (node.isHighlighted) {
    stateClasses = "border-2 border-accent-default ring-1 ring-accent-default/40";
  }

  return (
    <>
      <FloatingNodeToolbar
        isVisible={Boolean(selected)}
        label={node.label}
        kind={isEntryPoint ? "ENTRY" : "CALL"}
        sourceFilePath={node.source_ref?.file_path}
        sourceLine={node.source_ref?.start_line}
        onOpenSource={node.onOpenSource}
      />
      <div
        tabIndex={0}
        role="button"
        aria-label={`Call node: ${node.label}`}
        data-testid={`diagram-node-${node.id}`}
        style={{
          minWidth: 160,
          maxWidth: 280,
        }}
        className={`group relative flex items-center justify-between px-3.5 py-2 rounded-full select-none cursor-pointer focus:outline-none transition-all duration-150 shadow-xs ${
          isEntryPoint
            ? "bg-emerald-600 text-white border-2 border-emerald-500 shadow-sm"
            : stateClasses
        } ${isDimmed ? "opacity-35" : "opacity-100"}`}
      >
        {/* Handles for curved bezier connections */}
        <Handle type="target" id="left" position={Position.Left} className="!w-2 !h-2 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="source" id="right" position={Position.Right} className="!w-2 !h-2 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="target" id="top" position={Position.Top} className="!w-2 !h-2 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="source" id="bottom" position={Position.Bottom} className="!w-2 !h-2 !bg-accent opacity-0 group-hover:opacity-100" />

        {/* Leading icon */}
        <div className="flex items-center space-x-2 min-w-0">
          {isEntryPoint ? (
            <Play className="w-3.5 h-3.5 fill-current flex-shrink-0 text-white" />
          ) : (
            <CornerDownRight className="w-3 h-3 text-text-muted flex-shrink-0" />
          )}
          <span
            className={`font-mono text-xs truncate ${
              isEntryPoint ? "font-bold text-white tracking-tight" : "font-semibold text-text-primary"
            }`}
            title={node.label}
          >
            {node.label}
          </span>
        </div>

        {/* Degrees badge */}
        <div className="flex items-center space-x-1 ml-2 text-[10px] font-mono opacity-80 flex-shrink-0">
          <span title={`${inDegree} callers`}>↓{inDegree}</span>
          <span title={`${outDegree} callees`}>↑{outDegree}</span>
        </div>
      </div>
    </>
  );
};
