import React from "react";
import { X, FileCode, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import type { FrameworkDetection } from "@/types/ipc";

interface FrameworkEvidenceModalProps {
  framework: FrameworkDetection | null;
  onClose: () => void;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
}

export const FrameworkEvidenceModal: React.FC<FrameworkEvidenceModalProps> = ({
  framework,
  onClose,
  onNavigateToFileLine,
}) => {
  if (!framework) return null;

  const getSignalBadge = (signalType: string) => {
    switch (signalType) {
      case "manifest_dependency":
        return <span className="px-1.5 py-0.5 rounded-sm bg-accent-subtle text-accent-text text-micro font-mono border border-border-default">Manifest</span>;
      case "config_file":
        return <span className="px-1.5 py-0.5 rounded-sm bg-domain-backend-bg text-domain-backend-border text-micro font-mono border border-domain-backend-border">Config</span>;
      case "import_usage":
        return <span className="px-1.5 py-0.5 rounded-sm bg-domain-frontend-bg text-domain-frontend-border text-micro font-mono border border-domain-frontend-border">AST Import</span>;
      case "source_pattern":
        return <span className="px-1.5 py-0.5 rounded-sm bg-domain-database-bg text-domain-database-border text-micro font-mono border border-domain-database-border">Source Pattern</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded-sm bg-bg-subtle text-text-muted text-micro font-mono border border-border-subtle">{signalType}</span>;
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence.toLowerCase()) {
      case "confirmed":
        return <CheckCircle2 className="w-4 h-4 text-status-success inline-block mr-1" />;
      case "static":
        return <CheckCircle2 className="w-4 h-4 text-accent inline-block mr-1" />;
      case "inferred":
        return <AlertTriangle className="w-4 h-4 text-status-warning inline-block mr-1" />;
      default:
        return <HelpCircle className="w-4 h-4 text-text-muted inline-block mr-1" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="framework-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border-default rounded-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-canvas">
          <div className="flex items-center gap-2">
            <h2 id="framework-modal-title" className="text-subheading font-semibold text-text-primary">
              {framework.name} Evidence
            </h2>
            {framework.version && (
              <span className="text-micro font-mono px-1.5 py-0.5 bg-bg-subtle text-text-secondary border border-border-subtle rounded-sm">
                {framework.version}
              </span>
            )}
            <span className="flex items-center text-micro font-mono px-1.5 py-0.5 bg-bg-subtle text-text-secondary border border-border-subtle rounded-sm uppercase tracking-wider">
              {getConfidenceIcon(framework.confidence)}
              {framework.confidence}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-body text-text-secondary">
            Detected from {framework.evidence.length} concrete verifiable signal{framework.evidence.length === 1 ? "" : "s"} in workspace source code and manifests:
          </p>

          <div className="space-y-2">
            {framework.evidence.map((ev, index) => (
              <div
                key={`${ev.file_path}-${ev.start_line}-${index}`}
                className="p-3 bg-bg-subtle/60 border border-border-subtle rounded-sm flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getSignalBadge(ev.signal_type)}
                    <span className="text-body font-medium text-text-primary">{ev.description}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (onNavigateToFileLine) {
                        onNavigateToFileLine(ev.file_path, ev.start_line);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1 text-micro font-mono text-accent hover:underline"
                    title="Jump to source line"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{ev.file_path}:{ev.start_line}</span>
                  </button>
                </div>

                {ev.snippet && (
                  <pre className="mt-1 p-2 bg-bg-canvas border border-border-subtle rounded-sm text-micro font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">
                    <code>{ev.snippet}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border-default bg-bg-canvas flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-bg-subtle hover:bg-bg-elevated text-text-primary text-body rounded-sm border border-border-default transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
