import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import type { DiagramNodeData } from "./DiagramNodeComponent";
import { FloatingNodeToolbar } from "../controls/FloatingNodeToolbar";

function getLanguageColor(filePathOrLabel: string): { bg: string; border: string; dot: string } {
  const lower = filePathOrLabel.toLowerCase();
  if (lower.endsWith(".tsx")) {
    return { bg: "bg-cyan-500/10", border: "border-cyan-500/50", dot: "bg-cyan-400" };
  }
  if (lower.endsWith(".ts")) {
    return { bg: "bg-blue-500/10", border: "border-blue-500/50", dot: "bg-blue-400" };
  }
  if (lower.endsWith(".jsx") || lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return { bg: "bg-amber-500/10", border: "border-amber-500/50", dot: "bg-amber-400" };
  }
  if (lower.endsWith(".rs")) {
    return { bg: "bg-orange-500/10", border: "border-orange-500/50", dot: "bg-orange-400" };
  }
  if (lower.endsWith(".py")) {
    return { bg: "bg-emerald-500/10", border: "border-emerald-500/50", dot: "bg-emerald-400" };
  }
  if (lower.endsWith(".prisma") || lower.endsWith(".sql")) {
    return { bg: "bg-purple-500/10", border: "border-purple-500/50", dot: "bg-purple-400" };
  }
  if (lower.endsWith(".json") || lower.endsWith(".toml") || lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return { bg: "bg-zinc-500/10", border: "border-zinc-500/50", dot: "bg-zinc-400" };
  }
  if (lower.endsWith(".md")) {
    return { bg: "bg-sky-500/10", border: "border-sky-500/50", dot: "bg-sky-400" };
  }
  return { bg: "bg-surface", border: "border-border-default", dot: "bg-accent" };
}

export const FileGraphNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted;
  const colors = getLanguageColor(node.source_ref?.file_path || node.label);

  const inDegree = node.inDegree ?? 0;
  const outDegree = node.outDegree ?? 0;
  const totalDegree = inDegree + outDegree;

  // Obsidian graph dynamic dot scale: hub nodes glow and expand slightly
  const isHub = totalDegree >= 6;

  let stateClasses = `${colors.border} ${colors.bg}`;
  if (selected) {
    stateClasses = "border-2 border-accent ring-4 ring-accent/25 shadow-lg scale-105";
  } else if (node.isSearchMatch) {
    stateClasses = "border-2 border-warning ring-2 ring-warning/30 shadow-md";
  } else if (node.isHighlighted) {
    stateClasses = "border-2 border-accent-default ring-2 ring-accent-default/30 shadow-sm";
  }

  return (
    <>
      <FloatingNodeToolbar
        isVisible={Boolean(selected)}
        label={node.label}
        kind="FILE"
        sourceFilePath={node.source_ref?.file_path}
        sourceLine={node.source_ref?.start_line}
        onOpenSource={node.onOpenSource}
      />
      <div
        tabIndex={0}
        role="button"
        aria-label={`File node: ${node.label}`}
        data-testid={`diagram-node-${node.id}`}
        style={{ minWidth: 110, maxWidth: 240 }}
        className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-full border backdrop-blur-xs select-none cursor-pointer focus:outline-none transition-all duration-200 shadow-2xs ${stateClasses} ${
          isDimmed ? "opacity-25" : "opacity-100"
        }`}
      >
        <Handle type="target" id="left" position={Position.Left} className="!w-1.5 !h-1.5 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="source" id="right" position={Position.Right} className="!w-1.5 !h-1.5 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="target" id="top" position={Position.Top} className="!w-1.5 !h-1.5 !bg-accent opacity-0 group-hover:opacity-100" />
        <Handle type="source" id="bottom" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-accent opacity-0 group-hover:opacity-100" />

        {/* Obsidian-style glowing node dot */}
        <span
          className={`rounded-full flex-shrink-0 transition-transform duration-200 ${colors.dot} ${
            isHub ? "w-3.5 h-3.5 ring-2 ring-white/30 shadow-[0_0_8px_currentColor]" : "w-2.5 h-2.5 ring-1 ring-white/20"
          } ${selected || node.isHighlighted ? "scale-125" : ""}`}
        />

        {/* File label */}
        <span
          className={`font-mono text-xs truncate ${
            isHub ? "font-semibold text-text-primary" : "font-normal text-text-secondary group-hover:text-text-primary"
          }`}
          title={node.source_ref?.file_path || node.label}
        >
          {node.label}
        </span>

        {/* Degree badge on hover/selection */}
        {totalDegree > 0 && (
          <span className="text-[10px] font-mono text-text-muted opacity-60 group-hover:opacity-100 ml-auto flex-shrink-0">
            {totalDegree}
          </span>
        )}
      </div>
    </>
  );
};
