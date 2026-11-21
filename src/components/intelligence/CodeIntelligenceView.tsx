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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileCode,
  Filter,
  ExternalLink,
  X,
  AlertTriangle,
  GitBranch,
  Layers,
  Code,
  Shield,
  Zap,
} from "lucide-react";
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

export type PerspectiveTab =
  | "all"
  | "hotspots"
  | "functions"
  | "classes"
  | "exports"
  | "side_effects";

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

  // Active Perspective
  const [activePerspective, setActivePerspective] = useState<PerspectiveTab>("all");

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [pathPrefix, setPathPrefix] = useState<string>("");
  const [minComplexity, setMinComplexity] = useState<number | "all">("all");
  const [isExportedOnly, setIsExportedOnly] = useState<boolean>(false);
  const [hasErrorHandlingOnly, setHasErrorHandlingOnly] = useState<boolean>(false);
  const [hasSideEffectsOnly, setHasSideEffectsOnly] = useState<boolean>(false);

  // Sorting (default alphabetical by name)
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  // Selected row index and explicit selected record for dossier inspection
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedRecord, setSelectedRecord] = useState<SymbolRecord | null>(
    selectedSymbol || null
  );
  const [showDetailDrawer, setShowDetailDrawer] = useState<boolean>(!!selectedSymbol);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sync selectedRecord when selectedSymbol prop changes
  useEffect(() => {
    if (selectedSymbol) {
      setSelectedRecord(selectedSymbol);
      setShowDetailDrawer(true);
    }
  }, [selectedSymbol]);

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

  // Compute overall Project Intelligence KPI stats from available symbols
  const stats = useMemo(() => {
    const dataset = initialSymbols || symbols;
    let total = dataset.length;
    let functions = 0;
    let classes = 0;
    let types = 0;
    let hotspots = 0;
    let hubs = 0;
    let exported = 0;
    let sideEffects = 0;
    let errorHandling = 0;

    for (const s of dataset) {
      const k = (s.kind || "").toLowerCase();
      if (k === "function" || k === "method") {
        functions++;
      } else if (k === "class") {
        classes++;
      } else if (k === "interface" || k === "type" || k === "struct" || k === "enum") {
        types++;
      }

      if ((s.complexity ?? 0) >= 10) hotspots++;
      if ((s.callers?.length ?? 0) >= 1 || (s.callees?.length ?? 0) >= 2) hubs++;
      if (s.is_exported) exported++;
      if (s.has_side_effects) sideEffects++;
      if (s.has_error_handling) errorHandling++;
    }

    return {
      total,
      functions,
      classes,
      types,
      hotspots,
      hubs,
      exported,
      sideEffects,
      errorHandling,
    };
  }, [initialSymbols, symbols]);

  // Handle switching perspective tabs
  const handleSelectPerspective = (perspective: PerspectiveTab) => {
    setActivePerspective(perspective);
    switch (perspective) {
      case "all":
        setKindFilter("all");
        setMinComplexity("all");
        setIsExportedOnly(false);
        setHasSideEffectsOnly(false);
        break;
      case "hotspots":
        setKindFilter("all");
        setMinComplexity(10);
        setIsExportedOnly(false);
        setHasSideEffectsOnly(false);
        break;
      case "functions":
        setKindFilter("function");
        setMinComplexity("all");
        setIsExportedOnly(false);
        setHasSideEffectsOnly(false);
        break;
      case "classes":
        setKindFilter("class");
        setMinComplexity("all");
        setIsExportedOnly(false);
        setHasSideEffectsOnly(false);
        break;
      case "exports":
        setKindFilter("all");
        setMinComplexity("all");
        setIsExportedOnly(true);
        setHasSideEffectsOnly(false);
        break;
      case "side_effects":
        setKindFilter("all");
        setMinComplexity("all");
        setIsExportedOnly(false);
        setHasSideEffectsOnly(true);
        break;
    }
  };

  // If initialSymbols were supplied (e.g. testing), filter them client-side too
  const filteredData = useMemo(() => {
    if (!initialSymbols) return symbols;

    return initialSymbols.filter((sym) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !sym.name.toLowerCase().includes(q) &&
          !sym.file_path.toLowerCase().includes(q) &&
          !(sym.docstring || "").toLowerCase().includes(q) &&
          !(sym.signature || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (languageFilter !== "all") {
        const ext = sym.file_path.split(".").pop()?.toLowerCase();
        if (
          languageFilter === "typescript" &&
          ext !== "ts" &&
          ext !== "tsx" &&
          ext !== "js" &&
          ext !== "jsx"
        ) {
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
          <div
            className="flex items-center gap-1 text-text-muted text-micro font-mono truncate max-w-xs"
            title={info.getValue()}
          >
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
            <div className="flex items-center justify-center gap-1">
              <span
                className={`tabular-nums text-caption font-mono font-medium ${
                  isHigh
                    ? "text-status-danger-text"
                    : isMedium
                    ? "text-status-warning-text"
                    : "text-text-secondary"
                }`}
              >
                {val}
              </span>
              {isHigh && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-status-danger-text inline-block"
                  title="Cyclomatic Complexity ≥ 10: High complexity hotspot"
                />
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => row.callers?.length ?? 0, {
        id: "callers",
        header: "Callers",
        cell: (info) => {
          const count = info.getValue();
          return (
            <span
              className={`tabular-nums text-caption text-center block ${
                count > 0 ? "text-text-primary font-medium" : "text-text-muted"
              }`}
            >
              {count}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.callees?.length ?? 0, {
        id: "callees",
        header: "Callees",
        cell: (info) => {
          const count = info.getValue();
          return (
            <span
              className={`tabular-nums text-caption text-center block ${
                count > 0 ? "text-text-primary font-medium" : "text-text-muted"
              }`}
            >
              {count}
            </span>
          );
        },
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
        if (targetRow) {
          setSelectedRecord(targetRow);
          if (onSelectSymbol) {
            onSelectSymbol(targetRow);
          }
        }
        virtualizer.scrollToIndex(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        const targetRow = rows[next]?.original;
        if (targetRow) {
          setSelectedRecord(targetRow);
          if (onSelectSymbol) {
            onSelectSymbol(targetRow);
          }
        }
        virtualizer.scrollToIndex(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = selectedRecord || rows[selectedIndex]?.original;
      if (current && onNavigateToFileLine) {
        onNavigateToFileLine(current.file_path, current.start_line);
      }
    } else if (e.key === "Escape") {
      if (searchQuery) {
        e.preventDefault();
        setSearchQuery("");
      }
    }
  };

  // Global keydown for "/" shortcut to focus search
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement !== searchInputRef.current &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  const fieldClass =
    "bg-elevated border border-border-default rounded-sm px-2 py-1 text-caption text-text-primary focus-ring w-full";

  // Check how many custom filters are applied
  const activeCustomFilterCount = useMemo(() => {
    let count = 0;
    if (languageFilter !== "all") count++;
    if (kindFilter !== "all") count++;
    if (pathPrefix.trim()) count++;
    if (minComplexity !== "all") count++;
    if (isExportedOnly) count++;
    if (hasErrorHandlingOnly) count++;
    if (hasSideEffectsOnly) count++;
    return count;
  }, [
    languageFilter,
    kindFilter,
    pathPrefix,
    minComplexity,
    isExportedOnly,
    hasErrorHandlingOnly,
    hasSideEffectsOnly,
  ]);

  const renderSymbolFilters = () => (
    <div className="flex flex-col gap-2 text-caption font-sans">
      <div className="flex items-center justify-between pb-1 border-b border-border-subtle font-medium text-text-primary">
        <span>Filter Symbols</span>
        {activeCustomFilterCount > 0 && (
          <button
            onClick={() => {
              setLanguageFilter("all");
              setKindFilter("all");
              setPathPrefix("");
              setMinComplexity("all");
              setIsExportedOnly(false);
              setHasErrorHandlingOnly(false);
              setHasSideEffectsOnly(false);
              setActivePerspective("all");
            }}
            className="text-micro text-text-muted hover:text-text-primary underline"
          >
            Reset
          </button>
        )}
      </div>
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
          <option value="10">≥ 10 (Hotspot)</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={isExportedOnly}
          onChange={(e) => setIsExportedOnly(e.target.checked)}
          data-testid="filter-exported"
        />
        Exported only
      </label>
      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={hasErrorHandlingOnly}
          onChange={(e) => setHasErrorHandlingOnly(e.target.checked)}
          data-testid="filter-error-handling"
        />
        Has error handling
      </label>
      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={hasSideEffectsOnly}
          onChange={(e) => setHasSideEffectsOnly(e.target.checked)}
          data-testid="filter-side-effects"
        />
        Has side effects (I/O, state)
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
      {/* Top Architectural Intelligence KPI Ribbon */}
      <div className="border-b border-border-default bg-surface px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Symbol Scale */}
          <div
            onClick={() => handleSelectPerspective("all")}
            className={`p-3 rounded border transition-colors cursor-pointer ${
              activePerspective === "all"
                ? "bg-elevated border-border-strong shadow-xs"
                : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
            }`}
            data-testid="kpi-card-total"
            title="Click to view all symbols"
          >
            <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
              <span>Symbol Inventory</span>
              <Layers className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div className="mt-1 text-xl font-mono font-bold text-text-primary tabular-nums">
              {stats.total.toLocaleString()}
            </div>
            <div className="mt-0.5 text-caption text-text-secondary truncate">
              {stats.functions} functions • {stats.classes} classes • {stats.types} types
            </div>
          </div>

          {/* Card 2: Complexity Hotspots */}
          <div
            onClick={() => handleSelectPerspective("hotspots")}
            className={`p-3 rounded border transition-colors cursor-pointer ${
              activePerspective === "hotspots"
                ? "bg-elevated border-status-warning-text/40 shadow-xs"
                : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
            }`}
            data-testid="kpi-card-hotspots"
            title="Click to isolate high-complexity functions needing refactoring or testing"
          >
            <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
              <span className="flex items-center gap-1.5">
                <span>Complexity Hotspots</span>
                {stats.hotspots > 0 && (
                  <span className="w-2 h-2 rounded-full bg-status-danger-text inline-block" />
                )}
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-status-warning-text" />
            </div>
            <div className="mt-1 text-xl font-mono font-bold text-text-primary tabular-nums flex items-baseline gap-2">
              <span>{stats.hotspots}</span>
              <span className="text-micro font-sans font-normal text-text-muted">
                (CC ≥ 10)
              </span>
            </div>
            <div className="mt-0.5 text-caption text-text-secondary truncate">
              {stats.hotspots > 0
                ? "Heavily branched logic needing tests"
                : "No high-complexity functions detected"}
            </div>
          </div>

          {/* Card 3: Core Hubs & Callers */}
          <div
            onClick={() => {
              // Sort by callers descending to surface hubs
              setSorting([{ id: "callers", desc: true }]);
            }}
            className="p-3 rounded border bg-surface border-border-subtle hover:border-border-default hover:bg-hover transition-colors cursor-pointer"
            data-testid="kpi-card-hubs"
            title="Click to sort by caller fan-in and view central project hubs"
          >
            <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
              <span>Architectural Hubs</span>
              <GitBranch className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div className="mt-1 text-xl font-mono font-bold text-text-primary tabular-nums">
              {stats.hubs}
            </div>
            <div className="mt-0.5 text-caption text-text-secondary truncate">
              Central functions with inbound callers
            </div>
          </div>

          {/* Card 4: Public Surface & I/O */}
          <div
            onClick={() => handleSelectPerspective("exports")}
            className={`p-3 rounded border transition-colors cursor-pointer ${
              activePerspective === "exports"
                ? "bg-elevated border-border-strong shadow-xs"
                : "bg-surface border-border-subtle hover:border-border-default hover:bg-hover"
            }`}
            data-testid="kpi-card-exports"
            title="Click to view exported module API surface"
          >
            <div className="flex items-center justify-between text-micro uppercase tracking-wider text-text-muted font-mono font-medium">
              <span>Public API Surface</span>
              <Shield className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div className="mt-1 text-xl font-mono font-bold text-text-primary tabular-nums">
              {stats.exported}
            </div>
            <div className="mt-0.5 text-caption text-text-secondary truncate">
              {stats.sideEffects} with I/O effects • {stats.errorHandling} error handling
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Perspective Pills, Filter, and Result Count */}
      <Toolbar className="border-b border-border-default bg-surface/75 px-3 py-1.5 flex-wrap gap-2">
        <ToolbarGroup className="flex-1 min-w-0 gap-2 items-center flex-wrap">
          {/* FTS Search Input */}
          <div className="w-64 max-w-sm">
            <SearchInput
              ref={searchInputRef}
              placeholder='Search symbols with FTS ("/" to focus)...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              data-testid="symbol-search-input"
              suffix={
                searchQuery ? (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-text-muted hover:text-text-primary"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <Kbd>/</Kbd>
                )
              }
            />
          </div>

          {/* Instant Perspective Pills (1-Click Filters) */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5" data-testid="perspective-pills">
            <button
              onClick={() => handleSelectPerspective("all")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                activePerspective === "all"
                  ? "bg-elevated text-text-primary border border-border-strong"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              All
            </button>
            <button
              onClick={() => handleSelectPerspective("hotspots")}
              className={`px-2.5 py-1 rounded text-caption font-medium flex items-center gap-1.5 transition-colors ${
                activePerspective === "hotspots"
                  ? "bg-status-danger-bg text-status-danger-text border border-status-danger-text/40"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              <Zap className="w-3 h-3" />
              Hotspots (CC ≥ 10)
              {stats.hotspots > 0 && (
                <span className="text-micro font-mono bg-status-danger-text/10 px-1 rounded">
                  {stats.hotspots}
                </span>
              )}
            </button>
            <button
              onClick={() => handleSelectPerspective("functions")}
              className={`px-2.5 py-1 rounded text-caption font-medium flex items-center gap-1.5 transition-colors ${
                activePerspective === "functions"
                  ? "bg-elevated text-text-primary border border-border-strong"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              <Code className="w-3 h-3" />
              Functions
            </button>
            <button
              onClick={() => handleSelectPerspective("classes")}
              className={`px-2.5 py-1 rounded text-caption font-medium flex items-center gap-1.5 transition-colors ${
                activePerspective === "classes"
                  ? "bg-elevated text-text-primary border border-border-strong"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              <Layers className="w-3 h-3" />
              Classes & Types
            </button>
            <button
              onClick={() => handleSelectPerspective("exports")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                activePerspective === "exports"
                  ? "bg-elevated text-text-primary border border-border-strong"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              Exports
            </button>
            <button
              onClick={() => handleSelectPerspective("side_effects")}
              className={`px-2.5 py-1 rounded text-caption font-medium transition-colors ${
                activePerspective === "side_effects"
                  ? "bg-elevated text-text-primary border border-border-strong"
                  : "text-text-secondary hover:text-text-primary hover:bg-hover"
              }`}
            >
              Side Effects (I/O)
            </button>
          </div>

          {/* Advanced Filter Popover */}
          <Popover
            align="left"
            className="w-72 p-2.5"
            trigger={
              <Button
                variant={activeCustomFilterCount > 0 ? "secondary" : "ghost"}
                size="sm"
                icon={<Filter className="w-3.5 h-3.5" />}
              >
                <span>Filter</span>
                {activeCustomFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-elevated text-micro font-mono rounded border border-border-default">
                    {activeCustomFilterCount}
                  </span>
                )}
              </Button>
            }
          >
            {renderSymbolFilters()}
          </Popover>
        </ToolbarGroup>

        <div className="flex items-center gap-2">
          <div className="text-caption text-text-muted tabular-nums" data-testid="result-count">
            {isLoading
              ? "Loading..."
              : `${rows.length.toLocaleString()} symbol${rows.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </Toolbar>

      {/* Main Table / View Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {isLoading && (
          <div
            className="absolute inset-0 bg-canvas flex items-center justify-center z-20"
            data-testid="loading-state"
          >
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
                    setActivePerspective("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        )}

        {!error && rows.length > 0 && (
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
                    selectedRecord?.id === row.original.id ||
                    selectedSymbol?.id === row.original.id;
                  return (
                    <tr
                      key={row.id}
                      data-index={virtualRow.index}
                      onClick={() => {
                        setSelectedIndex(virtualRow.index);
                        setSelectedRecord(row.original);
                        setShowDetailDrawer(true);
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

        {/* Selected Symbol Intelligence Dossier (Split Drawer / Inspector) */}
        {!isLoading && !error && selectedRecord && showDetailDrawer && (
          <div
            className="border-t border-border-default bg-surface flex flex-col max-h-56 overflow-hidden flex-shrink-0"
            data-testid="symbol-detail-drawer"
          >
            {/* Dossier Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-elevated/40 text-caption font-sans">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-micro uppercase font-mono font-bold text-text-muted">
                  Symbol Dossier
                </span>
                <span className="text-text-muted">•</span>
                <Badge variant="neutral" size="sm">
                  {selectedRecord.kind}
                </Badge>
                <span
                  className="font-mono font-semibold text-text-primary truncate"
                  data-testid="dossier-symbol-title"
                  title={selectedRecord.name}
                >
                  Symbol: {selectedRecord.parent_name ? `${selectedRecord.parent_name}.${selectedRecord.name}` : selectedRecord.name}
                </span>
                <Badge variant={selectedRecord.confidence} size="sm">
                  {selectedRecord.confidence}
                </Badge>
                <span className="text-text-muted text-micro font-mono truncate">
                  {selectedRecord.file_path}:{selectedRecord.start_line}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onNavigateToFileLine?.(selectedRecord.file_path, selectedRecord.start_line)
                  }
                  icon={<ExternalLink className="w-3 h-3" />}
                  data-testid="dossier-jump-btn"
                >
                  Jump to Code
                </Button>
                <button
                  onClick={() => setShowDetailDrawer(false)}
                  className="p-1 text-text-muted hover:text-text-primary rounded transition-colors"
                  title="Close Preview Drawer"
                  data-testid="close-detail-drawer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Dossier Grid Body */}
            <div className="p-3 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-3 text-caption font-sans">
              {/* Column 1: Signature & Docstring */}
              <div className="flex flex-col gap-1.5 md:col-span-1 min-w-0">
                <span className="text-micro font-mono uppercase text-text-muted">Signature & Purpose</span>
                <div className="bg-canvas border border-border-subtle rounded p-2 text-micro font-mono text-text-primary overflow-x-auto whitespace-pre max-h-16">
                  {selectedRecord.signature || `${selectedRecord.kind} ${selectedRecord.name}`}
                </div>
                <div className="text-caption text-text-secondary text-xs line-clamp-2" title={selectedRecord.docstring || ""}>
                  {selectedRecord.docstring ? (
                    selectedRecord.docstring
                  ) : (
                    <span className="text-text-muted italic">No inline documentation comment.</span>
                  )}
                </div>
              </div>

              {/* Column 2: Complexity & Risk Assessment */}
              <div className="flex flex-col gap-1.5 md:col-span-1">
                <span className="text-micro font-mono uppercase text-text-muted">Complexity & Health</span>
                <div className="bg-canvas border border-border-subtle rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-base font-bold ${
                        (selectedRecord.complexity ?? 0) >= 10
                          ? "text-status-danger-text"
                          : (selectedRecord.complexity ?? 0) >= 5
                          ? "text-status-warning-text"
                          : "text-status-success-text"
                      }`}
                    >
                      CC {selectedRecord.complexity ?? "—"}
                    </span>
                    <span className="text-micro text-text-muted">
                      {(selectedRecord.complexity ?? 0) >= 10
                        ? "High branch density"
                        : (selectedRecord.complexity ?? 0) >= 5
                        ? "Moderate branching"
                        : "Linear flow"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedRecord.is_exported && (
                      <Badge variant="neutral" size="sm">
                        Exported
                      </Badge>
                    )}
                    {selectedRecord.has_side_effects && (
                      <Badge variant="neutral" size="sm">
                        Side Effects
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-micro text-text-muted">
                  <span>Lines: {selectedRecord.start_line} – {selectedRecord.end_line}</span>
                  <span>•</span>
                  <span>
                    {selectedRecord.has_error_handling ? "Handled Errors" : "No Error Blocks"}
                  </span>
                </div>
              </div>

              {/* Column 3: Call Graph Fan-in / Fan-out */}
              <div className="flex flex-col gap-1.5 md:col-span-1 min-w-0">
                <span className="text-micro font-mono uppercase text-text-muted">
                  Call Graph Relationships
                </span>
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-text-muted text-micro w-14 flex-shrink-0">Callers:</span>
                    {selectedRecord.callers && selectedRecord.callers.length > 0 ? (
                      <div className="flex items-center gap-1 overflow-x-auto truncate">
                        {selectedRecord.callers.slice(0, 3).map((caller) => (
                          <button
                            key={caller}
                            onClick={() => setSearchQuery(caller)}
                            className="bg-elevated hover:bg-hover border border-border-subtle rounded px-1.5 py-0.2 text-micro font-mono text-text-primary"
                            title={`Click to filter by ${caller}`}
                          >
                            @{caller}
                          </button>
                        ))}
                        {selectedRecord.callers.length > 3 && (
                          <span className="text-micro text-text-muted">
                            +{selectedRecord.callers.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-muted italic text-micro">None detected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-text-muted text-micro w-14 flex-shrink-0">Callees:</span>
                    {selectedRecord.callees && selectedRecord.callees.length > 0 ? (
                      <div className="flex items-center gap-1 overflow-x-auto truncate">
                        {selectedRecord.callees.slice(0, 3).map((callee) => (
                          <button
                            key={callee}
                            onClick={() => setSearchQuery(callee)}
                            className="bg-elevated hover:bg-hover border border-border-subtle rounded px-1.5 py-0.2 text-micro font-mono text-text-primary"
                            title={`Click to filter by ${callee}`}
                          >
                            @{callee}
                          </button>
                        ))}
                        {selectedRecord.callees.length > 3 && (
                          <span className="text-micro text-text-muted">
                            +{selectedRecord.callees.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-muted italic text-micro">None detected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
            Open in Editor
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>/</Kbd>
            Search
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd>
            Clear
          </span>
        </div>
        <div>Double-click a row to open that line</div>
      </div>
    </div>
  );
};
