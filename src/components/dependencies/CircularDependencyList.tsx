import React from "react";
import { ArrowRight, CornerDownRight } from "lucide-react";
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
      <div className="p-4 text-caption text-text-secondary">
        No circular dependency cycles detected.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-primary border-b border-border-default bg-surface/50">
        {cycles.length} Circular Import Cycle{cycles.length > 1 ? "s" : ""}
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {cycles.map((cycle, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg border border-border-default bg-canvas/60 hover:border-border-strong text-caption flex flex-col gap-2 transition-all duration-150"
          >
            <div className="text-text-secondary font-sans text-caption font-medium flex items-center justify-between">
              <span className="font-semibold text-text-primary">Cycle #{idx + 1}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated border border-border-subtle text-text-muted">
                {cycle.cycle_files.length} files
              </span>
            </div>

            <div className="flex flex-col gap-1 pl-0.5 font-mono text-micro text-text-primary">
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
                      className="hover:underline hover:text-accent truncate text-left text-text-secondary hover:text-text-primary transition-colors"
                      title={file}
                    >
                      {file}
                    </button>
                    {isLast && (
                      <div className="flex items-center gap-1 text-text-muted text-caption ml-1">
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

