import React, { useEffect, useState } from "react";
import { Database, KeyRound, Link2 } from "lucide-react";
import { getDatabaseTables } from "@/lib/tauri";
import type { DatabaseTable } from "@/types/ipc";
import { Badge, EmptyState } from "@/components/ui";

interface DatabaseViewProps {
  projectId?: number | null;
  lastAnalysisRunId?: number;
  onNavigateToFileLine?: (path: string, line: number) => void;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  projectId,
  lastAnalysisRunId,
  onNavigateToFileLine,
}) => {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTables([]);
      return;
    }
    setError(null);
    getDatabaseTables(projectId)
      .then(setTables)
      .catch((reason) => setError(String(reason)));
  }, [projectId, lastAnalysisRunId]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Database className="w-6 h-6" />}
          title="No project open"
          description="Open a project and run analysis to inspect declared schemas."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState title="Database schema failed to load" description={error} />
      </div>
    );
  }

  if (!tables.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Database className="w-6 h-6" />}
          title="No database schema detected"
          description="Run analysis on a project containing explicit SQL CREATE TABLE declarations or Prisma schema models (.prisma)."
        />
      </div>
    );
  }

  return (
    <section className="flex-1 min-h-0 overflow-auto bg-canvas" data-testid="database-view">
      <header className="px-6 py-4 border-b border-border-default bg-surface">
        <div className="flex items-center gap-2.5">
          <Database className="w-5 h-5 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">
            Database Schema & Entities
          </h1>
        </div>
        <p className="mt-1 text-caption text-text-secondary">
          Explicit schema declarations only. Inferred relationships are not shown here.
        </p>
      </header>
      <div className="p-6">
        <div className="max-w-5xl grid gap-4 xl:grid-cols-2">
          {tables.map((table) => (
            <article
              key={`${table.file_path}:${table.start_line}:${table.name}`}
              className="border border-border-default rounded-xl bg-surface overflow-hidden shadow-xs hover:border-border-strong transition-all duration-150"
            >
              <button
                className="w-full flex items-start justify-between gap-3 text-left px-4 py-3 hover:bg-hover focus-ring"
                onClick={() => onNavigateToFileLine?.(table.file_path, table.start_line)}
              >
                <div className="min-w-0">
                  <h2 className="font-mono text-sm font-semibold text-text-primary">
                    {table.name}
                  </h2>
                  <p className="mt-0.5 font-mono text-[11px] text-text-muted truncate">
                    {table.file_path}:{table.start_line}
                  </p>
                </div>
                <Badge variant={table.confidence as "static" | "confirmed" | "inferred" | "unknown"} size="sm">
                  {table.confidence}
                </Badge>
              </button>
              <div className="border-t border-border-subtle divide-y divide-border-subtle">
                {table.fields.map((field) => (
                  <div
                    key={`${field.name}:${field.line}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-hover/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-text-primary">{field.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-text-muted">
                        {field.declared_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {field.is_primary_key && (
                        <Badge variant="accent" size="sm">
                          <KeyRound className="w-3 h-3" />
                          PK
                        </Badge>
                      )}
                      {field.is_foreign_key && (
                        <Badge variant="neutral" size="sm">
                          <Link2 className="w-3 h-3" />
                          FK
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
