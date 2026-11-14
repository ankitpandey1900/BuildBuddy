import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Boxes,
  GitBranch,
  RefreshCw,
  AlertTriangle,
  Package,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
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
  onSelectFile?: (filePath: string) => void;
}

export const DependenciesView: React.FC<DependenciesViewProps> = ({
  currentProject,
  onSelectFile,
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
    loadData();
  }, [loadData]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
        <Boxes className="w-12 h-12 mb-3 text-text-muted/40 stroke-1" />
        <p className="text-sm">Open a project workspace to analyze dependencies and graph cycles.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-canvas p-4 gap-4">
      {/* Top Header & Metrics Bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Boxes className="w-4 h-4 text-accent" />
            Dependency Inventory & Graph Analysis
          </h1>
          <p className="text-micro text-text-muted">
            Resolved module edges, package manifests, and strongly connected cycles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {gitStatus?.is_git_repo && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border-default rounded text-micro font-mono text-text-secondary">
              <GitBranch className="w-3.5 h-3.5 text-text-muted" />
              <span>{gitStatus.current_branch || "HEAD"}</span>
              {gitStatus.commit_hash && (
                <span className="text-text-muted">
                  ({gitStatus.commit_hash.substring(0, 7)})
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleResolveGraph}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 bg-accent/15 text-accent border border-accent/30 rounded text-xs hover:bg-accent/25 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Resolve Graph</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-surface border border-border-default rounded-md flex flex-col">
          <div className="flex items-center justify-between text-text-muted text-micro">
            <span>Internal Edges</span>
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </div>
          <span className="text-lg font-mono font-semibold text-text-primary mt-1">
            {overview?.internal_edges_count ?? edges.filter(e => e.resolution_status === "internal").length}
          </span>
        </div>

        <div className="p-3 bg-surface border border-border-default rounded-md flex flex-col">
          <div className="flex items-center justify-between text-text-muted text-micro">
            <span>External Packages</span>
            <Package className="w-3.5 h-3.5" />
          </div>
          <span className="text-lg font-mono font-semibold text-text-primary mt-1">
            {overview?.external_dependencies_count ?? edges.filter(e => e.resolution_status === "external").length}
          </span>
        </div>

        <div className="p-3 bg-surface border border-border-default rounded-md flex flex-col">
          <div className="flex items-center justify-between text-text-muted text-micro">
            <span>Circular Cycles</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <span className={`text-lg font-mono font-semibold mt-1 ${cycles.length > 0 ? "text-amber-400" : "text-text-primary"}`}>
            {cycles.length}
          </span>
        </div>

        <div className="p-3 bg-surface border border-border-default rounded-md flex flex-col">
          <div className="flex items-center justify-between text-text-muted text-micro">
            <span>Unused Manifest Deps</span>
            <Layers className="w-3.5 h-3.5" />
          </div>
          <span className="text-lg font-mono font-semibold text-text-primary mt-1">
            {overview?.unused_dependencies_count ?? 0}
          </span>
        </div>
      </div>

      {/* Main Content Area: Split Table + Circular Cycles Panel */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <DependenciesTable edges={edges} onSelectFile={onSelectFile} />
        </div>

        <div className="w-80 flex flex-col overflow-y-auto">
          <CircularDependencyList cycles={cycles} onSelectFile={onSelectFile} />
        </div>
      </div>
    </div>
  );
};

