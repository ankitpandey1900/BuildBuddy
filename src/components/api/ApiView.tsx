import React, { useEffect, useState, useMemo } from "react";
import {
  Network,
  ArrowRight,
  Database,
  AlertTriangle,
  Code2,
  ExternalLink,
  ShieldAlert,
  Radio,
  FileCode,
} from "lucide-react";
import { getApiEndpoints } from "@/lib/tauri";
import type { ApiEndpoint } from "@/types/ipc";
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
  ToolbarGroup,
  SearchInput,
} from "@/components/ui";

interface ApiViewProps {
  projectId?: number | null;
  lastAnalysisRunId?: number;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialEndpoints?: ApiEndpoint[];
}

export const ApiView: React.FC<ApiViewProps> = ({
  projectId,
  lastAnalysisRunId,
  onNavigateToFileLine,
  initialEndpoints,
}) => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(initialEndpoints ?? []);
  const [query, setQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialEndpoints) {
      setEndpoints(initialEndpoints);
      return;
    }
    if (!projectId) {
      setEndpoints([]);
      return;
    }
    setLoading(true);
    setError(null);
    getApiEndpoints(projectId)
      .then((data) => {
        setEndpoints(data);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [projectId, lastAnalysisRunId, initialEndpoints]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    endpoints.forEach((e) => set.add(e.method.toUpperCase()));
    return ["ALL", ...Array.from(set).sort()];
  }, [endpoints]);

  const filtered = useMemo(() => {
    return endpoints.filter((endpoint) => {
      const matchesMethod =
        selectedMethod === "ALL" || endpoint.method.toUpperCase() === selectedMethod;
      const q = query.toLowerCase();
      const matchesQuery =
        !query ||
        endpoint.route.toLowerCase().includes(q) ||
        endpoint.file_path.toLowerCase().includes(q) ||
        endpoint.framework.toLowerCase().includes(q) ||
        (endpoint.caller_files && endpoint.caller_files.some((c) => c.toLowerCase().includes(q))) ||
        (endpoint.affected_models && endpoint.affected_models.some((m) => m.toLowerCase().includes(q)));
      return matchesMethod && matchesQuery;
    });
  }, [endpoints, query, selectedMethod]);

  // Keep selected endpoint synchronized if filtered out
  useEffect(() => {
    if (selectedEndpoint && !filtered.some((e) => e.id === selectedEndpoint.id)) {
      setSelectedEndpoint(null);
    }
  }, [filtered, selectedEndpoint]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<Network className="w-5 h-5 text-text-muted" />}
          title="No project open"
          description="Open a project, then run analysis to build the API inventory."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          title="Loading API inventory"
          description="Reading endpoints and client-to-backend communication traces."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState title="API inventory failed to load" description={error} />
      </div>
    );
  }

  const getMethodBadgeClass = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "POST":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "PUT":
      case "PATCH":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "DELETE":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-surface text-text-secondary border-border-default";
    }
  };

  const getBlastRadiusBadge = (radius?: string) => {
    switch (radius) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" /> Critical
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> Warning
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface text-text-muted border border-border-subtle">
            Low
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas" data-testid="api-view">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-default bg-surface/40 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-subheading font-semibold text-text-primary">
              API Communication & Workflow Map
            </h1>
            <span className="text-caption font-mono px-2 py-0.5 rounded-full bg-surface text-text-muted border border-border-subtle">
              {endpoints.length} routes detected
            </span>
          </div>
          <p className="text-caption text-text-muted mt-0.5">
            Full-stack call paths tracing Client Caller Components ➔ API Endpoints ➔ Database Models.
          </p>
        </div>
      </div>

      {/* Visual Workflow Pipeline Banner */}
      {selectedEndpoint && (
        <div className="px-5 py-3 border-b border-border-default bg-surface/20">
          <div className="flex items-center gap-3 overflow-x-auto text-xs py-1">
            {/* Step 1: Client Callers */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-canvas border border-border-default shrink-0">
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider">
                  Client Callers
                </div>
                <div className="font-mono text-text-primary font-medium">
                  {selectedEndpoint.caller_files && selectedEndpoint.caller_files.length > 0
                    ? `${selectedEndpoint.caller_files.length} UI Component${
                        selectedEndpoint.caller_files.length > 1 ? "s" : ""
                      }`
                    : "No direct callers detected"}
                </div>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />

            {/* Step 2: API Gateway Handler */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-canvas border border-border-default shrink-0">
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider">
                  API Gateway Handler
                </div>
                <div className="font-mono text-text-primary font-medium flex items-center gap-1.5">
                  <span
                    className={`px-1 rounded text-[10px] border ${getMethodBadgeClass(
                      selectedEndpoint.method
                    )}`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <span>{selectedEndpoint.route}</span>
                </div>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />

            {/* Step 3: Database Entity */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-canvas border border-border-default shrink-0">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider">
                  Downstream Database
                </div>
                <div className="font-mono text-text-primary font-medium">
                  {selectedEndpoint.affected_models && selectedEndpoint.affected_models.length > 0
                    ? selectedEndpoint.affected_models.join(", ")
                    : "No specific model mapped"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar & Filter Pills */}
      <Toolbar className="px-5 py-2.5">
        <ToolbarGroup className="flex-1 flex items-center gap-3">
          <div className="w-72">
            <SearchInput
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search routes, callers, models, files..."
            />
          </div>

          <div className="flex items-center gap-1">
            {methods.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMethod(m)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  selectedMethod === m
                    ? "bg-text-primary text-canvas font-medium"
                    : "bg-surface/50 text-text-secondary hover:bg-surface border border-border-subtle"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </ToolbarGroup>
        <span className="text-caption text-text-muted font-mono tabular-nums">
          {filtered.length} of {endpoints.length} routes
        </span>
      </Toolbar>

      {/* Main Split Layout */}
      {endpoints.length === 0 ? (
        <EmptyState
          title="No API endpoints detected"
          description="Run analysis on an Express, Next.js, FastAPI, or Flask project with literal route declarations."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No API endpoints match the filter"
          description="Try broadening your search query or selecting 'ALL' methods."
        />
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Table Area */}
          <div className="flex-1 overflow-auto bg-surface border-r border-border-default">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Method</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Callers</TableHead>
                  <TableHead>Database Models</TableHead>
                  <TableHead>Blast Radius</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Framework</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((endpoint) => {
                  const isSelected = selectedEndpoint?.id === endpoint.id;
                  const callersCount = endpoint.caller_files?.length || 0;
                  const modelsCount = endpoint.affected_models?.length || 0;

                  return (
                    <TableRow
                      key={endpoint.id}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-accent-subtle border-l-2 border-l-accent"
                          : "hover:bg-hover"
                      }`}
                      onClick={() => {
                        setSelectedEndpoint(endpoint);
                        onNavigateToFileLine?.(endpoint.file_path, endpoint.start_line);
                      }}
                    >
                      <TableCell>
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${getMethodBadgeClass(
                            endpoint.method
                          )}`}
                        >
                          {endpoint.method}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-caption text-text-primary font-medium">
                        {endpoint.route}
                      </TableCell>
                      <TableCell className="font-mono text-caption text-text-muted">
                        {endpoint.file_path}:{endpoint.start_line}
                      </TableCell>
                      <TableCell>
                        {callersCount > 0 ? (
                          <span className="font-mono text-[11px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                            {callersCount} caller{callersCount > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-text-muted">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {modelsCount > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {endpoint.affected_models?.slice(0, 2).map((m) => (
                              <span
                                key={m}
                                className="font-mono text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20"
                              >
                                {m}
                              </span>
                            ))}
                            {modelsCount > 2 && (
                              <span className="text-[10px] font-mono text-text-muted">
                                +{modelsCount - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getBlastRadiusBadge(endpoint.blast_radius)}</TableCell>
                      <TableCell>
                        <Badge variant={endpoint.confidence} size="sm">
                          {endpoint.confidence}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-caption text-text-secondary">
                        {endpoint.framework}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Right Inspector Drawer */}
          {selectedEndpoint && (
            <div className="w-96 border-l border-border-default bg-surface/30 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border ${getMethodBadgeClass(
                      selectedEndpoint.method
                    )}`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  {getBlastRadiusBadge(selectedEndpoint.blast_radius)}
                </div>
                <h2 className="font-mono text-sm font-semibold text-text-primary mt-2 break-all">
                  {selectedEndpoint.route}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                  <span>{selectedEndpoint.framework}</span>
                  <span>•</span>
                  <Badge variant={selectedEndpoint.confidence} size="sm">
                    {selectedEndpoint.confidence}
                  </Badge>
                </div>
              </div>

              {/* Source Implementation */}
              <div className="p-3 rounded-md bg-canvas border border-border-default">
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Source File</span>
                  <button
                    onClick={() =>
                      onNavigateToFileLine?.(selectedEndpoint.file_path, selectedEndpoint.start_line)
                    }
                    className="text-accent hover:underline flex items-center gap-1 font-mono text-[10px]"
                  >
                    Jump to code <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="font-mono text-xs text-text-primary break-all">
                  {selectedEndpoint.file_path}:{selectedEndpoint.start_line}
                </div>
                {selectedEndpoint.snippet && (
                  <pre className="mt-2 p-2 rounded bg-surface font-mono text-[11px] text-text-secondary overflow-x-auto border border-border-subtle">
                    {selectedEndpoint.snippet}
                  </pre>
                )}
              </div>

              {/* Plain English Workflow Explanation */}
              <div className="p-3 rounded-md bg-canvas border border-border-default">
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Workflow Explanation
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Handles incoming HTTP {selectedEndpoint.method} requests at{" "}
                  <code className="text-accent font-mono">{selectedEndpoint.route}</code>.
                  {selectedEndpoint.caller_files && selectedEndpoint.caller_files.length > 0 ? (
                    <>
                      {" "}Called by {selectedEndpoint.caller_files.length} client component
                      {selectedEndpoint.caller_files.length > 1 ? "s" : ""} to orchestrate user
                      actions.
                    </>
                  ) : (
                    <> No direct client callers detected via static pattern analysis.</>
                  )}
                  {selectedEndpoint.affected_models && selectedEndpoint.affected_models.length > 0 && (
                    <>
                      {" "}Mutates or reads data from the{" "}
                      <strong>{selectedEndpoint.affected_models.join(", ")}</strong> schema entity.
                    </>
                  )}
                </p>
              </div>

              {/* Client Caller Files */}
              <div className="p-3 rounded-md bg-canvas border border-border-default">
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Calling Components</span>
                  <span className="font-mono text-[10px] text-text-muted">
                    {selectedEndpoint.caller_files?.length || 0}
                  </span>
                </div>
                {selectedEndpoint.caller_files && selectedEndpoint.caller_files.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedEndpoint.caller_files.map((caller) => {
                      const [file, line] = caller.split(":");
                      const lineNum = parseInt(line, 10) || 1;
                      return (
                        <div
                          key={caller}
                          onClick={() => onNavigateToFileLine?.(file, lineNum)}
                          className="flex items-center justify-between p-1.5 rounded bg-surface hover:bg-hover cursor-pointer border border-border-subtle group"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="font-mono text-xs text-text-primary truncate">
                              {file}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-text-muted group-hover:text-accent shrink-0 ml-2">
                            L{line}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted italic">
                    No client callers detected. (Could be an external webhook or internal microservice route)
                  </div>
                )}
              </div>

              {/* Blast Radius / Impact Warning */}
              <div className="p-3 rounded-md bg-canvas border border-border-default">
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Blast Radius Analysis</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed mt-1">
                  {selectedEndpoint.blast_radius === "critical" ? (
                    <span className="text-rose-400 font-medium">
                      High Impact: Modifying this route signature or response payload will break{" "}
                      {selectedEndpoint.caller_files?.length || 0} client components and may affect{" "}
                      {selectedEndpoint.affected_models?.join(", ")} database models.
                    </span>
                  ) : selectedEndpoint.blast_radius === "warning" ? (
                    <span className="text-amber-400 font-medium">
                      Moderate Impact: Changes will directly propagate to{" "}
                      {selectedEndpoint.caller_files?.length || 0} calling components. Verify input
                      validation before modifying.
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      Low Impact: No direct dependent client components detected. Safe to refactor or
                      extend.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
