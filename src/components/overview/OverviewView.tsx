import React, { useEffect, useState } from "react";
import {
  Folder,
  Clock,
  FileCode,
  Layers,
  Code2,
  Boxes,
  AlertTriangle,
  FolderGit2,
} from "lucide-react";
import type {
  FrameworkDetection,
  OverviewDataDto,
  Project,
  ViewType,
} from "@/types/ipc";
import { getOverviewData } from "@/lib/tauri";
import { FrameworkEvidenceModal } from "./FrameworkEvidenceModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

/** Distinct neutral palette for language slices — engineering-readable, not AI-gradient */
const CHART_COLORS = [
  "#4D9EF7", // blue
  "#56C99A", // green
  "#F5A623", // amber
  "#9B8AFB", // purple
  "#F87171", // rose
  "#67C8E8", // teal
  "#A8B3C0", // slate
  "#C8D1D9", // light gray
];

interface OverviewViewProps {
  projectId?: number;
  currentProject: Project | null;
  onNavigateToView: (view: ViewType) => void;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  onFilterFilesByLanguage?: (lang: string) => void;
  onFilterFilesByStatus?: (status: string) => void;
  onOpenFolder?: () => void;
  onReanalyze?: () => void;
  initialData?: OverviewDataDto;
}

const stripUncPrefix = (path: string) => {
  // Remove UNC prefix \\?\ or //?/
  return path.replace(/^(\\{2}\?\\|\/\/\?\/)/u, "");
};

