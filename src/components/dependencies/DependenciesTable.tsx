import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, FileCode, ExternalLink } from "lucide-react";
import type { ImportEdge } from "@/types/ipc";
import { SearchInput } from "@/components/ui/Input";
import { Toolbar, ToolbarGroup } from "@/components/ui/Toolbar";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export interface DependencyRow {
  name: string;
  kind: "internal" | "external" | "dev";
  version: string;
  import_count: number;
  fan_in: number;
  fan_out: number;
  filePath?: string;
}

interface DependenciesTableProps {
  edges: ImportEdge[];
  onSelectFile?: (filePath: string) => void;
}

const columnHelper = createColumnHelper<DependencyRow>();

export function computeDependencyRows(edges: ImportEdge[]): DependencyRow[] {
  const rowMap = new Map<string, DependencyRow>();

  // 1. Map of internal files and their inbound/outbound edges
  const internalOutbound = new Map<string, Set<string>>();
  const internalInbound = new Map<string, Set<string>>();
  const internalImportCounts = new Map<string, number>();

  // External package inbound and counts
  const externalInbound = new Map<string, Set<string>>();
  const externalImportCounts = new Map<string, number>();

  for (const edge of edges) {
    // Record outbound for source file
    if (!internalOutbound.has(edge.source_file_path)) {
      internalOutbound.set(edge.source_file_path, new Set());
    }
    internalOutbound.get(edge.source_file_path)!.add(edge.target_module);

    if (edge.resolution_status === "internal" && edge.target_file_path) {
      if (!internalInbound.has(edge.target_file_path)) {
        internalInbound.set(edge.target_file_path, new Set());
      }
      internalInbound.get(edge.target_file_path)!.add(edge.source_file_path);
      internalImportCounts.set(
        edge.target_file_path,
        (internalImportCounts.get(edge.target_file_path) || 0) + 1
      );
    } else if (edge.resolution_status === "external") {
      const pkg = edge.target_module.startsWith("@")
        ? edge.target_module.split("/").slice(0, 2).join("/")
        : edge.target_module.split("/")[0];

      if (!externalInbound.has(pkg)) {
        externalInbound.set(pkg, new Set());
      }
      externalInbound.get(pkg)!.add(edge.source_file_path);
      externalImportCounts.set(pkg, (externalImportCounts.get(pkg) || 0) + 1);
    }
  }

  // Add internal file entries
  const allInternalFiles = new Set<string>([
    ...internalOutbound.keys(),
    ...internalInbound.keys(),
  ]);

  for (const filePath of allInternalFiles) {
    const fanIn = internalInbound.get(filePath)?.size || 0;
    const fanOut = internalOutbound.get(filePath)?.size || 0;
    const count = internalImportCounts.get(filePath) || 0;

    rowMap.set(filePath, {
      name: filePath,
      kind: "internal",
      version: "-",
      import_count: count,
      fan_in: fanIn,
      fan_out: fanOut,
      filePath,
    });
  }

  // Add external package entries
  for (const [pkg, inbounds] of externalInbound) {
    const count = externalImportCounts.get(pkg) || 0;
    const isDev = pkg.includes("test") || pkg.includes("vite") || pkg.includes("lint");
    rowMap.set(pkg, {
      name: pkg,
      kind: isDev ? "dev" : "external",
      version: "*",
      import_count: count,
      fan_in: inbounds.size,
      fan_out: 0,
    });
  }

  return Array.from(rowMap.values());
}

export const DependenciesTable: React.FC<DependenciesTableProps> = ({
  edges,
  onSelectFile,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fan_in", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "internal" | "external" | "dev">("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const data = useMemo(() => {
    const rows = computeDependencyRows(edges);
    if (kindFilter === "all") return rows;
    return rows.filter((r) => r.kind === kindFilter);
  }, [edges, kindFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Dependency / Module",
        cell: (info) => {
          const row = info.row.original;
          return row.kind === "internal" ? (
            <button
              type="button"
              onClick={() => onSelectFile?.(row.filePath || row.name)}
              className="text-text-primary hover:underline hover:text-accent flex items-center gap-1.5 truncate text-left"
              title={row.name}
            >
              <FileCode className="w-3 h-3 text-text-muted flex-shrink-0" />
              <span className="truncate font-mono text-caption">{row.name}</span>
            </button>
          ) : (
            <span className="font-semibold text-text-primary flex items-center gap-1.5 truncate">
              <ExternalLink className="w-3 h-3 text-text-muted flex-shrink-0" />
              <span className="truncate">{row.name}</span>
            </span>
          );
        },
      }),
      columnHelper.accessor("kind", {
        header: "Category",
        cell: (info) => {
          const kind = info.getValue();
          switch (kind) {
            case "internal":
              return (
                <Badge variant="confirmed" size="sm">
                  internal
                </Badge>
              );
            case "external":
              return (
                <Badge variant="static" size="sm">
                  external
                </Badge>
              );
            case "dev":
              return (
                <Badge variant="unknown" size="sm">
                  dev
                </Badge>
              );
          }
        },
      }),
      columnHelper.accessor("version", {
        header: "Version",
        cell: (info) => (
          <span className="text-text-muted tabular-nums">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("import_count", {
        header: "Imports",
        cell: (info) => (
          <span className="tabular-nums text-right block">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("fan_in", {
        header: "Fan-In",
        cell: (info) => (
          <span className="tabular-nums text-right block font-medium text-text-primary">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("fan_out", {
        header: "Fan-Out",
        cell: (info) => (
          <span className="tabular-nums text-right block text-text-secondary">
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [onSelectFile]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    enableSortingRemoval: false,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col h-full bg-surface border border-border-default rounded-md overflow-hidden text-body">
      <Toolbar>
        <ToolbarGroup>
          <SegmentedControl
            ariaLabel="Dependency category"
            size="sm"
            value={kindFilter}
            onChange={(v) => setKindFilter(v)}
            items={[
              { id: "all", label: "all" },
              { id: "internal", label: "internal" },
              { id: "external", label: "external" },
              { id: "dev", label: "dev" },
            ]}
          />
        </ToolbarGroup>
        <div className="w-64">
          <SearchInput
            placeholder="Search dependencies..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            size="sm"
          />
        </div>
      </Toolbar>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-canvas/80 sticky top-0 z-10 text-text-secondary text-caption font-sans font-medium border-b border-border-default select-none">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`py-2 px-3 font-medium ${
                        canSort ? "cursor-pointer hover:text-text-primary" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {canSort && (
                          <span className="text-text-muted">
                            {sortDir === "asc" ? (
                              <ArrowUp className="w-3 h-3 text-accent" />
                            ) : sortDir === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-accent" />
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="text-body">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  No dependencies found matching filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedName(row.original.name)}
                  className={`h-9 border-b border-border-subtle transition-colors cursor-default ${
                    selectedName === row.original.name
                      ? "bg-accent-subtle text-text-primary"
                      : "hover:bg-hover"
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      <div className="p-2 px-3 border-t border-border-default bg-canvas/30 text-micro text-text-muted flex items-center justify-between">
        <span>
          Showing {table.getRowModel().rows.length} of {data.length} dependencies
        </span>
      </div>
    </div>
  );
};
