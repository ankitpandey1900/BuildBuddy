import React from "react";
import { AlertCircle, ChevronRight, X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type PipelineStage = "scan" | "parse" | "analyze" | "complete" | "error";

export interface PipelineProgressProps {
  stage: PipelineStage;
  filesProcessed?: number;
  totalFiles?: number;
  currentFile?: string;
  onCancel?: () => void;
  error?: string | null;
  errorDetails?: string | null;
  className?: string;
}

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "scan", label: "Scan" },
  { id: "parse", label: "Parse" },
  { id: "analyze", label: "Analyze" },
];

export const PipelineProgress: React.FC<PipelineProgressProps> = ({
  stage,
  filesProcessed = 0,
  totalFiles,
  currentFile,
  onCancel,
  error,
  errorDetails,
  className = "",
}) => {
  // If no active pipeline and no error, do not render
  if (stage === "complete" && !error) return null;

  const currentStageIndex = STAGES.findIndex((s) => s.id === stage);
  const percent =
    totalFiles && totalFiles > 0
      ? Math.min(100, Math.round((filesProcessed / totalFiles) * 100))
      : null;

  const getStageDescription = () => {
    switch (stage) {
      case "scan":
        return totalFiles
          ? `Scanning repository (${filesProcessed} of ${totalFiles} files)`
          : `Scanning repository (${filesProcessed} files found)`;
      case "parse":
        return totalFiles
          ? `Parsing symbols & AST (${filesProcessed} of ${totalFiles} files)`
          : `Parsing symbols (${filesProcessed} files)`;
      case "analyze":
        return "Analyzing dependency graph & relationships...";
      case "error":
        return error || "Analysis pipeline paused due to an error";
      default:
        return "Ready";
    }
  };

  return (
    <div
      data-testid="pipeline-progress"
      className={`bg-surface border-b border-border-default px-4 py-2 flex flex-col gap-2 select-none font-sans text-text-primary transition-all duration-150 ${className}`}
    >
      {/* Top row: Stage Indicators, Description, and Cancel Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Calm 3-stage breadcrumb: Scan -> Parse -> Analyze */}
          <div className="flex items-center gap-1.5 text-caption flex-shrink-0">
            {STAGES.map((s, index) => {
              const isActive = s.id === stage;
              const isPast =
                currentStageIndex !== -1 && index < currentStageIndex;
              const isFailed = stage === "error" && index === currentStageIndex;

              return (
                <React.Fragment key={s.id}>
                  {index > 0 && (
                    <ChevronRight className="w-3 h-3 text-text-muted" />
                  )}
                  <div
                    data-testid={`pipeline-stage-${s.id}`}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-medium transition-colors ${
                      isFailed
                        ? "text-status-danger-text bg-status-danger-bg/40 font-semibold"
                        : isActive
                        ? "text-accent bg-accent-subtle font-semibold"
                        : isPast
                        ? "text-text-secondary"
                        : "text-text-muted"
                    }`}
                  >
                    {isActive ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-accent" />
                    ) : isPast ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-status-success-text" />
                    ) : null}
                    <span>{s.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="h-3 w-px bg-border-subtle flex-shrink-0" />

          {/* Current Stage Summary & File Count */}
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-caption font-medium text-text-primary truncate">
              {getStageDescription()}
            </span>
            {percent !== null && (
              <span className="text-caption text-text-muted flex-shrink-0 font-mono">
                {percent}%
              </span>
            )}
          </div>
        </div>

        {/* Cancel Button */}
        {onCancel && stage !== "complete" && stage !== "error" && (
          <Button
            variant="plain"
            size="sm"
            onClick={onCancel}
            data-testid="pipeline-cancel-btn"
            icon={<X className="w-3.5 h-3.5 text-text-muted" />}
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      {stage !== "error" && (
        <div className="w-full h-1 bg-subtle rounded-full overflow-hidden relative">
          {percent !== null ? (
            <div
              className="h-full bg-accent transition-all duration-150 ease-out rounded-full"
              style={{ width: `${percent}%` }}
            />
          ) : (
            <div className="h-full bg-accent w-1/3 rounded-full animate-pulse" />
          )}
        </div>
      )}

      {/* Current File Being Processed */}
      {currentFile && stage !== "error" && (
        <div className="text-micro font-mono text-text-muted truncate max-w-xl">
          {currentFile}
        </div>
      )}

      {/* Plain Language Error State with Disclosure */}
      {stage === "error" && (
        <div
          data-testid="pipeline-error"
          className="mt-1 p-2.5 rounded-sm bg-status-danger-bg/30 border border-status-danger-border flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2 text-caption font-medium text-status-danger-text">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>The analysis pipeline was interrupted.</span>
          </div>

          <p className="text-caption text-text-secondary">
            {error || "An unexpected error occurred while analyzing the codebase."}
          </p>

          {(errorDetails || error) && (
            <details
              data-testid="pipeline-error-disclosure"
              className="mt-1 text-caption text-text-muted group"
            >
              <summary className="cursor-pointer hover:text-text-primary transition-colors select-none font-medium text-[11px]">
                Show details
              </summary>
              <pre className="mt-1.5 p-2 bg-canvas border border-border-default rounded-sm text-micro font-mono text-status-danger-text whitespace-pre-wrap overflow-x-auto leading-relaxed">
                {errorDetails || error}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
