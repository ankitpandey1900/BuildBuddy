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
import { ArrowUpDown, ArrowUp, ArrowDown, FileCode, Filter } from "lucide-react";
import { listSymbols } from "@/lib/tauri";
import type { ListSymbolsFilter, SymbolRecord } from "@/types/ipc";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Input";
import { Toolbar, ToolbarGroup } from "@/components/ui/Toolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kbd } from "@/components/ui/Kbd";
import { Popover } from "@/components/ui/Popover";

export interface CodeIntelligenceViewProps {
  projectId?: number | null;
  lastAnalysisRunId?: number;
  selectedSymbol?: SymbolRecord | null;
  onSelectSymbol?: (symbol: SymbolRecord | null) => void;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialSymbols?: SymbolRecord[];
}

const columnHelper = createColumnHelper<SymbolRecord>();

export const CodeIntelligenceView: React.FC<CodeIntelligenceViewProps> = ({
  projectId,
  lastAnalysisRunId,
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
    lastAnalysisRunId,
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
              <span className="font-mono font-medium text-text-primary text-caption truncate" title={row.name}>
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
          <span className="inline-flex items-center gap-1">
            <Badge variant="neutral" size="sm">
              {info.getValue()}
            </Badge>
            <Badge variant={info.row.original.confidence} size="sm">
              {info.row.original.confidence}
            </Badge>
          </span>
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
          <span className="font-mono text-caption text-text-muted tabular-nums">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("complexity", {
        header: "Complexity",
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) {
            return <span className="text-caption text-text-muted text-center block">—</span>;
          }
          const isHigh = val >= 10;
          const isMedium = val >= 5;
          return (
            <span
              className={`tabular-nums text-caption text-center block ${
                isHigh
                  ? "text-status-danger-text"
                  : isMedium
                  ? "text-status-warning-text"
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
          <span className="tabular-nums text-caption text-center block text-text-muted">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.callees?.length ?? 0, {
        id: "callees",
        header: "Callees",
        cell: (info) => (
          <span className="tabular-nums text-caption text-center block text-text-muted">
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
                <Badge variant="neutral" size="sm">
                  export
                </Badge>
              )}
              {row.is_async && (
                <Badge variant="neutral" size="sm">
                  async
                </Badge>
              )}
              {row.has_error_handling && (
                <Badge variant="neutral" size="sm">
                  errors
                </Badge>
              )}
              {row.has_side_effects && (
                <Badge variant="neutral" size="sm">
                  effects
                </Badge>
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

  const fieldClass =
    "bg-elevated border border-border-default rounded-sm px-2 py-1 text-caption text-text-primary focus-ring w-full";

  const renderSymbolFilters = () => (
    <div className="flex flex-col gap-2 text-caption font-sans">
      <label className="flex flex-col gap-1 text-text-muted">
        Language
        <select
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value)}
          className={fieldClass}
          data-testid="filter-language"
        >
          <option value="all">All Languages</option>
          <option value="typescript">TypeScript / JS</option>
          <option value="python">Python</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Kind
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className={fieldClass}
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
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Path prefix
        <input
          type="text"
          placeholder="e.g. src/"
          value={pathPrefix}
          onChange={(e) => setPathPrefix(e.target.value)}
          className={fieldClass}
          data-testid="filter-path-prefix"
        />
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Minimum complexity
        <select
          value={minComplexity}
          onChange={(e) =>
            setMinComplexity(e.target.value === "all" ? "all" : Number(e.target.value))
          }
          className={fieldClass}
          data-testid="filter-min-complexity"
        >
          <option value="all">All</option>
          <option value="2">≥ 2</option>
          <option value="5">≥ 5</option>
          <option value="10">≥ 10</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-text-secondary">
        <input
          type="checkbox"
          checked={isExportedOnly}
          onChange={(e) => setIsExportedOnly(e.target.checked)}
          data-testid="filter-exported"
        />
        Exported
      </label>
      <label className="flex items-center gap-2 text-text-secondary">
        <input
          type="checkbox"
          checked={hasErrorHandlingOnly}
          onChange={(e) => setHasErrorHandlingOnly(e.target.checked)}
          data-testid="filter-error-handling"
        />
        Error handling
      </label>
      <label className="flex items-center gap-2 text-text-secondary">
        <input
          type="checkbox"
          checked={hasSideEffectsOnly}
          onChange={(e) => setHasSideEffectsOnly(e.target.checked)}
          data-testid="filter-side-effects"
        />
        Side effects
      </label>
    </div>
  );

  return (
    <div
      className="flex-1 flex flex-col h-full bg-canvas text-text-primary overflow-hidden font-sans select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-testid="code-intelligence-view"
    >
      <Toolbar>
        <ToolbarGroup className="flex-1 min-w-0 gap-2">
          <div className="w-full max-w-md">
            <SearchInput
              ref={searchInputRef}
              placeholder='Search symbols with FTS (Press "/" to focus)...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              data-testid="symbol-search-input"
              suffix={<Kbd>/</Kbd>}
            />
          </div>
          <Popover
            align="left"
            className="w-72 p-2"
            trigger={
              <Button variant="secondary" size="sm" icon={<Filter className="w-3.5 h-3.5" />}>
                Filter
              </Button>
            }
          >
            {renderSymbolFilters()}
          </Popover>
        </ToolbarGroup>
        <div className="text-caption text-text-muted tabular-nums" data-testid="result-count">
          {isLoading
            ? "Loading..."
            : `${rows.length.toLocaleString()} symbol${rows.length === 1 ? "" : "s"}`}
        </div>
      </Toolbar>
      {/* Main Table / View Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-canvas flex items-center justify-center z-20" data-testid="loading-state">
            <EmptyState
              title="Loading symbols"
              description="Reading the local symbol index. Run analysis if this project has not been scanned."
            />
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center" data-testid="error-state">
            <EmptyState
              title="Symbols failed to load"
              description={error}
            />
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="flex-1 flex items-center justify-center" data-testid="empty-state">
            <EmptyState
              title="No symbols match the current filters"
              description="No symbols are in the current result. Clear filters, or run analysis if this project has not been scanned."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setLanguageFilter("all");
                    setKindFilter("all");
                    setPathPrefix("");
                    setMinComplexity("all");
                    setIsExportedOnly(false);
                    setHasErrorHandlingOnly(false);
                    setHasSideEffectsOnly(false);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
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
              <thead className="bg-surface sticky top-0 z-10 text-text-secondary text-caption font-sans font-medium border-b border-border-default select-none shadow-sm">
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
                      className={`h-9 border-b border-border-subtle cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-accent-subtle text-text-primary"
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
      <div className="h-7 border-t border-border-default bg-surface px-3 flex items-center justify-between text-caption text-text-muted font-sans">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Select
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd>
            Open in Explorer
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>/</Kbd>
            Search
          </span>
        </div>
        <div>Double-click a row to open that line</div>
      </div>
    </div>
  );
};
