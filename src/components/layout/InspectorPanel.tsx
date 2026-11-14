import React from "react";
import { ChevronRight, FileText, Hash, Layers, ShieldCheck } from "lucide-react";
import type { FileRecord } from "@/types/ipc";
import { Badge } from "@/components/ui/Badge";

interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  selectedFile: FileRecord | null;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  onToggle,
  width,
  selectedFile,
}) => {
  if (!isOpen) {
    return (
      <div className="w-8 bg-surface border-l border-border-default flex flex-col items-center py-2 flex-shrink-0">
        <button
          onClick={onToggle}
          title="Open Inspector Panel"
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="[writing-mode:vertical-lr] rotate-180 mt-4 text-micro font-mono text-text-muted uppercase tracking-wider select-none">
          Inspector
        </span>
      </div>
    );
  }

  return (
    <aside
      style={{ width }}
      className="bg-surface border-l border-border-default flex flex-col select-none flex-shrink-0"
    >
      {/* Header */}
      <div className="h-8 border-b border-border-default px-3 flex items-center justify-between">
        <span className="text-caption font-semibold text-text-primary uppercase tracking-wider font-mono">
          File Inspector
        </span>
        <button
          onClick={onToggle}
          title="Collapse Inspector"
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-meta">
        {selectedFile ? (
          <div className="flex flex-col gap-4">
            {/* File Header */}
            <div className="flex items-start gap-2.5 pb-3 border-b border-border-subtle">
              <FileText className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-text-primary text-body truncate">
                  {selectedFile.file_name}
                </span>
                <span className="text-caption font-mono text-text-muted break-all">
                  {selectedFile.relative_path}
                </span>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-caption font-mono">
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Lines</span>
                <span className="text-text-primary font-medium text-body">
                  {selectedFile.line_count.toLocaleString()}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Size</span>
                <span className="text-text-primary font-medium text-body">
                  {formatBytes(selectedFile.size_bytes)}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Extension</span>
                <span className="text-text-primary font-medium text-body">
                  {selectedFile.extension ? `.${selectedFile.extension}` : "none"}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Status</span>
                <Badge variant={selectedFile.status === "parsed" ? "confirmed" : "neutral"} size="sm">
                  {selectedFile.status}
                </Badge>
              </div>
            </div>

            {/* Content Hash */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-text-muted text-micro uppercase font-mono">
                <Hash className="w-3 h-3" />
                <span>Content Hash (BLAKE3)</span>
              </div>
              <div className="p-1.5 bg-canvas rounded border border-border-subtle font-mono text-micro text-text-muted break-all select-text">
                {selectedFile.content_hash || "Not hashed"}
              </div>
            </div>

            {/* Provenance note */}
            <div className="p-2.5 bg-accent/5 rounded border border-accent/20 flex flex-col gap-1 text-micro text-text-secondary">
              <div className="flex items-center gap-1 text-accent font-medium font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Provenance Tracked</span>
              </div>
              <p>
                Static structural analysis records exact line spans and source evidence in SQLite.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted gap-2 py-12">
            <Layers className="w-8 h-8 text-text-faint" />
            <p className="text-caption">Select a file from the explorer to view its properties and metrics.</p>
          </div>
        )}
      </div>
    </aside>
  );
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

