import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Code,
  Boxes,
  Lock,
  ExternalLink,
  X,
  RotateCcw,
} from "lucide-react";
import { getFindings } from "@/lib/tauri";
import type { Finding } from "@/types/ipc";
import { Badge, Button, EmptyState, SearchInput, Toolbar, ToolbarGroup } from "@/components/ui";

export interface FindingsViewProps {
  projectId?: number | null;
  lastAnalysisRunId?: number;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialFindings?: Finding[];
}

const severityVariant = (
  severity: Finding["severity"]
): "danger" | "warning" | "neutral" =>
  severity === "critical" || severity === "high"
    ? "danger"
    : severity === "medium"
    ? "warning"
    : "neutral";

export const FindingsView: React.FC<FindingsViewProps> = ({
  projectId,
  lastAnalysisRunId,
  onNavigateToFileLine,
  initialFindings,
}) => {
  const [findings, setFindings] = useState<Finding[]>(initialFindings ?? []);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFindings = async () => {
    if (!projectId) {
      setFindings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getFindings(projectId);
      setFindings(data);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFindings) {
      setFindings(initialFindings);
      return;
    }
    if (projectId) {
      void loadFindings();
    }
  }, [initialFindings, projectId, lastAnalysisRunId]);

  // Compute security metrics
  const metrics = useMemo(() => {
    const total = findings.length;
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    const low = findings.filter((f) => f.severity === "low" || f.severity === "info").length;
    const criticalHigh = critical + high;

    const securityCount = findings.filter((f) => f.category === "security").length;
    const complexityCount = findings.filter((f) => f.category === "complexity").length;
    const cycleCount = findings.filter((f) => f.category === "circular_dependency").length;
    const deadCodeCount = findings.filter((f) => f.category === "dead_code").length;

    return {
      total,
      critical,
      high,
      medium,
      low,
      criticalHigh,
      securityCount,
      complexityCount,
      cycleCount,
      deadCodeCount,
    };
  }, [findings]);

  // Filtered findings based on search, severity, and category
  const filtered = useMemo(() => {
    return findings.filter((finding) => {
      // Severity filter
      if (severityFilter === "critical_high") {
        if (finding.severity !== "critical" && finding.severity !== "high") return false;
      } else if (severityFilter === "medium") {
        if (finding.severity !== "medium") return false;
      } else if (severityFilter === "low") {
        if (finding.severity !== "low" && finding.severity !== "info") return false;
      }

      // Category filter
      if (categoryFilter !== "all" && finding.category !== categoryFilter) {
        return false;
      }

      // Text query
      if (query.trim()) {
        const normalized = query.trim().toLowerCase();
        const matches = `${finding.category} ${finding.title} ${finding.description} ${finding.file_path ?? ""}`
          .toLowerCase()
          .includes(normalized);
        if (!matches) return false;
      }

      return true;
    });
  }, [findings, severityFilter, categoryFilter, query]);

  const getRemediationAdvice = (category: string, title: string) => {
    const cat = category.toLowerCase();
    const t = title.toLowerCase();
    if (cat.includes("security") || t.includes("secret") || t.includes("key")) {
      return "Recommended remediation: Remove hardcoded credentials from source code. Migrate to environment variables (.env) or runtime secret manager.";
    }
    if (cat.includes("complexity") || t.includes("complexity")) {
      return "Recommended remediation: Decompose this function into smaller, single-responsibility helper routines to reduce branching paths and simplify testability.";
    }
    if (cat.includes("circular") || t.includes("cycle")) {
      return "Recommended remediation: Break dependency loop by extracting shared models/interfaces into a common types module or inverting control.";
    }
    if (cat.includes("dead") || t.includes("unused")) {
      return "Recommended remediation: Confirm if this export is referenced dynamically or safely remove it to reduce bundle size and maintenance overhead.";
    }
    return "Recommended remediation: Review source context at this line and verify conformance with project architecture standards.";
  };

  if (!projectId && !initialFindings) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="No project open"
          description="Open a project, then run analysis to inspect static security findings and structural debt."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          title="Scanning security posture"
          description="Reading evidence-backed results and evaluating rule violations from local analysis."
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
    <section
      className="flex-1 min-h-0 flex flex-col bg-canvas select-text font-sans"
      data-testid="findings-view"
    >
      {/* Executive Security Header & Posture Status */}
      <header className="px-6 py-4 border-b border-border-default bg-surface flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-elevated border border-border-default text-accent">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold text-text-primary tracking-tight">
                Security & Code Health
              </h1>
              {metrics.criticalHigh === 0 && metrics.total > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-status-success-bg text-status-success-text border border-status-success-text/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  No Critical Risks
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              Evidence-backed static audits for secret leaks, unsafe sinks, complexity hotspots, and dependency cycles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="plain"
            size="sm"
            onClick={() => void loadFindings()}
            disabled={loading}
            className="gap-1.5 text-text-secondary hover:text-text-primary"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Re-evaluate
          </Button>
        </div>
      </header>

      {/* KPI Posture Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 p-6 border-b border-border-default bg-surface/50">
        {/* Card 1: Total Issues */}
        <div
          onClick={() => {
            setSeverityFilter("all");
            setCategoryFilter("all");
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
            severityFilter === "all" && categoryFilter === "all"
              ? "bg-elevated border-border-strong shadow-xs"
              : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
          }`}
          title="Click to view all findings"
        >
          <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
            <span>Total Findings</span>
            <AlertTriangle className="w-4 h-4 text-text-muted" />
          </div>
          <div className="mt-1.5 text-2xl font-mono font-bold text-text-primary tabular-nums">
            {metrics.total}
          </div>
          <div className="mt-0.5 text-caption text-text-secondary truncate">
            {metrics.criticalHigh} urgent • {metrics.medium} moderate
          </div>
        </div>

        {/* Card 2: Critical & High */}
        <div
          onClick={() => {
            setSeverityFilter("critical_high");
            setCategoryFilter("all");
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
            severityFilter === "critical_high"
              ? "bg-status-danger-bg/20 border-status-danger-text/40 shadow-xs"
              : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
          }`}
          title="Click to isolate critical and high severity issues"
        >
          <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
            <span className="flex items-center gap-1.5">
              <span>Critical & High</span>
              {metrics.criticalHigh > 0 && (
                <span className="w-2 h-2 rounded-full bg-status-danger-text inline-block" />
              )}
            </span>
            <Lock className="w-4 h-4 text-status-danger-text" />
          </div>
          <div className="mt-1.5 text-2xl font-mono font-bold text-text-primary tabular-nums">
            {metrics.criticalHigh}
          </div>
          <div className="mt-0.5 text-caption text-text-secondary truncate">
            {metrics.criticalHigh > 0
              ? "Immediate developer action required"
              : "Zero urgent vulnerabilities detected"}
          </div>
        </div>

        {/* Card 3: Complexity Debt */}
        <div
          onClick={() => {
            setSeverityFilter("all");
            setCategoryFilter("complexity");
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
            categoryFilter === "complexity"
              ? "bg-elevated border-border-strong shadow-xs"
              : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
          }`}
          title="Click to isolate cyclomatic complexity hotspots"
        >
          <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
            <span>Complexity Hotspots</span>
            <Code className="w-4 h-4 text-status-warning-text" />
          </div>
          <div className="mt-1.5 text-2xl font-mono font-bold text-text-primary tabular-nums">
            {metrics.complexityCount}
          </div>
          <div className="mt-0.5 text-caption text-text-secondary truncate">
            High cyclomatic branch density
          </div>
        </div>

        {/* Card 4: Architecture Cycles & Dead Code */}
        <div
          onClick={() => {
            setSeverityFilter("all");
            setCategoryFilter("circular_dependency");
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
            categoryFilter === "circular_dependency"
              ? "bg-elevated border-border-strong shadow-xs"
              : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
          }`}
          title="Click to isolate circular dependencies and structural debt"
        >
          <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
            <span>Structural Debt</span>
            <Boxes className="w-4 h-4 text-accent" />
          </div>
          <div className="mt-1.5 text-2xl font-mono font-bold text-text-primary tabular-nums">
            {metrics.cycleCount + metrics.deadCodeCount}
          </div>
          <div className="mt-0.5 text-caption text-text-secondary truncate">
            {metrics.cycleCount} circular cycles • {metrics.deadCodeCount} dead exports
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Toolbar className="px-6 py-2.5 border-b border-border-default bg-surface flex flex-wrap items-center justify-between gap-3">
        <ToolbarGroup className="flex-1 min-w-0 items-center gap-3 flex-wrap">
          {/* Search Box */}
          <div className="w-72 max-w-full">
            <SearchInput
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search findings, files, or rules..."
              suffix={
                query ? (
                  <button
                    onClick={() => setQuery("")}
                    className="text-text-muted hover:text-text-primary"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : null
              }
            />
          </div>

          {/* Severity Pills */}
          <div className="flex items-center gap-1 bg-elevated/50 p-0.5 rounded-md border border-border-subtle text-caption">
            <button
              onClick={() => setSeverityFilter("all")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                severityFilter === "all"
                  ? "bg-elevated text-text-primary shadow-2xs font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              All ({metrics.total})
            </button>
            <button
              onClick={() => setSeverityFilter("critical_high")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                severityFilter === "critical_high"
                  ? "bg-status-danger-bg text-status-danger-text border border-status-danger-text/30 font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              Critical / High ({metrics.criticalHigh})
            </button>
            <button
              onClick={() => setSeverityFilter("medium")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                severityFilter === "medium"
                  ? "bg-status-warning-bg text-status-warning-text border border-status-warning-text/30 font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              Medium ({metrics.medium})
            </button>
            <button
              onClick={() => setSeverityFilter("low")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                severityFilter === "low"
                  ? "bg-elevated text-text-primary font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              Low / Info ({metrics.low})
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-elevated border border-border-default rounded-md px-2.5 py-1 text-caption text-text-primary focus-ring"
            data-testid="category-filter-select"
          >
            <option value="all">All Categories</option>
            <option value="security">Security & Secrets</option>
            <option value="complexity">Complexity Hotspots</option>
            <option value="circular_dependency">Circular Dependencies</option>
            <option value="dead_code">Dead Code</option>
          </select>
        </ToolbarGroup>

        <div className="flex items-center gap-2">
          <span className="text-caption text-text-muted tabular-nums">
            {filtered.length} finding{filtered.length === 1 ? "" : "s"} shown
          </span>
          {(severityFilter !== "all" || categoryFilter !== "all" || query) && (
            <button
              onClick={() => {
                setSeverityFilter("all");
                setCategoryFilter("all");
                setQuery("");
              }}
              className="text-micro text-text-muted hover:text-text-primary underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </Toolbar>

      {/* Findings Content List */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="w-6 h-6 text-status-success-text" />}
            title="No findings match the current criteria"
            description={
              findings.length
                ? "Try adjusting search terms or clearing the severity and category filters."
                : "No active security or code health issues detected in this repository."
            }
            action={
              (severityFilter !== "all" || categoryFilter !== "all" || query) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSeverityFilter("all");
                    setCategoryFilter("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="max-w-5xl space-y-3.5">
            {filtered.map((finding) => {
              const isUrgent = finding.severity === "critical" || finding.severity === "high";
              const isMedium = finding.severity === "medium";

              const borderAccent = isUrgent
                ? "border-l-4 border-l-status-danger-text"
                : isMedium
                ? "border-l-4 border-l-status-warning-text"
                : "border-l-4 border-l-border-strong";

              return (
                <article
                  key={finding.id}
                  className={`border border-border-default bg-surface rounded-xl p-5 shadow-xs hover:border-border-strong transition-all duration-150 ${borderAccent}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Top Badges & Meta */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge size="sm" variant={severityVariant(finding.severity)}>
                          {finding.severity.toUpperCase()}
                        </Badge>
                        <Badge size="sm" variant="neutral">
                          {finding.category.replace(/_/g, " ")}
                        </Badge>
                        <Badge size="sm" variant={finding.confidence}>
                          {finding.confidence}
                        </Badge>
                        <span className="text-micro font-mono text-text-muted">
                          ID: #{finding.id}
                        </span>
                      </div>

                      {/* Finding Title */}
                      <h2 className="text-sm font-semibold text-text-primary mt-2">
                        {finding.title}
                      </h2>

                      {/* Description */}
                      <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                        {finding.description}
                      </p>

                      {/* Actionable Remediation Box */}
                      <div className="mt-3 p-2.5 rounded-lg bg-canvas border border-border-subtle text-caption text-text-secondary flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent/70 mt-1.5 flex-shrink-0" />
                        <span className="text-xs">
                          {getRemediationAdvice(finding.category, finding.title)}
                        </span>
                      </div>
                    </div>

                    {/* File Provenance Button */}
                    {finding.file_path && finding.start_line && (
                      <div className="flex-shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToFileLine?.(finding.file_path!, finding.start_line!)
                          }
                          className="px-2.5 py-1 text-xs font-mono bg-elevated hover:bg-hover border border-border-default rounded-md text-accent-text hover:underline focus-ring inline-flex items-center gap-1.5 transition-colors"
                          title="Click to jump directly to this source code line"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span>
                            {finding.file_path}:{finding.start_line}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
