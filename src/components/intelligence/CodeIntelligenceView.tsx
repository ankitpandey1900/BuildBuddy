import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Code2,
  AlertCircle,
  Loader2,
  FileCode,
} from "lucide-react";
import { listSymbols } from "@/lib/tauri";
import type { ListSymbolsFilter, SymbolRecord } from "@/types/ipc";
import { Badge } from "@/components/ui/Badge";

export interface CodeIntelligenceViewProps {
  projectId?: number | null;
  selectedSymbol?: SymbolRecord | null;
  onSelectSymbol?: (symbol: SymbolRecord | null) => void;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialSymbols?: SymbolRecord[];
}

const columnHelper = createColumnHelper<SymbolRecord>();

export const CodeIntelligenceView: React.FC<CodeIntelligenceViewProps> = ({
  projectId,
  selectedSymbol,
  onSelectSymbol,
  onNavigateToFileLine,
  initialSymbols,
}) => {
  const [symbols, setSymbols] = useState<SymbolRecord[]>(initialSymbols || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialSymbols && !!projectId);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [pathPrefix, setPathPrefix] = useState<string>("");
  const [minComplexity, setMinComplexity] = useState<number | "all">("all");
  const [isExportedOnly, setIsExportedOnly] = useState<boolean>(false);
  const [hasErrorHandlingOnly, setHasErrorHandlingOnly] = useState<boolean>(false);
  const [hasSideEffectsOnly, setHasSideEffectsOnly] = useState<boolean>(false);

  // Sorting
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  // Selected row index for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Load symbols from backend when filters change
  const fetchSymbols = useCallback(async () => {
    if (initialSymbols) {
      setSymbols(initialSymbols);
      return;
    }
    if (!projectId) {
      setSymbols([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const sortCol = sorting[0]?.id;
    const sortDir = sorting[0]?.desc ? "desc" : "asc";

    const filter: ListSymbolsFilter = {
      language: languageFilter === "all" ? null : languageFilter,
      kind: kindFilter === "all" ? null : kindFilter,
      path_prefix: pathPrefix.trim() ? pathPrefix.trim() : null,
      min_complexity: minComplexity === "all" ? null : minComplexity,
      is_exported: isExportedOnly ? true : null,
      has_error_handling: hasErrorHandlingOnly ? true : null,
      has_side_effects: hasSideEffectsOnly ? true : null,
      fts_query: searchQuery.trim() ? searchQuery.trim() : null,
      sort_by: sortCol || "name",
      sort_direction: sortDir,
      limit: 1000,
      offset: 0,
    };

    try {
      const records = await listSymbols(projectId, filter);
      setSymbols(records);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    initialSymbols,
    projectId,
    languageFilter,
    kindFilter,
    pathPrefix,
    minComplexity,
    isExportedOnly,
    hasErrorHandlingOnly,
    hasSideEffectsOnly,
    searchQuery,
    sorting,
  ]);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  // If initialSymbols were supplied (e.g. testing), filter them client-side too
  const filteredData = useMemo(() => {
    if (!initialSymbols) return symbols;

    return initialSymbols.filter((sym) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !sym.name.toLowerCase().includes(q) &&
          !sym.file_path.toLowerCase().includes(q) &&
          !(sym.docstring || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (languageFilter !== "all") {
        const ext = sym.file_path.split(".").pop()?.toLowerCase();
        if (languageFilter === "typescript" && ext !== "ts" && ext !== "tsx" && ext !== "js" && ext !== "jsx") {
          return false;
        }
        if (languageFilter === "python" && ext !== "py") {
          return false;
        }
      }
      if (kindFilter !== "all" && sym.kind.toLowerCase() !== kindFilter.toLowerCase()) {
        return false;
      }
      if (pathPrefix.trim() && !sym.file_path.startsWith(pathPrefix.trim())) {
        return false;
      }
      if (minComplexity !== "all" && (sym.complexity || 0) < minComplexity) {
        return false;
      }
      if (isExportedOnly && !sym.is_exported) {
        return false;
      }
      if (hasErrorHandlingOnly && !sym.has_error_handling) {
        return false;
      }
      if (hasSideEffectsOnly && !sym.has_side_effects) {
        return false;
      }
      return true;
    });
  }, [
    initialSymbols,
    symbols,
    searchQuery,
    languageFilter,
    kindFilter,
    pathPrefix,
    minComplexity,
    isExportedOnly,
    hasErrorHandlingOnly,
    hasSideEffectsOnly,
  ]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono font-medium text-text-primary text-xs truncate" title={row.name}>
                {row.parent_name ? (
                  <span className="text-text-muted font-normal">{row.parent_name}.</span>
                ) : null}
                {row.name}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("kind", {
        header: "Kind",
        cell: (info) => (
          <Badge variant="neutral" size="sm" className="font-mono text-micro uppercase">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("file_path", {
        id: "file",
        header: "File",
        cell: (info) => (
          <div className="flex items-center gap-1 text-text-muted text-micro font-mono truncate max-w-xs" title={info.getValue()}>
            <FileCode className="w-3 h-3 flex-shrink-0 text-text-muted" />
            <span className="truncate">{info.getValue()}</span>
          </div>
        ),
      }),
      columnHelper.accessor("start_line", {
        id: "line",
        header: "Line",
        cell: (info) => (
          <span className="font-mono text-micro text-text-muted">
            L{info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("complexity", {
        header: "Complexity",
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) {
            return <span className="font-mono text-micro text-text-muted text-center block">—</span>;
          }
          const isHigh = val >= 10;
          const isMedium = val >= 5;
          return (
            <span
              className={`font-mono text-micro text-center block font-medium ${
                isHigh
                  ? "text-rose-400"
                  : isMedium
                  ? "text-amber-400"
                  : "text-text-secondary"
              }`}
            >
              {val}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.callers?.length ?? 0, {
        id: "callers",
        header: "Callers",
        cell: (info) => (
          <span className="font-mono text-micro text-center block text-text-muted">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.callees?.length ?? 0, {
        id: "callees",
        header: "Callees",
        cell: (info) => (
          <span className="font-mono text-micro text-center block text-text-muted">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row, {
        id: "flags",
        header: "Flags",
        enableSorting: false,
        cell: (info) => {
          const row = info.getValue();
          return (
            <div className="flex items-center gap-1 flex-wrap">
              {row.is_exported && (
                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-accent/15 text-accent-text border border-accent/25" title="Exported">
                  export
                </span>
              )}
              {row.is_async && (
                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-blue-500/10 text-blue-400 border border-blue-500/25" title="Async">
                  async
                </span>
              )}
              {row.has_error_handling && (
                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-purple-500/10 text-purple-400 border border-purple-500/25" title="Error Handling (try/catch)">
                  errors
                </span>
              )}
              {row.has_side_effects && (
                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25" title="Side Effects (fs/network/db)">
                  effects
                </span>
              )}
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
    },
    enableSortingRemoval: false,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtualizer for the table rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 20,
    initialRect: { width: 1000, height: 600 },
    observeElementRect: (instance, cb) => {
      const el = instance.scrollElement;
      if (!el) return;
      const update = () => {
        const rect = el.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : 1000;
        const height = rect.height > 0 ? rect.height : 600;
        cb({ width: Math.round(width), height: Math.round(height) });
      };
      update();
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.unobserve(el);
      }
    },
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = Math.min(prev + 1, rows.length - 1);
        const targetRow = rows[next]?.original;
        if (targetRow && onSelectSymbol) {
          onSelectSymbol(targetRow);
        }
        virtualizer.scrollToIndex(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        const targetRow = rows[next]?.original;
        if (targetRow && onSelectSymbol) {
          onSelectSymbol(targetRow);
        }
        virtualizer.scrollToIndex(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = rows[selectedIndex]?.original;
      if (current && onNavigateToFileLine) {
        onNavigateToFileLine(current.file_path, current.start_line);
      }
    }
  };

  // Global keydown for "/" shortcut to focus search
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  return (
    <div
      className="flex-1 flex flex-col h-full bg-canvas text-text-primary overflow-hidden font-sans select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-testid="code-intelligence-view"
    >
      {/* Top Filter and Search Bar */}
      <div className="p-3 border-b border-border-default bg-surface/50 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          {/* FTS Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder='Search symbols with FTS (Press "/" to focus)...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 bg-canvas border border-border-default rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              data-testid="symbol-search-input"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted bg-surface px-1 rounded border border-border-subtle">
              /
            </span>
          </div>

          {/* Result Count */}
          <div className="text-micro font-mono text-text-muted flex items-center gap-1.5" data-testid="result-count">
            <Code2 className="w-3.5 h-3.5 text-accent" />
            <span>
              {isLoading
                ? "Loading..."
                : `${rows.length.toLocaleString()} symbol${rows.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {/* Language Filter */}
          <div className="flex items-center gap-1">
            <span className="text-micro text-text-muted font-mono uppercase">Lang:</span>
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="bg-canvas border border-border-default rounded px-2 py-1 text-micro text-text-primary focus:outline-none focus:border-accent"
              data-testid="filter-language"
            >
              <option value="all">All Languages</option>
              <option value="typescript">TypeScript / JS</option>
              <option value="python">Python</option>
            </select>
          </div>

          {/* Kind Filter */}
          <div className="flex items-center gap-1">
            <span className="text-micro text-text-muted font-mono uppercase">Kind:</span>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="bg-canvas border border-border-default rounded px-2 py-1 text-micro text-text-primary focus:outline-none focus:border-accent"
              data-testid="filter-kind"
            >
              <option value="all">All Kinds</option>
              <option value="function">Function</option>
              <option value="class">Class</option>
              <option value="method">Method</option>
              <option value="interface">Interface</option>
              <option value="variable">Variable</option>
              <option value="constant">Constant</option>
            </select>
          </div>

          {/* Path Prefix */}
          <div className="flex items-center gap-1">
            <span className="text-micro text-text-muted font-mono uppercase">Path:</span>
            <input
              type="text"
              placeholder="e.g. src/"
              value={pathPrefix}
              onChange={(e) => setPathPrefix(e.target.value)}
              className="w-24 bg-canvas border border-border-default rounded px-1.5 py-1 text-micro text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              data-testid="filter-path-prefix"
            />
          </div>

          {/* Min Complexity */}
          <div className="flex items-center gap-1">
            <span className="text-micro text-text-muted font-mono uppercase">Min CC:</span>
            <select
              value={minComplexity}
              onChange={(e) =>
                setMinComplexity(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="bg-canvas border border-border-default rounded px-2 py-1 text-micro text-text-primary focus:outline-none focus:border-accent"
              data-testid="filter-min-complexity"
            >
              <option value="all">All</option>
              <option value="2">≥ 2</option>
              <option value="5">≥ 5</option>
              <option value="10">≥ 10</option>
            </select>
          </div>

          <div className="h-4 w-[1px] bg-border-default" />

          {/* Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer text-micro text-text-secondary hover:text-text-primary">
            <input
              type="checkbox"
              checked={isExportedOnly}
              onChange={(e) => setIsExportedOnly(e.target.checked)}
              className="rounded bg-canvas border-border-default text-accent focus:ring-0"
              data-testid="filter-exported"
            />
            <span>Exported</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-micro text-text-secondary hover:text-text-primary">
            <input
              type="checkbox"
              checked={hasErrorHandlingOnly}
              onChange={(e) => setHasErrorHandlingOnly(e.target.checked)}
              className="rounded bg-canvas border-border-default text-accent focus:ring-0"
              data-testid="filter-error-handling"
            />
            <span>Error Handling</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-micro text-text-secondary hover:text-text-primary">
            <input
              type="checkbox"
              checked={hasSideEffectsOnly}
              onChange={(e) => setHasSideEffectsOnly(e.target.checked)}
              className="rounded bg-canvas border-border-default text-accent focus:ring-0"
              data-testid="filter-side-effects"
            />
            <span>Side Effects</span>
          </label>
        </div>
      </div>

      {/* Main Table / View Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {isLoading && (
          <div
            className="absolute inset-0 bg-canvas/70 backdrop-blur-[1px] flex items-center justify-center z-20 text-text-muted gap-2 text-xs font-mono"
            data-testid="loading-state"
          >
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span>Loading code intelligence symbols...</span>
          </div>
        )}

        {error && (
          <div
            className="p-4 bg-rose-500/10 border-b border-rose-500/25 text-rose-400 flex items-center gap-2 text-xs"
            data-testid="error-state"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Failed to load symbols: {error}</span>
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div
            className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted gap-2"
            data-testid="empty-state"
          >
            <Code2 className="w-8 h-8 text-text-faint" />
            <p className="text-body font-medium text-text-primary">No symbols match the current filters</p>
            <p className="text-caption text-text-muted max-w-sm">
              Adjust search keywords, language filters, or metric flags to see extracted symbols.
            </p>
          </div>
        )}

        {(!error && rows.length > 0) && (
          <div
            ref={tableContainerRef}
            className="flex-1 overflow-auto outline-none"
            tabIndex={-1}
            data-testid="symbols-table-container"
          >
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="bg-surface sticky top-0 z-10 text-text-secondary text-[11px] uppercase tracking-wider font-mono border-b border-border-default select-none shadow-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sortDir = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          style={{
                            width:
                              header.id === "name"
                                ? "24%"
                                : header.id === "kind"
                                ? "10%"
                                : header.id === "file"
                                ? "26%"
                                : header.id === "line"
                                ? "8%"
                                : header.id === "complexity"
                                ? "10%"
                                : header.id === "callers"
                                ? "7%"
                                : header.id === "callees"
                                ? "7%"
                                : "14%",
                          }}
                          className={`py-2 px-3 font-medium ${
                            canSort ? "cursor-pointer hover:text-text-primary hover:bg-hover" : ""
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
                                  <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
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
              <tbody
                style={{
                  height: `${totalSize}px`,
                  position: "relative",
                }}
              >
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const isSelected =
                    selectedSymbol?.id === row.original.id ||
                    selectedIndex === virtualRow.index;
                  return (
                    <tr
                      key={row.id}
                      data-index={virtualRow.index}
                      onClick={() => {
                        setSelectedIndex(virtualRow.index);
                        if (onSelectSymbol) {
                          onSelectSymbol(row.original);
                        }
                      }}
                      onDoubleClick={() => {
                        if (onNavigateToFileLine) {
                          onNavigateToFileLine(
                            row.original.file_path,
                            row.original.start_line
                          );
                        }
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`border-b border-border-subtle cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-accent/10 border-accent/30 text-text-primary"
                          : "hover:bg-hover text-text-secondary"
                      }`}
                      data-testid={`symbol-row-${virtualRow.index}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{
                            width:
                              cell.column.id === "name"
                                ? "24%"
                                : cell.column.id === "kind"
                                ? "10%"
                                : cell.column.id === "file"
                                ? "26%"
                                : cell.column.id === "line"
                                ? "8%"
                                : cell.column.id === "complexity"
                                ? "10%"
                                : cell.column.id === "callers"
                                ? "7%"
                                : cell.column.id === "callees"
                                ? "7%"
                                : "14%",
                          }}
                          className="py-1.5 px-3 truncate text-xs align-middle"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="h-6 border-t border-border-default bg-surface px-3 flex items-center justify-between text-micro text-text-muted font-mono">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="bg-canvas border border-border-subtle px-1 rounded text-text-secondary">↑</kbd>
            <kbd className="bg-canvas border border-border-subtle px-1 rounded text-text-secondary ml-0.5">↓</kbd> Select
          </span>
          <span>
            <kbd className="bg-canvas border border-border-subtle px-1 rounded text-text-secondary">Enter</kbd> Open in Explorer
          </span>
          <span>
            <kbd className="bg-canvas border border-border-subtle px-1 rounded text-text-secondary">/</kbd> Search
          </span>
        </div>
        <div>Double-click row to open at source line</div>
      </div>
    </div>
  );
};
