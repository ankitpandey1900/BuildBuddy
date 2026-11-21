import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Box } from "lucide-react";
import type { DiagramNodeData } from "./DiagramNodeComponent";
import { FloatingNodeToolbar } from "../controls/FloatingNodeToolbar";

export const UmlClassNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted;

  const props = React.useMemo(() => {
    if (!node.members) return [];
    return node.members
      .filter((m) => m.startsWith("prop|"))
      .map((m) => m.slice(5));
  }, [node.members]);

  const methods = React.useMemo(() => {
    if (!node.members) return [];
    return node.members
      .filter((m) => m.startsWith("method|"))
      .map((m) => m.slice(7));
  }, [node.members]);

  let borderClasses = "border border-border-default hover:border-border-strong";
  if (selected) {
    borderClasses = "border-2 border-accent ring-2 ring-accent/30 shadow-md";
  } else if (node.isSearchMatch) {
    borderClasses = "border-2 border-warning ring-2 ring-warning/30 shadow-sm";
  } else if (node.isHighlighted) {
    borderClasses = "border-2 border-accent-default ring-1 ring-accent-default/40";
  }

  return (
    <>
      <FloatingNodeToolbar
        isVisible={Boolean(selected)}
        label={node.label}
        kind="CLASS"
        sourceFilePath={node.source_ref?.file_path}
        sourceLine={node.source_ref?.start_line}
        onOpenSource={node.onOpenSource}
      />
      <div
        tabIndex={0}
        role="button"
        aria-label={`UML Class: ${node.label}`}
        data-testid={`diagram-node-${node.id}`}
        style={{
          width: node.width && node.width > 0 ? node.width : 220,
          minWidth: 200,
        }}
        className={`group relative flex flex-col bg-surface/95 text-text-primary rounded-lg backdrop-blur-sm select-none cursor-pointer focus:outline-none transition-all duration-150 overflow-hidden shadow-subtle ${borderClasses} ${
          isDimmed ? "opacity-35" : "opacity-100"
        }`}
      >
        <Handle type="target" id="top" position={Position.Top} className="!w-2.5 !h-2.5 !bg-accent opacity-0 group-hover:opacity-100 border-2 border-surface" />
        <Handle type="source" id="bottom" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-accent opacity-0 group-hover:opacity-100 border-2 border-surface" />
        <Handle type="target" id="left" position={Position.Left} className="!w-2.5 !h-2.5 !bg-accent opacity-0 group-hover:opacity-100 border-2 border-surface" />
        <Handle type="source" id="right" position={Position.Right} className="!w-2.5 !h-2.5 !bg-accent opacity-0 group-hover:opacity-100 border-2 border-surface" />

        {/* UML Header Compartment */}
        <div className="px-3 py-2 bg-elevated/70 border-b border-border-default text-center">
          <div className="text-[10px] font-mono text-text-muted italic">
            &laquo;class&raquo;
          </div>
          <div className="flex items-center justify-center space-x-1.5 min-w-0">
            <Box className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="font-mono font-bold text-xs text-text-primary truncate" title={node.label}>
              {node.label}
            </span>
          </div>
        </div>

        {/* UML Attributes Compartment */}
        <div className="px-3 py-1.5 border-b border-border-subtle/80 text-[11px] font-mono space-y-0.5">
          {props.length > 0 ? (
            props.map((p, i) => (
              <div key={i} className="truncate text-text-secondary" title={p}>
                - {p}
              </div>
            ))
          ) : (
            <div className="text-[10px] text-text-muted italic">
              {node.metrics?.complexity ? `${node.metrics.complexity} properties` : "No public fields"}
            </div>
          )}
        </div>

        {/* UML Methods Compartment */}
        <div className="px-3 py-1.5 text-[11px] font-mono space-y-0.5">
          {methods.length > 0 ? (
            methods.map((m, i) => (
              <div key={i} className="truncate text-text-primary" title={m}>
                + {m}()
              </div>
            ))
          ) : (
            <div className="text-[10px] text-text-muted italic">
              {node.metrics?.function_count ? `${node.metrics.function_count} methods` : "No methods"}
            </div>
          )}
        </div>

        {/* Provenance footer */}
        {node.source_ref && (
          <div className="px-3 py-0.5 bg-subtle border-t border-border-subtle text-[9px] font-mono text-text-muted truncate">
            {node.source_ref.file_path.split("/").pop()}
          </div>
        )}
      </div>
    </>
  );
};
