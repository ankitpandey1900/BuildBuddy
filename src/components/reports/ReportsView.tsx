import React, { useEffect, useMemo, useState } from "react";
import {
  FileBarChart,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Search,
  ChevronRight,
  Code,
  Boxes,
  Zap,
} from "lucide-react";
import type { Finding } from "@/types/ipc";
import { getFindings } from "@/lib/tauri";
import { Badge, Button, EmptyState, SegmentedControl } from "@/components/ui";

export interface ReportsViewProps {
  projectId?: number | null;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  onNavigateToDocs?: (docType: string) => void;
  initialFindings?: Finding[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  projectId,
  onNavigateToFileLine,
  onNavigateToDocs,
  initialFindings,
}) => {
  const [findings, setFindings] = useState<Finding[]>(initialFindings || []);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadReportData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getFindings(projectId);
      setFindings(data);
    } catch (err) {
      console.error("Failed to load report data:", err);
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
      void loadReportData();
    }
  }, [projectId, initialFindings]);

  const metrics = useMemo(() => {
    const total = findings.length;
    const criticalHigh = findings.filter(
      (f) => f.severity === "critical" || f.severity === "high"
    ).length;
    const complexityCount = findings.filter((f) => f.category === "complexity").length;
    const securityCount = findings.filter((f) => f.category === "security").length;
    const circularCount = findings.filter((f) => f.category === "circular_dependency").length;
    const deadCodeCount = findings.filter((f) => f.category === "dead_code").length;

    return {
      total,
      criticalHigh,
      complexityCount,
      securityCount,
      circularCount,
      deadCodeCount,
    };
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return findings.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesPath = (item.file_path || "").toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesPath) return false;
      }
      return true;
    });
  }, [findings, selectedCategory, searchQuery]);

  if (!projectId && !initialFindings) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-canvas">
        <EmptyState
          icon={<FileBarChart className="w-6 h-6" />}
          title="No Project Selected"
          description="Open a project workspace to inspect engineering health and technical debt audits."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden select-text">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-border-default bg-surface flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-elevated border border-border-default text-accent">
            <FileBarChart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary tracking-tight">
              Engineering Health & Quality Audit
            </h1>
            <p className="text-xs text-text-muted">
              Objective static analysis audit of structural debt, security posture, and complexity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToDocs && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateToDocs("security_report")}
                className="gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                Security Report
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateToDocs("tech_debt_report")}
                className="gap-1.5"
              >
                <FileBarChart className="w-3.5 h-3.5 text-accent" />
                Debt Report
              </Button>
            </>
          )}
          <Button
            variant="plain"
            size="sm"
            onClick={() => void loadReportData()}
            disabled={loading}
            className="gap-1"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-border-default bg-canvas">
        <div className="p-4 rounded-xl bg-surface border border-border-default flex flex-col justify-between hover:border-border-strong transition-all shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Critical / High Issues</span>
            <AlertTriangle className="w-4 h-4 text-status-danger-text" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-text-primary">
            {metrics.criticalHigh}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Requires immediate attention</div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border-default flex flex-col justify-between hover:border-border-strong transition-all shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Complexity Hotspots</span>
            <Code className="w-4 h-4 text-status-warning-text" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-text-primary">
            {metrics.complexityCount}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Functions with Cyclomatic ≥ 10</div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border-default flex flex-col justify-between hover:border-border-strong transition-all shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Dependency Loops</span>
            <Boxes className="w-4 h-4 text-accent" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-text-primary">
            {metrics.circularCount}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Circular import cycles</div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border-default flex flex-col justify-between hover:border-border-strong transition-all shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Security Alerts</span>
            <ShieldAlert className="w-4 h-4 text-status-danger-text" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-text-primary">
            {metrics.securityCount}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Hardcoded secrets & sinks</div>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="px-6 py-3 border-b border-border-default bg-surface flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl
          value={selectedCategory}
          onChange={setSelectedCategory}
          items={[
            { id: "all", label: `All (${metrics.total})` },
            { id: "security", label: `Security (${metrics.securityCount})` },
            { id: "complexity", label: `Complexity (${metrics.complexityCount})` },
            { id: "circular_dependency", label: `Cycles (${metrics.circularCount})` },
            { id: "dead_code", label: `Dead Code (${metrics.deadCodeCount})` },
          ]}
        />

        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search report items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-elevated border border-border-default text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Findings Inventory Table */}
      <div className="flex-1 overflow-auto p-6">
        {filteredFindings.length === 0 ? (
          <EmptyState
            icon={<Zap className="w-6 h-6" />}
            title="No Matching Findings"
            description="The selected filter or search query yielded no active codebase health issues."
          />
        ) : (
          <div className="border border-border-default rounded-xl overflow-hidden bg-surface shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-default bg-elevated text-text-muted font-medium">
                  <th className="py-2.5 px-4 w-28">Severity</th>
                  <th className="py-2.5 px-4 w-32">Category</th>
                  <th className="py-2.5 px-4">Finding Description</th>
                  <th className="py-2.5 px-4 w-64">File Location</th>
                  <th className="py-2.5 px-4 w-28">Confidence</th>
                  <th className="py-2.5 px-4 w-20 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono text-[11px]">
                {filteredFindings.map((item) => {
                  const sevVariant: "danger" | "warning" | "neutral" =
                    item.severity === "critical" || item.severity === "high"
                      ? "danger"
                      : item.severity === "medium"
                      ? "warning"
                      : "neutral";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-hover transition-colors group"
                    >
                      <td className="py-2.5 px-4">
                        <Badge variant={sevVariant}>
                          {item.severity.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-xs text-text-secondary">
                        {item.category.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        <div className="font-medium text-text-primary text-xs">
                          {item.title}
                        </div>
                        <div className="text-text-muted text-[11px] mt-0.5 leading-relaxed line-clamp-2">
                          {item.description}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-text-secondary truncate max-w-xs">
                        {item.file_path ? (
                          <span
                            title={`${item.file_path}:${item.start_line || 1}`}
                            className="cursor-pointer hover:underline hover:text-accent"
                            onClick={() =>
                              onNavigateToFileLine?.(item.file_path!, item.start_line || 1)
                            }
                          >
                            {item.file_path}
                            {item.start_line ? `:${item.start_line}` : ""}
                          </span>
                        ) : (
                          <span className="text-text-muted">Repository level</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[11px] text-text-muted uppercase tracking-wider">
                          {item.confidence}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {item.file_path && onNavigateToFileLine && (
                          <Button
                            variant="plain"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Jump to source code"
                            onClick={() =>
                              onNavigateToFileLine(item.file_path!, item.start_line || 1)
                            }
                          >
                            <ChevronRight className="w-4 h-4 text-text-muted hover:text-text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
