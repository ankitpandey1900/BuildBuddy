import React from "react";
import { AlertTriangle, ArrowRight, CornerDownRight } from "lucide-react";
import type { CircularDependencyCycle } from "@/types/ipc";

interface CircularDependencyListProps {
  cycles: CircularDependencyCycle[];
  onSelectFile?: (filePath: string) => void;
}

export const CircularDependencyList: React.FC<CircularDependencyListProps> = ({
  cycles,
  onSelectFile,
}) => {
  if (cycles.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted text-xs border border-border-default rounded-md bg-surface/50">
        No circular dependency cycles detected. Clean directed acyclic graph.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
        <AlertTriangle className="w-4 h-4" />
        <span>{cycles.length} Circular Import Cycle{cycles.length > 1 ? "s" : ""}</span>
      </div>

      <div className="flex flex-col gap-2">
        {cycles.map((cycle, idx) => (
          <div
            key={idx}
            className="p-3 bg-surface border border-border-default rounded-md text-xs flex flex-col gap-2"
          >
            <div className="text-text-secondary font-sans text-caption font-medium flex items-center justify-between">
              <span>Cycle #{idx + 1} ({cycle.cycle_files.length} files)</span>
            </div>

            <div className="flex flex-col gap-1 pl-1 font-mono text-micro text-text-primary">
              {cycle.cycle_files.map((file, fileIdx) => {
                const isLast = fileIdx === cycle.cycle_files.length - 1;
                return (
                  <div key={fileIdx} className="flex items-center gap-1.5 group">
                    {fileIdx === 0 ? (
                      <span className="w-3 text-text-muted">1.</span>
                    ) : (
                      <CornerDownRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectFile?.(file)}
                      className="hover:underline hover:text-accent truncate text-left"
                      title={file}
                    >
                      {file}
                    </button>
                    {isLast && (
                      <div className="flex items-center gap-1 text-amber-500/80 text-micro ml-1">
                        <ArrowRight className="w-2.5 h-2.5" />
                        <span>loops back to {cycle.cycle_files[0]}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

