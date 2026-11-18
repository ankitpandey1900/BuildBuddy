import React, { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { getApiEndpoints } from "@/lib/tauri";
import type { ApiEndpoint } from "@/types/ipc";
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toolbar, ToolbarGroup, SearchInput } from "@/components/ui";

interface ApiViewProps {
  projectId?: number | null;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialEndpoints?: ApiEndpoint[];
}

export const ApiView: React.FC<ApiViewProps> = ({ projectId, onNavigateToFileLine, initialEndpoints }) => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(initialEndpoints ?? []);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialEndpoints) { setEndpoints(initialEndpoints); return; }
    if (!projectId) { setEndpoints([]); return; }
    setLoading(true); setError(null);
    getApiEndpoints(projectId).then(setEndpoints).catch((err) => setError(String(err))).finally(() => setLoading(false));
  }, [projectId, initialEndpoints]);

  if (!projectId) return <div className="flex-1 flex items-center justify-center bg-canvas"><EmptyState icon={<Network className="w-5 h-5" />} title="No project open" description="Open a project, then run analysis to build the API inventory." /></div>;
  if (loading) return <div className="flex-1 flex items-center justify-center bg-canvas"><EmptyState title="Loading API inventory" description="Reading endpoints from the local analysis index." /></div>;
  if (error) return <div className="flex-1 flex items-center justify-center bg-canvas"><EmptyState title="API inventory failed to load" description={error} /></div>;
  const filtered = endpoints.filter((endpoint) => `${endpoint.method} ${endpoint.route} ${endpoint.file_path} ${endpoint.framework}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="flex-1 flex flex-col min-h-0 bg-canvas" data-testid="api-view">
    <div className="px-4 py-3 border-b border-border-default"><h1 className="text-subheading font-semibold text-text-primary">API endpoints</h1><p className="text-caption text-text-muted mt-0.5">Literal routes detected by static analysis. Dynamic routes are not inferred.</p></div>
    <Toolbar><ToolbarGroup className="flex-1"><div className="w-72"><SearchInput size="sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search endpoints..." /></div></ToolbarGroup><span className="text-caption text-text-muted tabular-nums">{filtered.length} endpoint{filtered.length === 1 ? "" : "s"}</span></Toolbar>
    {filtered.length === 0 ? <EmptyState title="No API endpoints detected" description="Run analysis on an Express, FastAPI, or Flask project with literal route declarations." /> : <div className="flex-1 overflow-auto bg-surface"><Table><TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Route</TableHead><TableHead>Framework</TableHead><TableHead>Controller</TableHead><TableHead>Source</TableHead><TableHead>Confidence</TableHead></TableRow></TableHeader><TableBody>{filtered.map((endpoint) => <TableRow key={endpoint.id} className="h-9 cursor-pointer" onClick={() => onNavigateToFileLine?.(endpoint.file_path, endpoint.start_line)}><TableCell><Badge variant="neutral" size="sm">{endpoint.method}</Badge></TableCell><TableCell className="font-mono text-caption">{endpoint.route}</TableCell><TableCell>{endpoint.framework}</TableCell><TableCell className="font-mono text-caption text-text-secondary">{endpoint.controller_name ?? "Inline handler"}</TableCell><TableCell className="font-mono text-caption text-text-muted">{endpoint.file_path}:{endpoint.start_line}</TableCell><TableCell><Badge variant={endpoint.confidence} size="sm">{endpoint.confidence}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
  </div>;
};
