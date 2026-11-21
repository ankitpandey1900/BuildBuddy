import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { getFindings } from "@/lib/tauri";
import type { Finding } from "@/types/ipc";
import { Badge, EmptyState, SearchInput, Toolbar, ToolbarGroup } from "@/components/ui";

interface FindingsViewProps {
  projectId?: number | null;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialFindings?: Finding[];
}

const severityVariant = (severity: Finding["severity"]): "danger" | "warning" | "neutral" =>
  severity === "critical" || severity === "high"
    ? "danger"
    : severity === "medium"
    ? "warning"
    : "neutral";

export const FindingsView: React.FC<FindingsViewProps> = ({
  projectId,
  onNavigateToFileLine,
  initialFindings,
}) => {
  const [findings, setFindings] = useState<Finding[]>(initialFindings ?? []);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFindings) {
      setFindings(initialFindings);
      return;
    }
    if (!projectId) {
      setFindings([]);
      return;
    }
    setLoading(true);
    setError(null);
    getFindings(projectId)
      .then(setFindings)
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));
  }, [initialFindings, projectId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? findings.filter((finding) =>
          `${finding.category} ${finding.title} ${finding.description} ${finding.file_path ?? ""}`
            .toLowerCase()
            .includes(normalized)
        )
      : findings;
  }, [findings, query]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="No project open"
          description="Open a project, then run analysis to inspect static findings."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          title="Loading findings"
          description="Reading evidence-backed results from the local analysis index."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState title="Findings failed to load" description={error} />
      </div>
    );
  }

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-canvas" data-testid="findings-view">
      <header className="px-6 py-4 border-b border-border-default bg-surface">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">
            Security & Health Findings
          </h1>
        </div>
        <p className="mt-1 text-caption text-text-secondary">
          Evidence-backed static review prompts. They are not runtime or exploit claims.
        </p>
      </header>

      <Toolbar className="px-6 border-b border-border-default bg-surface">
        <ToolbarGroup className="flex-1">
          <div className="w-80 max-w-full">
            <SearchInput
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search findings..."
            />
          </div>
        </ToolbarGroup>
        <span className="text-meta text-text-muted tabular-nums">
          {filtered.length} finding{filtered.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="w-5 h-5" />}
          title="No findings in this view"
          description={
            findings.length
              ? "Try a different search."
              : "Run analysis to evaluate dependency and complexity signals."
          }
        />
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl space-y-3">
            {filtered.map((finding) => (
              <article
                key={finding.id}
                className="border border-border-default bg-surface rounded-xl px-5 py-4 shadow-xs hover:border-border-strong transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-text-primary">{finding.title}</h2>
                      <Badge size="sm" variant="neutral">
                        {finding.category.replace(/_/g, " ")}
                      </Badge>
                      <Badge size="sm" variant={severityVariant(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <Badge size="sm" variant={finding.confidence}>
                        {finding.confidence}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                      {finding.description}
                    </p>
                  </div>
                </div>
                {finding.file_path && finding.start_line && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToFileLine?.(finding.file_path!, finding.start_line!)
                    }
                    className="mt-3 text-xs font-mono text-accent-text hover:underline focus-ring rounded-sm inline-flex items-center gap-1"
                  >
                    <span>{finding.file_path}:{finding.start_line}</span>
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
