import React, { useEffect, useState } from "react";
import {
  Folder,
  Code2,
  FileCode,
  Package,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Clock,
  CheckCircle,
  FileText,
  Boxes,
  PlayCircle,
  ArrowRight,
} from "lucide-react";
import type {
  FrameworkDetection,
  OverviewDataDto,
  Project,
  ViewType,
} from "@/types/ipc";
import { getOverviewData } from "@/lib/tauri";
import { FrameworkEvidenceModal } from "./FrameworkEvidenceModal";

interface OverviewViewProps {
  projectId?: number;
  currentProject: Project | null;
  onNavigateToView: (view: ViewType) => void;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  onFilterFilesByLanguage?: (lang: string) => void;
  onFilterFilesByStatus?: (status: string) => void;
  onOpenFolder?: () => void;
  initialData?: OverviewDataDto;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  projectId,
  currentProject,
  onNavigateToView,
  onNavigateToFileLine,
  onFilterFilesByLanguage,
  onFilterFilesByStatus,
  onOpenFolder,
  initialData,
}) => {
  const [data, setData] = useState<OverviewDataDto | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData && !!projectId);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkDetection | null>(null);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setIsLoading(false);
      return;
    }

    const id = projectId || currentProject?.id;
    if (!id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    getOverviewData(id)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load overview data:", err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, currentProject?.id, initialData]);

  // 1. Empty State
  if (!currentProject && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-canvas text-center">
        <div className="w-12 h-12 rounded-md bg-bg-subtle border border-border-default flex items-center justify-center mb-4 text-text-muted">
          <Folder className="w-6 h-6" />
        </div>
        <h2 className="text-heading font-semibold text-text-primary mb-2">No Project Loaded</h2>
        <p className="text-body text-text-muted max-w-md mb-6">
          Open a project workspace to inspect repository architecture, detected frameworks, entry points, and structural intelligence.
        </p>
        {onOpenFolder && (
          <button
            onClick={onOpenFolder}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-body font-medium rounded-md shadow-sm transition-colors"
          >
            Open Project Folder...
          </button>
        )}
      </div>
    );
  }

  // 2. Loading State
  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-canvas text-text-muted text-body font-mono">
        <Clock className="w-4 h-4 animate-spin mr-2" />
        Loading workspace architecture overview...
      </div>
    );
  }

  const { metrics, languages, frameworks, entry_points, completion } = data;

  return (
    <div className="flex-1 overflow-y-auto bg-canvas p-6 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border-default gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-title font-semibold text-text-primary">{data.project_name}</h1>
            {completion && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-status-success/10 text-status-success text-micro font-mono border border-status-success/20">
                <CheckCircle className="w-3.5 h-3.5" />
                {completion.status}
              </span>
            )}
          </div>
          <p className="text-caption font-mono text-text-muted truncate max-w-2xl mt-0.5">
            {data.root_path}
          </p>
        </div>

        {completion?.duration_ms != null && (
          <div className="flex items-center gap-4 text-caption font-mono text-text-muted bg-surface px-3 py-1.5 rounded-sm border border-border-subtle">
            <span>Scan Time: {(completion.duration_ms / 1000).toFixed(2)}s</span>
            <span>Parsed: {completion.files_parsed}/{completion.files_scanned} files</span>
          </div>
        )}
      </div>

      {/* Metrics Cards Grid */}
      <div>
        <h2 className="text-subheading font-semibold text-text-primary mb-3">Core Workspace Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Metric 1: Total Files */}
          <button
            onClick={() => onNavigateToView("explorer")}
            title="Total source and asset files tracked in workspace. Click to view in Explorer."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Total Files</span>
              <FileText className="w-4 h-4 group-hover:text-accent transition-colors" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-files">
              {metrics.total_files}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>View Explorer</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Metric 2: Modules */}
          <button
            onClick={() => onNavigateToView("architecture")}
            title="Directory modules clustered by import cohesion and directory structure. Click to view Architecture."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Modules</span>
              <Boxes className="w-4 h-4 group-hover:text-accent transition-colors" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-modules">
              {metrics.total_modules}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>View Architecture</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Metric 3: Symbols */}
          <button
            onClick={() => onNavigateToView("intelligence")}
            title="Functions, classes, interfaces, and methods parsed into SQLite index. Click to view Code Intelligence."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Symbols</span>
              <Code2 className="w-4 h-4 group-hover:text-accent transition-colors" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-symbols">
              {metrics.total_symbols}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>{metrics.total_functions} fn · {metrics.total_classes} cls</span>
            </div>
          </button>

          {/* Metric 4: Entry Points */}
          <a
            href="#entry-points-section"
            title="Application entry points from package manifests, server listeners, and main blocks."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Entry Points</span>
              <PlayCircle className="w-4 h-4 group-hover:text-accent transition-colors" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-entry-points">
              {metrics.total_entry_points}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>View Table Below</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </a>

          {/* Metric 5: Dependencies */}
          <button
            onClick={() => onNavigateToView("dependencies")}
            title="External libraries declared in package manifests. Click to view Dependencies."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Dependencies</span>
              <Package className="w-4 h-4 group-hover:text-accent transition-colors" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-dependencies">
              {metrics.total_dependencies}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>View Dependencies</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Metric 6: Unsupported / Partial Files */}
          <button
            onClick={() => {
              if (onFilterFilesByStatus) {
                onFilterFilesByStatus("unsupported");
              }
              onNavigateToView("explorer");
            }}
            title="Files skipped due to unsupported language, binary content, size limits, or parse syntax issues. Click to view in Explorer."
            className="flex flex-col p-3 bg-surface border border-border-default hover:border-border-strong rounded-sm text-left transition-colors group"
          >
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="text-micro font-medium uppercase tracking-wider">Partial / Unsup.</span>
              <AlertCircle className="w-4 h-4 text-status-warning" />
            </div>
            <div className="text-heading font-mono font-semibold text-text-primary" data-testid="metric-unsupported">
              {metrics.unsupported_files_count + metrics.partial_files_count}
            </div>
            <div className="text-micro text-text-muted mt-1 flex items-center gap-1 group-hover:text-accent">
              <span>{metrics.unsupported_files_count} unsup · {metrics.partial_files_count} part</span>
            </div>
          </button>
        </div>
      </div>

      {/* Frameworks Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-subheading font-semibold text-text-primary">Detected Frameworks</h2>
            <span
              className="text-text-muted"
              title="Frameworks verified from manifest dependencies, configuration files, AST imports, and structural source patterns. No package name in a comment or string is counted."
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>
          <span className="text-caption font-mono text-text-muted">
            {frameworks.length} framework{frameworks.length === 1 ? "" : "s"} detected
          </span>
        </div>

        {frameworks.length === 0 ? (
          <div className="p-4 bg-surface border border-border-default rounded-sm text-body text-text-muted font-mono">
            No active frameworks detected based on code and manifest evidence.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {frameworks.map((fw) => (
              <div
                key={fw.name}
                data-testid={`framework-card-${fw.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                className="p-4 bg-surface border border-border-default rounded-sm flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-body font-semibold text-text-primary">{fw.name}</span>
                    <span
                      className="px-1.5 py-0.5 rounded-sm text-micro font-mono uppercase tracking-wider border border-border-subtle bg-bg-subtle text-text-secondary"
                    >
                      {fw.confidence}
                    </span>
                  </div>
                  {fw.version && (
                    <div className="text-caption font-mono text-text-muted">
                      Constraint: {fw.version}
                    </div>
                  )}
                  <div className="text-caption text-text-secondary mt-1">
                    {fw.evidence.length} concrete verifiable evidence record{fw.evidence.length === 1 ? "" : "s"}.
                  </div>
                </div>

                <button
                  onClick={() => setSelectedFramework(fw)}
                  aria-label={`Inspect evidence for ${fw.name}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-bg-subtle hover:bg-bg-elevated border border-border-default rounded-sm text-caption font-medium text-text-primary transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-accent" />
                  <span>Inspect Evidence</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Languages & Modules Split Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Languages breakdown */}
        <div className="bg-surface border border-border-default rounded-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-subheading font-semibold text-text-primary">Languages</h2>
            <span
              className="text-text-muted"
              title="File and line distribution parsed across workspace. Click any language to filter files in Explorer."
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>

          {/* Distribution bar */}
          <div className="h-2 w-full bg-bg-subtle rounded-sm flex overflow-hidden mb-4">
            {languages.map((l, idx) => (
              <div
                key={l.name}
                style={{ width: `${Math.max(l.percentage, 2)}%` }}
                className={`h-full ${
                  idx % 4 === 0
                    ? "bg-accent"
                    : idx % 4 === 1
                    ? "bg-domain-backend-border"
                    : idx % 4 === 2
                    ? "bg-domain-database-border"
                    : "bg-domain-external-border"
                }`}
                title={`${l.name}: ${l.percentage}% (${l.file_count} files)`}
              />
            ))}
          </div>

          <div className="space-y-1.5 flex-1 overflow-y-auto max-h-56">
            {languages.map((lang) => (
              <button
                key={lang.name}
                onClick={() => {
                  if (onFilterFilesByLanguage) {
                    onFilterFilesByLanguage(lang.name);
                  }
                  onNavigateToView("explorer");
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-hover text-left transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption font-medium text-text-primary group-hover:text-accent">
                    {lang.name}
                  </span>
                  <span className="text-micro font-mono text-text-muted">
                    {lang.file_count} file{lang.file_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-caption font-mono text-text-secondary">
                    {lang.line_count.toLocaleString()} lines
                  </span>
                  <span className="text-micro font-mono text-text-muted w-12 text-right">
                    {lang.percentage}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Modules Layer Summary */}
        <div className="bg-surface border border-border-default rounded-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-subheading font-semibold text-text-primary">Architectural Layers</h2>
            <span
              className="text-text-muted"
              title="Modules classified into architectural layers (frontend, backend, data, shared, config) strictly from evidence. Unsubstantiated architecture patterns are unclassified."
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-64">
            {data.modules.length === 0 ? (
              <div className="text-body text-text-muted font-mono">No module groups detected.</div>
            ) : (
              data.modules.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between p-2 rounded-sm bg-bg-subtle/50 border border-border-subtle"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-mono font-medium text-text-primary">{m.name}</span>
                    <span className="text-micro font-mono text-text-muted">({m.file_count} files)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-micro font-mono text-text-muted">Cohesion: {m.cohesion_score}</span>
                    <span className="px-1.5 py-0.5 rounded-sm text-micro font-mono uppercase tracking-wider border border-border-default bg-surface text-text-secondary">
                      {m.layer}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Entry Points Section */}
      <div id="entry-points-section">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-subheading font-semibold text-text-primary">Application Entry Points</h2>
            <span
              className="text-text-muted"
              title="Startup files and commands identified from package manifests, server listeners, framework configurations, and Python __main__ blocks."
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>
          <span className="text-caption font-mono text-text-muted">
            {entry_points.length} entry point{entry_points.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="bg-surface border border-border-default rounded-sm overflow-hidden">
          <table className="w-full text-left border-collapse" data-testid="entry-points-table">
            <thead>
              <tr className="border-b border-border-default bg-bg-canvas text-micro font-mono uppercase tracking-wider text-text-muted">
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">File Location</th>
                <th className="py-2 px-3">Code Snippet</th>
                <th className="py-2 px-3 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-caption font-mono">
              {entry_points.map((ep, idx) => (
                <tr key={`${ep.file_path}-${ep.start_line}-${idx}`} className="hover:bg-hover transition-colors">
                  <td className="py-2 px-3 font-medium text-text-primary">{ep.name}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded-sm text-micro bg-bg-subtle text-text-secondary border border-border-subtle">
                      {ep.entry_type}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => onNavigateToFileLine && onNavigateToFileLine(ep.file_path, ep.start_line)}
                      className="text-accent hover:underline flex items-center gap-1"
                      title="Open file at line"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>{ep.file_path}:{ep.start_line}</span>
                    </button>
                  </td>
                  <td className="py-2 px-3 text-text-muted truncate max-w-xs">{ep.snippet}</td>
                  <td className="py-2 px-3 text-right">
                    <span className="px-1.5 py-0.5 rounded-sm text-micro uppercase tracking-wider bg-bg-subtle text-text-secondary border border-border-subtle">
                      {ep.confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Framework Evidence Modal */}
      <FrameworkEvidenceModal
        framework={selectedFramework}
        onClose={() => setSelectedFramework(null)}
        onNavigateToFileLine={onNavigateToFileLine}
      />
    </div>
  );
};
