import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  CircularDependencyCycle,
  DependencyOverview,
  GitRepoStatus,
  ImportEdge,
  Project,
} from "@/types/ipc";
import { DependenciesTable } from "./DependenciesTable";
import { CircularDependencyList } from "./CircularDependencyList";

interface DependenciesViewProps {
  currentProject: Project | null;
  lastAnalysisRunId?: number;
  onSelectFile?: (filePath: string) => void;
  /** When set, the view renders this index and does not call the backend. */
  initialEdges?: ImportEdge[];
  initialCycles?: CircularDependencyCycle[];
  initialOverview?: DependencyOverview | null;
}

export const DependenciesView: React.FC<DependenciesViewProps> = ({
  currentProject,
  lastAnalysisRunId,
  onSelectFile,
  initialEdges,
  initialCycles,
  initialOverview,
}) => {
  const [overview, setOverview] = useState<DependencyOverview | null>(null);
  const [edges, setEdges] = useState<ImportEdge[]>([]);
  const [cycles, setCycles] = useState<CircularDependencyCycle[]>([]);
  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const [ov, ed, cy, git] = await Promise.all([
        invoke<DependencyOverview>("get_dependencies_overview", {
          projectId: currentProject.id,
        }).catch(() => null),
        invoke<ImportEdge[]>("get_import_edges", {
          projectId: currentProject.id,
        }).catch(() => []),
        invoke<CircularDependencyCycle[]>("get_circular_dependencies", {
          projectId: currentProject.id,
        }).catch(() => []),
        invoke<GitRepoStatus>("get_git_status", {
          projectPath: currentProject.root_path,
        }).catch(() => null),
      ]);

      setOverview(ov);
      setEdges(ed);
      setCycles(cy);
      setGitStatus(git);
    } catch (e: any) {
      setError(e?.toString() || "Failed to load dependency data");
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  const handleResolveGraph = async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const ov = await invoke<DependencyOverview>("resolve_and_persist_project_graph", {
        projectId: currentProject.id,
        projectPath: currentProject.root_path,
      });
      setOverview(ov);
      await loadData();
    } catch (e: any) {
      setError(e?.toString() || "Failed to resolve project graph");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialEdges) {
      setEdges(initialEdges);
      setCycles(initialCycles ?? []);
      setOverview(initialOverview ?? null);
      setLoading(false);
      setError(null);
      return;
    }
    loadData();
  }, [loadData, lastAnalysisRunId, initialEdges, initialCycles, initialOverview]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Boxes className="w-5 h-5" />}
          title="No project open"
          description="Open a project folder, then run analysis. Dependency edges are read from the local index."
        />
      </div>
    );
  }

  if (error && !overview && edges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          title="Dependencies failed to load"
          description={error}
          action={
            <Button variant="secondary" onClick={loadData}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const figures = [
    {
      label: "Internal edges",
      value: overview?.internal_edges_count ?? edges.filter((e) => e.resolution_status === "internal").length,
      hint: "Import edges resolved to a file inside this repository.",
    },
    {
      label: "External packages",
      value: overview?.external_dependencies_count ?? edges.filter((e) => e.resolution_status === "external").length,
      hint: "Imports resolved to a package outside this repository.",
    },
    {
      label: "Cycles",
      value: cycles.length,
      hint: "Strongly connected groups of internal imports.",
    },
    {
      label: "Unused manifest deps",
      value: overview?.unused_dependencies_count ?? 0,
      hint: "Packages declared in a manifest with no matching import in the index.",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-canvas">
      <div className="px-4 py-3 border-b border-border-default flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-subheading font-semibold text-text-primary">Dependencies</h1>
          <p className="text-caption text-text-muted mt-0.5">
            Module edges, package imports, and import cycles from the local index.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {gitStatus?.is_git_repo && (
            <div className="flex items-center gap-1.5 text-caption text-text-secondary">
              <GitBranch className="w-3.5 h-3.5 text-text-muted" />
              <span>{gitStatus.current_branch || "HEAD"}</span>
              {gitStatus.commit_hash && (
                <span className="font-mono text-text-muted">{gitStatus.commit_hash.substring(0, 7)}</span>
              )}
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResolveGraph}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
          >
            Resolve graph
          </Button>
        </div>
      </div>

      {loading && edges.length === 0 && (
        <EmptyState title="Loading dependencies" description="Reading import edges from the local database." />
      )}

      {error && (
        <p className="px-4 py-2 text-caption text-status-danger-text border-b border-border-subtle">{error}</p>
      )}

      <div className="flex items-stretch border-b border-border-default">
        {figures.map((item, idx) => (
          <Tooltip key={item.label} content={item.hint} wrapperClassName="flex flex-1 min-w-0">
            <div
              className={`w-full px-4 py-3 ${idx < figures.length - 1 ? "border-r border-border-subtle" : ""}`}
              title={item.hint}
            >
              <div className="text-heading font-semibold text-text-primary tabular-nums">{item.value}</div>
              <div className="text-caption text-text-muted mt-0.5">{item.label}</div>
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <DependenciesTable edges={edges} onSelectFile={onSelectFile} />
        </div>
        <div className="w-80 border-l border-border-default overflow-y-auto bg-surface">
          <CircularDependencyList cycles={cycles} onSelectFile={onSelectFile} />
        </div>
      </div>
    </div>
  );
};

