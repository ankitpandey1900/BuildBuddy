import React, { useState } from "react";
import { NodeToolbar, Position, useNodeId } from "@xyflow/react";
import { ExternalLink, Copy, Check, Eye, Network } from "lucide-react";

export interface FloatingNodeToolbarProps {
  isVisible: boolean;
  label: string;
  kind?: string;
  sourceFilePath?: string;
  sourceLine?: number;
  onOpenSource?: (filePath: string, line: number) => void;
  onInspect?: () => void;
  onFocusConnections?: () => void;
}

export const FloatingNodeToolbar: React.FC<FloatingNodeToolbarProps> = ({
  isVisible,
  label,
  kind,
  sourceFilePath,
  sourceLine,
  onOpenSource,
  onInspect,
  onFocusConnections,
}) => {
  const [copied, setCopied] = useState(false);
  const nodeId = useNodeId();

  if (!isVisible) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sourceFilePath || label);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sourceFilePath && onOpenSource) {
      onOpenSource(sourceFilePath, sourceLine ?? 1);
    }
  };

  const handleInspect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInspect) onInspect();
  };

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFocusConnections) onFocusConnections();
  };

  const content = (
    <div
      data-testid="floating-node-toolbar"
      className="flex items-center gap-1 p-1 bg-surface/95 backdrop-blur-md border border-border-default rounded-lg shadow-menu text-text-primary z-50 animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center gap-1 px-1.5 py-0.5 border-r border-border-subtle text-micro font-mono text-text-muted">
        <span className="max-w-[120px] truncate font-semibold text-text-primary" title={label}>
          {label}
        </span>
        {kind && (
          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-elevated border border-border-subtle">
            {kind}
          </span>
        )}
      </div>

      {sourceFilePath && onOpenSource && (
        <button
          type="button"
          onClick={handleSource}
          className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-hover text-micro font-medium text-accent hover:text-accent-hover transition-colors"
          title={`Open ${sourceFilePath} in Explorer`}
        >
          <ExternalLink className="w-3 h-3" />
          <span>Source</span>
        </button>
      )}

      {onInspect && (
        <button
          type="button"
          onClick={handleInspect}
          className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-hover text-micro font-medium text-text-secondary hover:text-text-primary transition-colors"
          title="Inspect node details"
        >
          <Eye className="w-3 h-3 text-text-muted" />
          <span>Inspect</span>
        </button>
      )}

      {onFocusConnections && (
        <button
          type="button"
          onClick={handleFocus}
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary transition-colors"
          title="Focus connected edges"
        >
          <Network className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary transition-colors"
        title="Copy path or name"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-status-success-text" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );

  if (!nodeId) {
    return content;
  }

  return (
    <NodeToolbar isVisible={isVisible} position={Position.Top} offset={8}>
      {content}
    </NodeToolbar>
  );
};
