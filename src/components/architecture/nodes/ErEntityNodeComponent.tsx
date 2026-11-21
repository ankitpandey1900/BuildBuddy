import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Database, Key, Link2, ChevronDown, ChevronUp } from "lucide-react";
import type { DiagramNodeData } from "./DiagramNodeComponent";
import {
  DatabaseSchemaNode,
  DatabaseSchemaNodeHeader,
  DatabaseSchemaNodeBody,
  DatabaseSchemaTableRow,
  DatabaseSchemaTableCell,
} from "@/components/ui/database-schema-node";
import { FloatingNodeToolbar } from "../controls/FloatingNodeToolbar";

const COMPACT_THRESHOLD = 5;

export const ErEntityNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const node = data as unknown as DiagramNodeData;
  const isDimmed = node.isDimmed && !selected && !node.isHighlighted;
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse members into structured fields: "PK|name|type" or "FK|name|type" or "-|name|type"
  const fields = React.useMemo(() => {
    if (!node.members || node.members.length === 0) return [];
    return node.members.map((m) => {
      const parts = m.split("|");
      if (parts.length >= 3) {
        return {
          modifier: parts[0],
          name: parts[1],
          type: parts[2],
        };
      }
      return {
        modifier: "-",
        name: m,
        type: "",
      };
    });
  }, [node.members]);

  // In compact mode: prioritize PKs and FKs, then remaining up to threshold
  const visibleFields = React.useMemo(() => {
    if (isExpanded || fields.length <= COMPACT_THRESHOLD) {
      return fields;
    }
    const pks = fields.filter((f) => f.modifier === "PK");
    const fks = fields.filter((f) => f.modifier === "FK");
    const others = fields.filter((f) => f.modifier !== "PK" && f.modifier !== "FK");
    const combined = [...pks, ...fks, ...others.slice(0, Math.max(1, COMPACT_THRESHOLD - pks.length - fks.length))];
    return combined;
  }, [fields, isExpanded]);

  const hasHiddenFields = fields.length > COMPACT_THRESHOLD && !isExpanded;
  const hiddenCount = fields.length - visibleFields.length;

  return (
    <>
      <FloatingNodeToolbar
        isVisible={Boolean(selected)}
        label={node.label}
        kind="TABLE"
        sourceFilePath={node.source_ref?.file_path}
        sourceLine={node.source_ref?.start_line}
        onOpenSource={node.onOpenSource}
      />

      <DatabaseSchemaNode
        tabIndex={0}
        role="button"
        aria-label={`Database entity: ${node.label}`}
        data-testid={`diagram-node-${node.id}`}
        selected={Boolean(selected)}
        style={{
          width: node.width && node.width > 0 ? node.width : 240,
          minWidth: 220,
        }}
        className={`group transition-all duration-150 ${isDimmed ? "opacity-35" : "opacity-100"}`}
      >
        {/* Handles for connections on all 4 sides */}
        <Handle
          type="target"
          id="top"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-accent border-2 border-surface transition-transform duration-150 group-hover:scale-125"
        />
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-accent border-2 border-surface transition-transform duration-150 group-hover:scale-125"
        />
        <Handle
          type="target"
          id="left"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-accent border-2 border-surface transition-transform duration-150 group-hover:scale-125"
        />
        <Handle
          type="source"
          id="right"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-accent border-2 border-surface transition-transform duration-150 group-hover:scale-125"
        />

        {/* Entity Header */}
        <DatabaseSchemaNodeHeader>
          <div className="flex items-center space-x-2 min-w-0">
            <Database className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="font-mono font-bold text-xs text-text-primary truncate" title={node.label}>
              {node.label}
            </span>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            {fields.length > 0 && (
              <span className="text-[10px] font-mono text-text-muted">
                {fields.length} cols
              </span>
            )}
            <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted bg-subtle px-1.5 py-0.5 rounded border border-border-subtle">
              TABLE
            </span>
          </div>
        </DatabaseSchemaNodeHeader>

        {/* Field / Attribute List */}
        <DatabaseSchemaNodeBody>
          {fields.length > 0 ? (
            <>
              {visibleFields.map((f, idx) => {
                const isPk = f.modifier === "PK";
                const isFk = f.modifier === "FK";
                return (
                  <DatabaseSchemaTableRow key={idx}>
                    <DatabaseSchemaTableCell>
                      {isPk ? (
                        <span title="Primary Key" className="flex items-center">
                          <Key className="w-3 h-3 text-status-warning-text flex-shrink-0" />
                        </span>
                      ) : isFk ? (
                        <span title="Foreign Key" className="flex items-center">
                          <Link2 className="w-3 h-3 text-accent-default flex-shrink-0" />
                        </span>
                      ) : (
                        <span className="w-3 inline-block" />
                      )}
                      <span
                        className={`truncate text-[11px] ${
                          isPk
                            ? "font-bold text-text-primary"
                            : isFk
                            ? "font-medium text-text-primary"
                            : "text-text-secondary"
                        }`}
                      >
                        {f.name}
                      </span>
                    </DatabaseSchemaTableCell>
                    {f.type && (
                      <span className="text-[10px] text-text-muted ml-2 font-mono whitespace-nowrap px-1 py-0.2 rounded bg-elevated/40 border border-border-subtle/40">
                        {f.type}
                      </span>
                    )}
                  </DatabaseSchemaTableRow>
                );
              })}

              {/* Expand / Collapse toggle for large schemas */}
              {fields.length > COMPACT_THRESHOLD && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="w-full py-1 px-3 text-[10px] font-mono text-text-muted hover:text-text-primary hover:bg-hover flex items-center justify-center space-x-1 border-t border-border-subtle/60 transition-colors"
                >
                  {hasHiddenFields ? (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span>+ {hiddenCount} more columns</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      <span>Collapse columns</span>
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <div className="py-2.5 px-3 text-text-muted italic text-[11px]">
              {node.metrics?.function_count ? `${node.metrics.function_count} columns` : "Schema entity"}
            </div>
          )}
        </DatabaseSchemaNodeBody>

        {/* Footer Info */}
        {node.source_ref && (
          <div className="px-3 py-1 bg-surface border-t border-border-subtle text-[10px] font-mono text-text-muted truncate">
            {node.source_ref.file_path.split("/").pop()}:{node.source_ref.start_line}
          </div>
        )}
      </DatabaseSchemaNode>
    </>
  );
};
