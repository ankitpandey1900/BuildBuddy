import React, { useMemo, useState } from "react";
import { Search, ExternalLink, FileCode, CheckCircle2, HelpCircle } from "lucide-react";
import type { ImportEdge } from "@/types/ipc";

interface DependenciesTableProps {
  edges: ImportEdge[];
  onSelectFile?: (filePath: string) => void;
}

export const DependenciesTable: React.FC<DependenciesTableProps> = ({
  edges,
  onSelectFile,
}) => {
  const [filter, setFilter] = useState<"all" | "internal" | "external" | "unresolved">("all");
  const [search, setSearch] = useState("");

  const filteredEdges = useMemo(() => {
    return edges.filter((edge) => {
      if (filter !== "all" && edge.resolution_status !== filter) {
        return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        return (
          edge.source_file_path.toLowerCase().includes(query) ||
          edge.target_module.toLowerCase().includes(query) ||
          (edge.target_file_path && edge.target_file_path.toLowerCase().includes(query)) ||
          edge.imported_name.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [edges, filter, search]);

  const renderStatusBadge = (status: "internal" | "external" | "unresolved") => {
    switch (status) {
      case "internal":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" />
            internal
          </span>
        );
      case "external":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <ExternalLink className="w-2.5 h-2.5" />
            external
          </span>
        );
      case "unresolved":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-2.5 h-2.5" />
            unresolved
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface border border-border-default rounded-md overflow-hidden text-xs">
      {/* Controls Bar */}
      <div className="p-2.5 border-b border-border-default flex items-center justify-between gap-3 bg-canvas/30">
        <div className="flex items-center gap-1">
          {(["all", "internal", "external", "unresolved"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-2.5 py-1 rounded text-micro font-medium capitalize transition-colors ${
                filter === tab
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-text-muted hover:text-text-primary hover:bg-hover border border-transparent"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filter module or file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-surface border border-border-default rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-canvas/50 sticky top-0 z-10 text-text-secondary text-micro uppercase tracking-wider font-mono border-b border-border-default select-none">
            <tr>
              <th className="py-2 px-3 font-medium">Source File</th>
              <th className="py-2 px-3 font-medium">Import Target</th>
              <th className="py-2 px-3 font-medium">Resolved File</th>
              <th className="py-2 px-3 font-medium">Imported Name</th>
              <th className="py-2 px-3 font-medium">Kind</th>
              <th className="py-2 px-3 font-medium text-right">Line</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default/50 font-mono text-micro">
            {filteredEdges.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  No dependency edges found.
                </td>
              </tr>
            ) : (
              filteredEdges.map((edge, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-hover/60 transition-colors group cursor-default"
                >
                  <td className="py-1.5 px-3 truncate max-w-[200px]" title={edge.source_file_path}>
                    <button
                      type="button"
                      onClick={() => onSelectFile?.(edge.source_file_path)}
                      className="text-text-primary hover:underline hover:text-accent flex items-center gap-1.5 truncate"
                    >
                      <FileCode className="w-3 h-3 text-text-muted flex-shrink-0" />
                      <span className="truncate">{edge.source_file_path}</span>
                    </button>
                  </td>
                  <td className="py-1.5 px-3 truncate max-w-[180px] text-text-primary font-semibold" title={edge.target_module}>
                    {edge.target_module}
                  </td>
                  <td className="py-1.5 px-3 truncate max-w-[200px] text-text-muted" title={edge.target_file_path || "-"}>
                    {edge.target_file_path ? (
                      <button
                        type="button"
                        onClick={() => onSelectFile?.(edge.target_file_path!)}
                        className="hover:underline hover:text-accent truncate block text-left"
                      >
                        {edge.target_file_path}
                      </button>
                    ) : (
                      <span className="italic text-text-muted/60">-</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-text-secondary truncate max-w-[120px]">
                    {edge.imported_name || "<default>"}
                    {edge.is_type_only && (
                      <span className="ml-1 text-[9px] text-text-muted/80">(type)</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3">
                    {renderStatusBadge(edge.resolution_status)}
                  </td>
                  <td className="py-1.5 px-3 text-right text-text-muted">
                    {edge.line_number}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="p-2 px-3 border-t border-border-default bg-canvas/30 text-micro text-text-muted flex items-center justify-between">
        <span>Showing {filteredEdges.length} of {edges.length} import edges</span>
      </div>
    </div>
  );
};