const formatAnalyzedAt = (iso?: string | null, durationMs?: number | null) => {
  if (iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
  if (durationMs != null) {
    return `Scan time ${(durationMs / 1000).toFixed(2)}s`;
  }
  return null;
};

export const OverviewView: React.FC<OverviewViewProps> = ({
  projectId,
  currentProject,
  onNavigateToView,
  onNavigateToFileLine,
  onFilterFilesByLanguage,
  onFilterFilesByStatus,
  onOpenFolder,
  onReanalyze,
  initialData,
}) => {
  const [data, setData] = useState<OverviewDataDto | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData && !!projectId);
  const [error, setError] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkDetection | null>(null);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setIsLoading(false);
      setError(null);
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
    setError(null);

    getOverviewData(id)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, currentProject?.id, initialData]);

  if (!currentProject && !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Folder className="w-5 h-5" />}
          title="No Project Loaded"
          description="Open a project workspace to inspect repository architecture, detected frameworks, entry points, and structural intelligence."
          action={
            onOpenFolder ? (
              <Button variant="primary" onClick={onOpenFolder}>
                Open Project Folder...
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Clock className="w-5 h-5" />}
          title="Overview failed to load"
          description={error}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                const id = currentProject?.id;
                if (!id) return;
                setIsLoading(true);
                setError(null);
                getOverviewData(id)
                  .then((res) => {
                    setData(res);
                    setIsLoading(false);
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : String(err));
                    setIsLoading(false);
                  });
              }}
            >
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Clock className="w-5 h-5" />}
          title="Loading overview"
          description="No completed analysis is available yet. Run analysis to fill this screen."
          action={
            onReanalyze ? (
              <Button variant="primary" onClick={onReanalyze}>
                Run analysis
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { metrics, languages, frameworks, entry_points, completion } = data;
  const analyzedAt = formatAnalyzedAt(completion?.completed_at, completion?.duration_ms);
  const displayPath = stripUncPrefix(data.root_path);

  // ── Donut chart math (enlarged for prominence) ───────────────────────────
  const DONUT_R = 72;
  const DONUT_CX = 95;
  const DONUT_CY = 95;
  const circumference = 2 * Math.PI * DONUT_R;
  const totalLangFiles = languages.reduce((s, l) => s + l.file_count, 0);
  const totalLangLines = languages.reduce((s, l) => s + l.line_count, 0);

  const metricItems: {
    testId: string;
    value: number;
    label: string;
    title: string;
    icon: React.ReactNode;
    onClick?: () => void;
    href?: string;
  }[] = [
    {
      testId: "metric-files",
      value: metrics.total_files,
      label: "Files",
      title: "Total source and asset files tracked in workspace. Click to view in Explorer.",
      icon: <FileCode className="w-4 h-4 text-accent" />,
      onClick: () => onNavigateToView("explorer"),
    },
    {
      testId: "metric-modules",
      value: metrics.total_modules,
      label: "Modules",
      title: "Directory modules clustered by import cohesion and directory structure. Click to view Architecture.",
      icon: <Layers className="w-4 h-4 text-text-muted" />,
      onClick: () => onNavigateToView("architecture"),
    },
    {
      testId: "metric-symbols",
      value: metrics.total_symbols,
      label: "Symbols",
      title: "Functions, classes, interfaces, and methods parsed into SQLite index. Click to view Code Intelligence.",
      icon: <Code2 className="w-4 h-4 text-text-muted" />,
      onClick: () => onNavigateToView("intelligence"),
    },
    {
      testId: "metric-entry-points",
      value: metrics.total_entry_points,
      label: "Entry points",
      title: "Application entry points from package manifests, server listeners, and main blocks.",
      icon: <FolderGit2 className="w-4 h-4 text-text-muted" />,
      href: "#entry-points-section",
    },
    {
      testId: "metric-dependencies",
      value: metrics.total_dependencies,
      label: "Dependencies",
      title: "External libraries declared in package manifests. Click to view Dependencies.",
      icon: <Boxes className="w-4 h-4 text-text-muted" />,
      onClick: () => onNavigateToView("dependencies"),
    },
    {
      testId: "metric-unsupported",
      value: metrics.unsupported_files_count + metrics.partial_files_count,
      label: "Partial / unsupported",
      title: "Files skipped due to unsupported language, binary content, size limits, or parse syntax issues. Click to view in Explorer.",
      icon: <AlertTriangle className="w-4 h-4 text-text-muted" />,
      onClick: () => {
        onFilterFilesByStatus?.("unsupported");
        onNavigateToView("explorer");
      },
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      {/* Project header */}
      <div className="px-6 py-5 border-b border-border-default">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-heading font-semibold text-text-primary">{data.project_name}</h1>
            <p className="text-caption font-mono text-text-muted truncate max-w-2xl mt-1">
              {displayPath}
            </p>
            <div className="text-caption text-text-secondary mt-1.5 flex items-center flex-wrap gap-2">
              <span>{analyzedAt ? `Last analysis ${analyzedAt}` : "No completed analysis yet"}</span>
              {completion?.duration_ms != null && (
                <span className="text-text-muted">{` · Scan Time: ${(completion.duration_ms / 1000).toFixed(2)}s`}</span>
              )}
              {completion?.files_parsed != null && (
                <span className="text-text-muted">
                  {` · Parsed: ${completion.files_parsed}/${completion.files_scanned} files`}
                </span>
              )}
              {completion?.status && (
                <span className="ml-1 px-2 py-0.5 rounded text-[11px] font-mono bg-elevated border border-border-subtle text-text-secondary">
                  {completion.status}
                </span>
              )}
            </div>
          </div>
          {onReanalyze && (
            <Button variant="secondary" size="sm" onClick={onReanalyze}>
              Re-analyze
            </Button>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div className="flex items-stretch border-b border-border-default divide-x divide-border-subtle bg-surface/50">
        {metricItems.map((item) => {
          const body = (
            <>
              <div className="flex items-center justify-between w-full">
                <div
                  className="text-2xl font-bold text-text-primary tabular-nums leading-none"
                  data-testid={item.testId}
                >
                  {item.value.toLocaleString()}
                </div>
                <span className="opacity-75 group-hover:opacity-100 transition-opacity">
                  {item.icon}
                </span>
              </div>
              <div className="text-[11px] text-text-muted mt-2 uppercase tracking-wider font-semibold">
                {item.label}
              </div>
            </>
          );
          const cls =
            "group w-full h-full px-4 py-3.5 text-left hover:bg-hover transition-colors duration-150 flex flex-col justify-between";
          if (item.href) {
            return (
              <Tooltip key={item.testId} content={item.title} wrapperClassName="flex flex-1 min-w-0">
                <a href={item.href} title={item.title} className={cls}>
                  {body}
                </a>
              </Tooltip>
            );
          }
          return (
            <Tooltip key={item.testId} content={item.title} wrapperClassName="flex flex-1 min-w-0">
              <button type="button" title={item.title} onClick={item.onClick} className={cls}>
                {body}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="p-6 space-y-8">
        {/* Languages — enlarged donut chart + proportional breakdown */}
        <section>
          <h2 className="text-subheading font-semibold text-text-primary border-b border-border-subtle pb-2 mb-4">
            Languages
          </h2>
          {languages.length === 0 ? (
            <p className="text-body text-text-secondary">None detected</p>
          ) : (
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 p-6 bg-surface border border-border-default rounded-lg">
              {/* Enlarged Donut chart (190x190) */}
              <div className="flex flex-col items-center flex-shrink-0">
                <svg
                  width="190"
                  height="190"
                  viewBox="0 0 190 190"
                  aria-label="Language distribution donut chart"
                  className="flex-shrink-0 drop-shadow-sm"
                >
                  {/* Background track */}
                  <circle
                    cx={DONUT_CX}
                    cy={DONUT_CY}
                    r={DONUT_R}
                    fill="none"
                    stroke="var(--bg-elevated)"
                    strokeWidth={22}
                  />
                  {/* Segments, rotated so 0° is at 12 o'clock */}
                  <g transform={`rotate(-90 ${DONUT_CX} ${DONUT_CY})`}>
                    {(() => {
                      let cumulative = 0;
                      return languages.map((lang, idx) => {
                        const pct = lang.percentage;
                        const dashLen = (pct / 100) * circumference;
                        const offset = circumference * (1 - cumulative / 100);
                        cumulative += pct;
                        if (dashLen < 0.5) return null;
                        return (
                          <circle
                            key={lang.name}
                            cx={DONUT_CX}
                            cy={DONUT_CY}
                            r={DONUT_R}
                            fill="none"
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth={22}
                            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                            strokeDashoffset={offset}
                          >
                            <title>{`${lang.name}: ${pct.toFixed(1)}%`}</title>
                          </circle>
                        );
                      });
                    })()}
                  </g>
                  {/* Center: file count */}
                  <text
                    x={DONUT_CX}
                    y={DONUT_CY - 7}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text-primary)"
                    fontSize="28"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {totalLangFiles.toLocaleString()}
                  </text>
                  <text
                    x={DONUT_CX}
                    y={DONUT_CY + 16}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text-muted)"
                    fontSize="12"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    files
                  </text>
                </svg>

                <div className="mt-2 text-caption font-mono text-text-muted text-center">
                  {totalLangLines.toLocaleString()} total lines
                </div>
                <div className="mt-1 text-[11px] font-mono text-text-faint text-center">
                  {languages.length} language{languages.length !== 1 ? "s" : ""}
                </div>
              </div>

              {/* Language list with visual progress indicator */}
              <ul className="flex-1 divide-y divide-border-subtle min-w-0 w-full">
                {languages.map((lang, idx) => (
                  <li key={lang.name}>
                    <button
                      type="button"
                      onClick={() => {
                        onFilterFilesByLanguage?.(lang.name);
                        onNavigateToView("explorer");
                      }}
                      className="w-full flex items-center justify-between gap-4 py-2.5 hover:bg-hover rounded-sm px-2 text-left group transition-colors duration-150"
                    >
                      {/* Left: Swatch + Name + Visual bar */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className="flex-shrink-0 w-3 h-3 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <span className="text-body font-semibold text-text-primary truncate">
                          {lang.name}
                        </span>
                        <div className="hidden sm:flex flex-1 max-w-[140px] h-1.5 bg-elevated rounded-full overflow-hidden ml-1">
                          <div
                            style={{
                              width: `${Math.max(lang.percentage, 2)}%`,
                              backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                            className="h-full rounded-full"
                          />
                        </div>
                      </div>

                      {/* Right: Numbers */}
                      <div className="text-caption text-text-muted flex items-center gap-4 flex-shrink-0 font-mono">
                        <span className="text-text-secondary">{lang.file_count} files</span>
                        <span>{lang.line_count.toLocaleString()} lines</span>
                        <span className="w-14 text-right font-semibold text-text-primary">
                          {lang.percentage}%
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Frameworks */}
        <section>
          <h2 className="text-subheading font-semibold text-text-primary border-b border-border-subtle pb-2 mb-4">
            Frameworks
          </h2>
          {frameworks.length === 0 ? (
            <p className="text-body text-text-secondary">
              No active frameworks detected based on code and manifest evidence.
            </p>
          ) : (
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {frameworks.map((fw) => (
                <div
                  key={fw.name}
                  data-testid={`framework-card-${fw.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-text-primary">{fw.name}</span>
                      <Badge variant={fw.confidence as "static" | "confirmed" | "inferred" | "unknown"} size="sm">
                        {fw.confidence}
                      </Badge>
                    </div>
                    <p className="text-caption text-text-muted mt-0.5">
                      {fw.version ? `${fw.version} · ` : ""}
                      {fw.confidence} · {fw.evidence.length} evidence record
                      {fw.evidence.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={() => setSelectedFramework(fw)}
                    aria-label={`Inspect evidence for ${fw.name}`}
                  >
                    View evidence
                  </Button>
                </div>
              ))}
            </div>
          )}

          {data.declared_only && data.declared_only.length > 0 && (
            <div className="mt-4" data-testid="declared-only-section">
              <h3 className="text-body font-semibold text-text-primary mb-2">
                Declared in Manifest (No Import Usage Detected)
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.declared_only.map((decl) => (
                  <span
                    key={decl.name}
                    data-testid={`declared-framework-${decl.name.toLowerCase()}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-caption bg-elevated border border-border-subtle text-text-secondary"
                  >
                    <span className="font-medium">{decl.name}</span>
                    {decl.version && <span className="font-mono text-text-muted">{decl.version}</span>}
                    <span className="text-micro text-text-muted">{decl.dependency_type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Entry points */}
        <section id="entry-points-section">
          <h2 className="text-subheading font-semibold text-text-primary border-b border-border-subtle pb-2 mb-4">
            Entry points
          </h2>
          {entry_points.length === 0 ? (
            <p className="text-body text-text-secondary">None detected</p>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table data-testid="entry-points-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>File Location</TableHead>
                    <TableHead>Code Snippet</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry_points.map((ep, idx) => (
                    <TableRow key={`${ep.file_path}-${ep.start_line}-${idx}`} className="h-9">
                      <TableCell className="font-medium">{ep.name}</TableCell>
                      <TableCell>
                        <Badge variant="neutral" size="sm">
                          {ep.entry_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onNavigateToFileLine?.(ep.file_path, ep.start_line)}
                          className="text-accent-text hover:underline flex items-center gap-1 font-mono text-caption"
                          title="Open file at line"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>
                            {ep.file_path}:{ep.start_line}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-caption text-text-muted max-w-xs truncate">
                        {ep.snippet}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={ep.confidence as "static" | "confirmed" | "inferred" | "unknown"}
                          size="sm"
                        >
                          {ep.confidence}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>

        {/* Architecture layers */}
        <section>
          <h2 className="text-subheading font-semibold text-text-primary border-b border-border-subtle pb-2 mb-4">
            Architecture layers
          </h2>
          {data.modules.length === 0 ? (
            <p className="text-body text-text-secondary">None detected</p>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {data.modules.map((m) => (
                <li key={m.name} className="flex items-center justify-between py-2.5 px-1">
                  <span className="text-body text-text-primary">{m.name}</span>
                  <span className="text-caption text-text-muted">
                    {m.file_count} files · {m.layer}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FrameworkEvidenceModal
        framework={selectedFramework}
        onClose={() => setSelectedFramework(null)}
        onNavigateToFileLine={onNavigateToFileLine}
      />
    </div>
  );
};
