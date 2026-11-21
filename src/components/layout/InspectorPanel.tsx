import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Hash,
  Layers,
  ShieldCheck,
  ExternalLink,
  Loader2,
  X,
  Copy,
  Check,
  RefreshCw,
  Globe,
  Radio,
  FileCode,
  Package,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import type {
  ClassDetailResponse,
  FileRecord,
  SymbolDetail,
  SymbolRecord,
  CallDetailItem,
  SideEffectMarker,
  FileIntelligenceDto,
} from "@/types/ipc";
import type { SelectedDiagramElement } from "@/types/diagram";
import { Badge } from "@/components/ui/Badge";
import { getClassDetail, getSymbolDetail, getFileIntelligence } from "@/lib/tauri";

export interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  onResize?: (width: number) => void;
  selectedFile: FileRecord | null;
  selectedSymbol?: SymbolRecord | null;
  selectedDiagramElement?: SelectedDiagramElement | null;
  onClearDiagramElement?: () => void;
  onSelectSymbol?: (symbol: SymbolRecord | null) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  onTriggerScan?: () => void;
  // Optional pre-loaded detail for tests
  initialSymbolDetail?: SymbolDetail | null;
  initialClassDetail?: ClassDetailResponse | null;
  initialFileIntelligence?: FileIntelligenceDto | null;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  onToggle,
  width,
  onResize,
  selectedFile,
  selectedSymbol,
  selectedDiagramElement,
  onClearDiagramElement,
  onSelectSymbol,
  onNavigateToSource,
  onTriggerScan,
  initialSymbolDetail,
  initialClassDetail,
  initialFileIntelligence,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [activeSymbolId, setActiveSymbolId] = useState<number | null>(
    selectedSymbol?.id ?? null
  );
  const [activeSymbolRecord, setActiveSymbolRecord] = useState<SymbolRecord | null>(
    selectedSymbol ?? null
  );
  const [symbolDetail, setSymbolDetail] = useState<SymbolDetail | null>(
    initialSymbolDetail ?? null
  );
  const [classDetail, setClassDetail] = useState<ClassDetailResponse | null>(
    initialClassDetail ?? null
  );
  const [fileIntel, setFileIntel] = useState<FileIntelligenceDto | null>(
    initialFileIntelligence ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load file intelligence & blast radius whenever selectedFile changes
  useEffect(() => {
    if (initialFileIntelligence) {
      setFileIntel(initialFileIntelligence);
      return;
    }
    if (!selectedFile) {
      setFileIntel(null);
      return;
    }
    getFileIntelligence(selectedFile.project_id, selectedFile.relative_path)
      .then(setFileIntel)
      .catch(() => setFileIntel(null));
  }, [selectedFile, initialFileIntelligence]);

  // Sync when selectedSymbol prop changes from outside
  useEffect(() => {
    if (selectedSymbol) {
      setActiveSymbolId(selectedSymbol.id);
      setActiveSymbolRecord(selectedSymbol);
      setHistory([]);
    }
  }, [selectedSymbol]);

  // Load symbol detail & class detail whenever activeSymbolId changes
  useEffect(() => {
    if (!activeSymbolId) {
      if (!initialSymbolDetail) setSymbolDetail(null);
      if (!initialClassDetail) setClassDetail(null);
      return;
    }

    if (initialSymbolDetail && initialSymbolDetail.symbol.id === activeSymbolId) {
      setSymbolDetail(initialSymbolDetail);
      setActiveSymbolRecord(initialSymbolDetail.symbol);
      if (initialClassDetail) setClassDetail(initialClassDetail);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      getSymbolDetail(activeSymbolId),
      getClassDetail(activeSymbolId),
    ])
      .then(([sDetail, cDetail]) => {
        if (!isMounted) return;
        if (sDetail) {
          setSymbolDetail(sDetail);
          setActiveSymbolRecord(sDetail.symbol);
        }
        setClassDetail(cDetail);
      })
      .catch((err) => {
        console.error("Failed to load symbol inspector details:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeSymbolId, initialSymbolDetail, initialClassDetail]);

  const handleNavigateSymbol = (targetSymbolId: number) => {
    if (activeSymbolId) {
      setHistory((prev) => [...prev, activeSymbolId]);
    }
    setActiveSymbolId(targetSymbolId);
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((prevList) => prevList.slice(0, prevList.length - 1));
    setActiveSymbolId(prev);
  };

  const handleClearSymbol = () => {
    setActiveSymbolId(null);
    setActiveSymbolRecord(null);
    setSymbolDetail(null);
    setClassDetail(null);
    setHistory([]);
    if (onSelectSymbol) {
      onSelectSymbol(null);
    }
  };

  // Panel resizing logic
  useEffect(() => {
    if (!isDragging || !onResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 260 && newWidth <= 600) {
        onResize(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize]);

  if (!isOpen) {
    return (
      <div className="w-8 bg-surface border-l border-border-default flex flex-col items-center py-2 flex-shrink-0 transition-all duration-150 ease-out">
        <button
          onClick={onToggle}
          title="Open Inspector Panel"
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
          data-testid="toggle-inspector-open"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="[writing-mode:vertical-lr] rotate-180 mt-4 text-micro font-sans font-medium text-text-muted select-none">
          Inspector
        </span>
      </div>
    );
  }

  const isInspectingSymbol = !!activeSymbolRecord;

  // Group callers
  const incomingCalls = symbolDetail?.incoming_calls || [];
  const confirmedIncoming = incomingCalls.filter(
    (c) => c.resolution_status === "confirmed" || c.resolution_status === "static"
  );
  const inferredIncoming = incomingCalls.filter(
    (c) => c.resolution_status === "inferred" || c.resolution_status === "unknown"
  );

  // Group callees
  const outgoingCalls = symbolDetail?.outgoing_calls || [];
  const confirmedOutgoing = outgoingCalls.filter(
    (c) => c.resolution_status === "confirmed" || c.resolution_status === "static"
  );
  const inferredOutgoing = outgoingCalls.filter(
    (c) => c.resolution_status === "inferred" || c.resolution_status === "unknown"
  );

  // Side effects
  const sideEffectsList: SideEffectMarker[] =
    symbolDetail?.function_metrics?.side_effects || [];

  const isClass =
    activeSymbolRecord?.kind.toLowerCase() === "class" || !!classDetail;

  return (
    <aside
      style={{ width }}
      className="relative bg-surface border-l border-border-default flex flex-col select-none flex-shrink-0 h-full overflow-hidden transition-[width] duration-150 ease-out"
      data-testid="inspector-panel"
    >
      {/* 1px Hairline + 6px invisible grab handle on left edge */}
      {onResize && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          aria-hidden="true"
          className={`absolute top-0 bottom-0 -left-[3px] w-1.5 z-30 cursor-col-resize ${
            isDragging ? "bg-accent/30" : "bg-transparent"
          }`}
          title="Drag to resize Inspector panel"
        />
      )}

      {/* Header */}
      <div className="h-8 border-b border-border-default px-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleBack}
              title="Go back to previous symbol"
              className="p-0.5 rounded hover:bg-hover text-text-muted hover:text-text-primary flex items-center gap-0.5 text-caption font-sans"
              data-testid="inspector-back-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back ({history.length})</span>
            </button>
          )}
          <span className="text-caption font-semibold text-text-primary font-sans">
            {selectedDiagramElement
              ? selectedDiagramElement.type === "node"
                ? "Diagram Node"
                : "Relationship"
              : isInspectingSymbol
              ? "Symbol Inspector"
              : "File Inspector"}
          </span>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
        </div>

        <div className="flex items-center gap-1">
          {selectedDiagramElement && onClearDiagramElement && (
            <button
              onClick={onClearDiagramElement}
              title="Clear diagram element selection"
              className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary"
              data-testid="inspector-clear-diagram-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isInspectingSymbol && selectedFile && (
            <button
              onClick={handleClearSymbol}
              title="Return to file inspection"
              className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary"
              data-testid="inspector-clear-symbol-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onToggle}
            title="Collapse Inspector"
            className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
            data-testid="toggle-inspector-collapse"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 text-meta flex flex-col gap-4">
        {selectedDiagramElement ? (
          selectedDiagramElement.type === "node" ? (
            <DiagramNodeInspector
              node={selectedDiagramElement.node}
              connectedEdges={selectedDiagramElement.connectedEdges}
              onNavigateToSource={onNavigateToSource}
            />
          ) : (
            <DiagramEdgeInspector
              edge={selectedDiagramElement.edge}
              fromNode={selectedDiagramElement.fromNode}
              toNode={selectedDiagramElement.toNode}
              onNavigateToSource={onNavigateToSource}
            />
          )
        ) : isInspectingSymbol && activeSymbolRecord ? (
          <>
            {/* Symbol Header Summary */}
            <div className="flex flex-col gap-2 pb-3 border-b border-border-subtle" data-testid="symbol-header-section">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-semibold text-text-primary text-body truncate">
                      {activeSymbolRecord.name}
                    </span>
                    <Badge variant="neutral" size="sm">
                      {activeSymbolRecord.kind}
                    </Badge>
                  </div>
                  {activeSymbolRecord.parent_name && (
                    <span className="text-micro font-mono text-text-muted">
                      Member of {activeSymbolRecord.parent_name}
                    </span>
                  )}
                </div>

                <Badge variant={activeSymbolRecord.confidence} size="sm">
                  {activeSymbolRecord.confidence}
                </Badge>
              </div>

              {/* Source Link */}
              <div className="flex items-center justify-between text-micro font-mono text-text-muted bg-canvas p-1.5 rounded border border-border-subtle">
                <span className="truncate" title={activeSymbolRecord.file_path}>
                  {activeSymbolRecord.file_path}:L{activeSymbolRecord.start_line}
                </span>
                {onNavigateToSource && (
                  <button
                    onClick={() =>
                      onNavigateToSource(
                        activeSymbolRecord.file_path,
                        activeSymbolRecord.start_line
                      )
                    }
                    className="flex items-center gap-1 text-accent hover:underline flex-shrink-0 ml-1"
                    title="Jump to source code"
                    data-testid="click-to-source-header"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Source</span>
                  </button>
                )}
              </div>
            </div>

            {/* SECTION 1: SIGNATURE */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-signature">
              <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                Signature
              </div>
              {activeSymbolRecord.signature ? (
                <pre className="p-2 bg-canvas rounded border border-border-subtle font-mono text-micro overflow-x-auto select-text text-text-primary whitespace-pre-wrap">
                  <code>{activeSymbolRecord.signature}</code>
                </pre>
              ) : (
                <span className="text-text-secondary text-body">None detected</span>
              )}
            </div>

            {/* SECTION 2: RELATIONSHIPS (CALLERS & CALLEES) */}
            <div className="flex flex-col gap-3" data-testid="inspector-section-relationships">
              <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                Relationships
              </div>

              {/* Callers */}
              <div className="flex flex-col gap-1.5" data-testid="inspector-callers-group">
                <div className="text-micro font-medium text-text-muted">
                  Incoming Calls (Callers)
                </div>
                {incomingCalls.length === 0 ? (
                  <span className="text-text-secondary text-body">None detected</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Confirmed / Static Callers */}
                    {confirmedIncoming.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-caption font-medium text-text-muted">
                          Resolved Callers (Confirmed / Static)
                        </div>
                        {confirmedIncoming.map((call) => (
                          <RelationshipRow
                            key={call.id}
                            call={call}
                            onNavigateSymbol={handleNavigateSymbol}
                            onNavigateToSource={onNavigateToSource}
                            targetFilePath={call.caller_file_path || activeSymbolRecord.file_path}
                          />
                        ))}
                      </div>
                    )}

                    {/* Inferred / Unknown Callers */}
                    {inferredIncoming.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-caption font-medium text-text-muted">
                          Unresolved / Dynamic Callers (Inferred / Unknown)
                        </div>
                        {inferredIncoming.map((call) => (
                          <RelationshipRow
                            key={call.id}
                            call={call}
                            onNavigateSymbol={handleNavigateSymbol}
                            onNavigateToSource={onNavigateToSource}
                            targetFilePath={call.caller_file_path || activeSymbolRecord.file_path}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Callees */}
              <div className="flex flex-col gap-1.5" data-testid="inspector-callees-group">
                <div className="text-micro font-medium text-text-muted">
                  Outgoing Calls (Callees)
                </div>
                {outgoingCalls.length === 0 ? (
                  <span className="text-text-secondary text-body">None detected</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Confirmed / Static Callees */}
                    {confirmedOutgoing.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-caption font-medium text-text-muted">
                          Resolved Callees (Confirmed / Static)
                        </div>
                        {confirmedOutgoing.map((call) => (
                          <RelationshipRow
                            key={call.id}
                            call={call}
                            isCallee
                            onNavigateSymbol={handleNavigateSymbol}
                            onNavigateToSource={onNavigateToSource}
                            targetFilePath={activeSymbolRecord.file_path}
                          />
                        ))}
                      </div>
                    )}

                    {/* Inferred / Unknown Callees */}
                    {inferredOutgoing.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-caption font-medium text-text-muted">
                          Unresolved / Dynamic Callees (Inferred / Unknown)
                        </div>
                        {inferredOutgoing.map((call) => (
                          <RelationshipRow
                            key={call.id}
                            call={call}
                            isCallee
                            onNavigateSymbol={handleNavigateSymbol}
                            onNavigateToSource={onNavigateToSource}
                            targetFilePath={activeSymbolRecord.file_path}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: METRICS */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-metrics">
              <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                Metrics
              </div>
              {symbolDetail?.function_metrics ? (
                <div className="grid grid-cols-2 gap-2 text-caption font-mono">
                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="McCabe Cyclomatic Complexity: CC = 1 + ∑ branches + ∑ loops (from DECISIONS.md)"
                  >
                    <span className="text-text-muted text-micro font-medium">Complexity</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.cyclomatic_complexity}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Branch points: if/elif, conditionals/ternaries, switch cases, and boolean operators (&&, ||, ??, and, or)"
                  >
                    <span className="text-text-muted text-micro font-medium">Branches</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.branch_count}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Loop points: for, for-in, for-of, while, do-while"
                  >
                    <span className="text-text-muted text-micro font-medium">Loops</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.loop_count}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Explicit exception handling constructs: try/catch (TS/JS) or try/except (Python)"
                  >
                    <span className="text-text-muted text-micro font-medium">Error Handling</span>
                    <span className="text-text-primary font-medium text-body truncate">
                      {symbolDetail.function_metrics.has_error_handling
                        ? "Present"
                        : "None detected"}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-text-secondary text-body">None detected</span>
              )}
            </div>

            {/* SECTION 4: SIDE EFFECTS */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-side-effects">
              <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                Side Effects
              </div>
              {sideEffectsList.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {sideEffectsList.map((marker, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 bg-canvas rounded border border-border-subtle flex items-center justify-between text-micro font-mono"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="px-1.5 py-0.5 rounded-sm bg-status-warning-bg/40 text-status-warning-text font-medium text-[10px]">
                          {marker.category}
                        </span>
                        <span className="text-text-primary truncate" title={marker.pattern}>
                          {marker.pattern}
                        </span>
                        <span className="text-text-muted">L{marker.line_number}</span>
                      </div>
                      <Badge variant="static" size="sm">
                        static
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-text-secondary text-body">None detected</span>
              )}
            </div>

            {/* SECTION 5: EVIDENCE */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-evidence">
              <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                Evidence
              </div>
              <div className="flex flex-col gap-1.5 text-micro font-mono bg-canvas p-2 rounded border border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Location:</span>
                  <span className="text-text-primary">
                    L{activeSymbolRecord.start_line}-{activeSymbolRecord.end_line} (Cols: C{activeSymbolRecord.start_column}-{activeSymbolRecord.end_column})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Confidence:</span>
                  <Badge variant={activeSymbolRecord.confidence} size="sm">
                    {activeSymbolRecord.confidence}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Provenance:</span>
                  <span className="text-text-secondary">AST Node (Tree-sitter)</span>
                </div>

                {symbolDetail?.snippet ? (
                  <div className="mt-1 flex flex-col gap-1">
                    <span className="text-text-muted text-[11px] font-medium">Snippet:</span>
                    <pre className="p-2 bg-surface rounded border border-border-subtle font-mono text-micro overflow-x-auto text-text-muted max-h-36 select-text whitespace-pre-wrap">
                      <code>{symbolDetail.snippet}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="text-text-muted text-[11px] font-medium block">Snippet:</span>
                    <span className="text-text-secondary text-body">None detected</span>
                  </div>
                )}
              </div>
            </div>

            {/* CLASS SECTIONS: MEMBERS & INHERITANCE */}
            {isClass && (
              <div className="flex flex-col gap-4 pt-2 border-t border-border-subtle" data-testid="inspector-section-classes">
                {/* Inheritance */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                    Inheritance & Bases
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {/* Superclass / Base Classes */}
                    <div className="text-micro font-medium text-text-muted">Base Classes:</div>
                    {classDetail?.base_classes && classDetail.base_classes.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {classDetail.base_classes.map((bc, i) => (
                          <Badge key={i} variant="neutral" size="sm" className="font-mono">
                            {bc}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}

                    {/* Interfaces */}
                    <div className="text-micro font-medium text-text-muted mt-1">Interfaces:</div>
                    {classDetail?.interfaces && classDetail.interfaces.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {classDetail.interfaces.map((iface, i) => (
                          <Badge key={i} variant="neutral" size="sm" className="font-mono">
                            {iface}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}

                    {/* Instantiation Sites */}
                    <div className="text-micro font-medium text-text-muted mt-1">Instantiation Sites:</div>
                    {classDetail?.instantiations && classDetail.instantiations.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {classDetail.instantiations.map((inst) => (
                          <div
                            key={inst.id}
                            className="p-1.5 bg-canvas rounded border border-border-subtle flex items-center justify-between text-micro font-mono"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Badge variant={inst.resolution_status} size="sm">
                                {inst.resolution_status}
                              </Badge>
                              <span className="text-text-primary truncate">
                                {inst.caller_name || "top-level"}
                              </span>
                              <span className="text-text-muted">L{inst.start_line}</span>
                            </div>
                            {onNavigateToSource && inst.caller_file_path && (
                              <button
                                onClick={() =>
                                  onNavigateToSource(
                                    inst.caller_file_path!,
                                    inst.start_line
                                  )
                                }
                                className="text-accent hover:underline flex items-center gap-0.5 text-[10px]"
                                title="Jump to instantiation site"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>Source</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}
                  </div>
                </div>

                {/* Class Members */}
                <div className="flex flex-col gap-2">
                  <div className="text-body font-semibold text-text-primary border-b border-border-subtle pb-1.5">
                    Class Members
                  </div>

                  {/* Constructors */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-medium text-text-muted">Constructors:</span>
                    {classDetail?.constructors && classDetail.constructors.length > 0 ? (
                      classDetail.constructors.map((ctor, i) => (
                        <div key={i} className="p-1.5 bg-canvas rounded border border-border-subtle font-mono text-micro text-text-primary">
                          <code>{ctor.signature}</code>
                          <span className="text-text-muted ml-2">L{ctor.start_line}-{ctor.end_line}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}
                  </div>

                  {/* Methods */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-medium text-text-muted">Methods:</span>
                    {classDetail?.methods && classDetail.methods.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {classDetail.methods.map((method, i) => (
                          <div key={i} className="p-1.5 bg-canvas rounded border border-border-subtle flex items-center justify-between text-micro font-mono">
                            <span className="text-text-primary truncate">{method.name}</span>
                            <div className="flex items-center gap-1">
                              {method.visibility && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-subtle text-text-muted border border-border-subtle">
                                  {method.visibility}
                                </span>
                              )}
                              {method.is_static && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-accent-subtle text-accent border border-accent/25">
                                  static
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}
                  </div>

                  {/* Properties */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-medium text-text-muted">Properties:</span>
                    {classDetail?.properties && classDetail.properties.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {classDetail.properties.map((prop, i) => (
                          <div key={i} className="p-1.5 bg-canvas rounded border border-border-subtle flex items-center justify-between text-micro font-mono">
                            <div className="flex items-center gap-1 truncate">
                              <span className="text-text-primary truncate">{prop.name}</span>
                              {prop.type_annotation && (
                                <span className="text-text-muted truncate">: {prop.type_annotation}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {prop.visibility && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-subtle text-text-muted border border-border-subtle">
                                  {prop.visibility}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-secondary text-body">None detected</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : selectedFile ? (
          /* File Inspector Mode */
          <div className="flex flex-col gap-3" data-testid="file-inspector-section">
            {/* Header: File identity and actions */}
            <div className="flex flex-col gap-1.5 pb-2.5 border-b border-border-subtle">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="font-semibold text-text-primary text-body truncate" title={selectedFile.file_name}>
                    {selectedFile.file_name}
                  </span>
                </div>
                {onNavigateToSource && (
                  <button
                    onClick={() => onNavigateToSource(selectedFile.relative_path, 1)}
                    className="text-caption font-sans text-accent hover:underline flex items-center gap-1 flex-shrink-0"
                    title="Open file in Explorer"
                    data-testid="file-inspector-view-source"
                  >
                    <span>View Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 text-micro font-mono text-text-muted bg-canvas px-2 py-1 rounded border border-border-subtle">
                <span className="truncate" title={selectedFile.relative_path}>
                  {selectedFile.relative_path}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFile.relative_path);
                    setCopiedPath(true);
                    setTimeout(() => setCopiedPath(false), 1500);
                  }}
                  className="p-0.5 rounded hover:bg-hover text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                  title="Copy relative path"
                >
                  {copiedPath ? <Check className="w-3 h-3 text-status-success-text" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-micro">
              <div className="bg-canvas p-1.5 rounded border border-border-subtle flex flex-col items-center">
                <span className="text-text-muted text-[10px] font-sans">Lines</span>
                <span className="text-text-primary font-medium text-caption">
                  {selectedFile.line_count.toLocaleString()}
                </span>
              </div>
              <div className="bg-canvas p-1.5 rounded border border-border-subtle flex flex-col items-center">
                <span className="text-text-muted text-[10px] font-sans">Size</span>
                <span className="text-text-primary font-medium text-caption truncate max-w-full">
                  {formatBytes(selectedFile.size_bytes)}
                </span>
              </div>
              <div className="bg-canvas p-1.5 rounded border border-border-subtle flex flex-col items-center">
                <span className="text-text-muted text-[10px] font-sans">Type</span>
                <span className="text-text-primary font-medium text-caption uppercase truncate max-w-full">
                  {selectedFile.extension || "none"}
                </span>
              </div>
              <div className="bg-canvas p-1.5 rounded border border-border-subtle flex flex-col items-center justify-center">
                <span className="text-text-muted text-[10px] font-sans">Index</span>
                <Badge
                  variant={
                    selectedFile.status === "parsed"
                      ? "confirmed"
                      : selectedFile.status === "error"
                      ? "warning"
                      : "neutral"
                  }
                  size="sm"
                  className="mt-0.5"
                >
                  {selectedFile.status === "parsed"
                    ? "Indexed"
                    : selectedFile.status === "error"
                    ? "Needs Re-scan"
                    : selectedFile.status}
                </Badge>
              </div>
            </div>

            {/* File Parsing / Status Alert - Clean & Actionable (No Raw SQL Shock) */}
            {selectedFile.status === "error" && (
              <div className="p-2.5 rounded border border-status-warning-border bg-status-warning-bg/15 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-status-warning-text flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-caption font-semibold text-text-primary font-sans">
                      Analysis Update Recommended
                    </span>
                    <span className="text-micro text-text-secondary leading-snug">
                      Symbols or dependencies for this file are pending index sync. Re-scanning will index all routes and functions.
                    </span>
                  </div>
                </div>

                {onTriggerScan && (
                  <button
                    type="button"
                    onClick={onTriggerScan}
                    className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface hover:bg-hover border border-border-default text-text-primary text-caption font-medium transition-colors shadow-subtle"
                  >
                    <RefreshCw className="w-3 h-3 text-accent" />
                    <span>Re-scan Project</span>
                  </button>
                )}

                {selectedFile.error_message && (
                  <details className="text-[11px] font-mono text-text-muted cursor-pointer pt-1 border-t border-border-subtle/50">
                    <summary className="hover:text-text-primary select-none">Technical diagnostics</summary>
                    <pre className="mt-1 p-1.5 bg-canvas rounded border border-border-subtle text-status-danger-text overflow-x-auto whitespace-pre-wrap select-text text-[10px]">
                      {selectedFile.error_message}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Architectural Role & Workflow Purpose */}
            {fileIntel && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-accent" />
                    <span>{fileIntel.role}</span>
                  </span>
                  <Badge
                    variant={
                      fileIntel.blast_radius_level === "critical"
                        ? "danger"
                        : fileIntel.blast_radius_level === "warning"
                        ? "warning"
                        : "neutral"
                    }
                    size="sm"
                  >
                    {fileIntel.blast_radius_level === "critical"
                      ? "High Blast Radius"
                      : fileIntel.blast_radius_level === "warning"
                      ? "Medium Impact"
                      : "Leaf Component"}
                  </Badge>
                </div>
                <p className="text-caption text-text-secondary leading-relaxed font-sans">
                  {fileIntel.explanation}
                </p>
              </div>
            )}

            {/* Declared API Endpoints (If API Route / Controller) */}
            {fileIntel?.api_endpoints && fileIntel.api_endpoints.length > 0 && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-accent" />
                    <span>Declared API Endpoints ({fileIntel.api_endpoints.length})</span>
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">
                    {fileIntel.api_endpoints[0].framework}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {fileIntel.api_endpoints.map((ep, idx) => {
                    const method = ep.method.toUpperCase();
                    const methodBadgeClass =
                      method === "GET"
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                        : method === "POST"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : method === "PUT" || method === "PATCH"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : method === "DELETE"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/30";

                    return (
                      <div
                        key={`${ep.method}-${ep.route}-${idx}`}
                        className="p-1.5 bg-surface rounded border border-border-subtle flex items-center justify-between gap-2 font-mono text-micro"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold text-[10px] border ${methodBadgeClass}`}
                          >
                            {method}
                          </span>
                          <span className="font-semibold text-text-primary truncate" title={ep.route}>
                            {ep.route}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Exported Symbols & Handlers */}
            {fileIntel && fileIntel.exported_symbols.length > 0 && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-accent" />
                    <span>Exported Symbols ({fileIntel.exported_symbols.length})</span>
                  </span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1 font-mono text-micro">
                  {fileIntel.exported_symbols.map((sym) => (
                    <div
                      key={`${sym.name}-${sym.line_number}`}
                      className="p-1.5 bg-surface rounded border border-border-subtle flex items-center justify-between gap-1.5 text-text-secondary"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigateToSource?.(selectedFile.relative_path, sym.line_number)}
                        className="hover:underline text-text-primary font-medium truncate text-left"
                        title={`Jump to line ${sym.line_number}`}
                      >
                        {sym.name}
                      </button>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {sym.complexity != null && sym.complexity > 1 && (
                          <span
                            className="px-1 py-0.2 rounded bg-subtle text-text-muted text-[10px] border border-border-subtle"
                            title={`Cyclomatic complexity: ${sym.complexity}`}
                          >
                            CC {sym.complexity}
                          </span>
                        )}
                        <span className="text-text-muted text-[10px] uppercase font-sans">
                          {sym.kind} · L{sym.line_number}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Internal Project Dependencies (What this file imports) */}
            {fileIntel && fileIntel.internal_dependencies.length > 0 && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-2">
                <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-accent" />
                  <span>Imports Project Files ({fileIntel.internal_dependencies.length})</span>
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1 font-mono text-micro">
                  {fileIntel.internal_dependencies.map((dep) => (
                    <button
                      key={dep}
                      type="button"
                      onClick={() => onNavigateToSource?.(dep, 1)}
                      className="w-full text-left p-1 rounded bg-surface hover:bg-hover border border-border-subtle text-accent hover:underline truncate block"
                      title={`Jump to ${dep}`}
                    >
                      {dep}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* External Packages Used */}
            {fileIntel && fileIntel.external_packages_used.length > 0 && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-2">
                <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-accent" />
                  <span>External Packages ({fileIntel.external_packages_used.length})</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {fileIntel.external_packages_used.map((pkg) => (
                    <span
                      key={pkg}
                      className="px-1.5 py-0.5 rounded text-micro font-mono bg-elevated border border-border-subtle text-text-secondary"
                    >
                      {pkg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Blast Radius & Direct Dependents */}
            {fileIntel && (
              <div className="p-2.5 bg-canvas rounded border border-border-default space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-accent" />
                    <span>Blast Radius ({fileIntel.direct_dependants_count} dependents)</span>
                  </span>
                </div>
                <p className="text-micro text-text-muted font-sans leading-snug">
                  {fileIntel.direct_dependants_count > 0
                    ? "If you modify this file, the following files will be affected:"
                    : "Leaf component: no other internal files directly import this file."}
                </p>
                {fileIntel.direct_dependants.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1 font-mono text-micro">
                    {fileIntel.direct_dependants.map((depPath) => (
                      <button
                        key={depPath}
                        type="button"
                        onClick={() => onNavigateToSource?.(depPath, 1)}
                        className="w-full text-left p-1 rounded bg-surface hover:bg-hover border border-border-subtle text-accent hover:underline truncate block"
                        title={`Jump to ${depPath}`}
                      >
                        → {depPath}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Content Hash (BLAKE3) - Clean, Compact Single-line Row */}
            <div className="flex items-center justify-between gap-2 p-1.5 bg-canvas rounded border border-border-subtle text-micro font-mono text-text-muted">
              <div className="flex items-center gap-1.5 min-w-0">
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate" title={selectedFile.content_hash}>
                  BLAKE3: {selectedFile.content_hash ? `${selectedFile.content_hash.slice(0, 12)}...${selectedFile.content_hash.slice(-8)}` : "None"}
                </span>
              </div>
              {selectedFile.content_hash && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFile.content_hash);
                    setCopiedHash(true);
                    setTimeout(() => setCopiedHash(false), 1500);
                  }}
                  className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                  title="Copy full BLAKE3 hash"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-status-success-text" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>

            {/* Provenance Badge */}
            <div className="p-2 bg-accent/5 rounded border border-accent/20 flex items-center gap-2 text-micro text-text-secondary">
              <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span className="font-sans leading-tight">
                Provenance tracked: SQLite stores verified AST line ranges and static evidence.
              </span>
            </div>
          </div>
        ) : (
          /* Empty Inspector */
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted gap-2 py-12" data-testid="inspector-empty-state">
            <Layers className="w-8 h-8 text-text-faint" />
            <p className="text-caption">Select a symbol or file to view properties, callers, callees, and provenance evidence.</p>
          </div>
        )}
      </div>
    </aside>
  );
};

interface RelationshipRowProps {
  call: CallDetailItem;
  isCallee?: boolean;
  onNavigateSymbol: (symbolId: number) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  targetFilePath: string;
}

const RelationshipRow: React.FC<RelationshipRowProps> = ({
  call,
  isCallee = false,
  onNavigateSymbol,
  onNavigateToSource,
  targetFilePath,
}) => {
  const name = isCallee ? call.callee_name : (call.caller_name || "anonymous");
  const symbolId = isCallee ? call.callee_symbol_id : call.caller_symbol_id;
  const filePath = isCallee ? targetFilePath : (call.caller_file_path || targetFilePath);

  return (
    <div
      className="py-1.5 flex items-center justify-between gap-2 border-b border-border-subtle last:border-0 text-caption"
      data-testid="relationship-row"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Badge variant={call.resolution_status} size="sm">
          {call.resolution_status}
        </Badge>

        {symbolId ? (
          <button
            onClick={() => onNavigateSymbol(symbolId)}
            className="text-text-primary hover:text-accent font-medium truncate underline underline-offset-2"
            title={`Inspect symbol ${name}`}
            data-testid="inspect-symbol-link"
          >
            {name}
          </button>
        ) : (
          <span className="text-text-primary truncate" title={name}>
            {name}
          </span>
        )}

        <span className="text-text-muted flex-shrink-0">
          L{call.start_line}
        </span>
      </div>

      {onNavigateToSource && (
        <button
          onClick={() => onNavigateToSource(filePath, call.start_line)}
          className="text-accent hover:underline flex items-center gap-0.5 text-[10px] flex-shrink-0"
          title="Jump to source location"
          data-testid="click-to-source-btn"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          <span>Source</span>
        </button>
      )}
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const DiagramNodeInspector: React.FC<{
  node: import("@/types/diagram").DiagramNode;
  connectedEdges?: import("@/types/diagram").DiagramEdge[];
  onNavigateToSource?: (filePath: string, line: number) => void;
}> = ({ node, connectedEdges, onNavigateToSource }) => {
  return (
    <div className="flex flex-col gap-3 font-mono" data-testid="diagram-node-inspector">
      <div className="flex flex-col gap-1 pb-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-text-primary text-sm truncate" title={node.label}>
            {node.label}
          </span>
          <Badge variant="neutral" size="sm" className="text-[10px]">
            {node.kind}
          </Badge>
        </div>
        <div className="text-[10px] text-text-muted truncate" title={node.id}>
          ID: {node.id}
        </div>
        {node.group_id && (
          <div className="text-[10px] text-text-muted truncate">
            Group: {node.group_id}
          </div>
        )}
      </div>

      {node.source_ref && (
        <div className="flex flex-col gap-1 p-2 bg-canvas rounded border border-border-subtle text-[11px]">
          <span className="text-[10px] text-text-muted font-medium">
            Source Reference
          </span>
          <div className="flex items-center justify-between text-text-secondary">
            <span className="truncate" title={node.source_ref.file_path}>
              {node.source_ref.file_path}:{node.source_ref.start_line}
            </span>
            {onNavigateToSource && (
              <button
                type="button"
                onClick={() => onNavigateToSource(node.source_ref!.file_path, node.source_ref!.start_line)}
                className="text-accent flex items-center gap-1 hover:underline text-[10px] flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in Source Explorer</span>
              </button>
            )}
          </div>
        </div>
      )}

      {node.metrics && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-text-muted font-medium">
            Metrics
          </span>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {node.metrics.line_count !== undefined && (
              <div className="p-1.5 bg-subtle rounded border border-border-subtle">
                <span className="text-text-muted text-[10px] block">Lines</span>
                <span className="text-text-primary font-semibold">{node.metrics.line_count}</span>
              </div>
            )}
            {node.metrics.function_count !== undefined && (
              <div className="p-1.5 bg-subtle rounded border border-border-subtle">
                <span className="text-text-muted text-[10px] block">Functions</span>
                <span className="text-text-primary font-semibold">{node.metrics.function_count}</span>
              </div>
            )}
            {node.metrics.class_count !== undefined && (
              <div className="p-1.5 bg-subtle rounded border border-border-subtle">
                <span className="text-text-muted text-[10px] block">Classes</span>
                <span className="text-text-primary font-semibold">{node.metrics.class_count}</span>
              </div>
            )}
            {node.metrics.complexity !== undefined && (
              <div className="p-1.5 bg-subtle rounded border border-border-subtle">
                <span className="text-text-muted text-[10px] block">Complexity</span>
                <span className="text-text-primary font-semibold">{node.metrics.complexity}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {connectedEdges && connectedEdges.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 border-t border-border-subtle">
          <span className="text-[10px] text-text-muted font-medium">
            Connected Links ({connectedEdges.length})
          </span>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {connectedEdges.map((e) => (
              <div key={e.id} className="p-1.5 bg-subtle rounded border border-border-subtle text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-primary">{e.relationship}</span>
                  <Badge variant={e.confidence === "confirmed" ? "confirmed" : e.confidence === "static" ? "static" : e.confidence === "inferred" ? "inferred" : "unknown"} size="sm">
                    {e.confidence}
                  </Badge>
                </div>
                <div className="text-text-muted truncate mt-0.5" title={`${e.from} -> ${e.to}`}>
                  {e.from === node.id ? `-> ${e.to}` : `<- ${e.from}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const DiagramEdgeInspector: React.FC<{
  edge: import("@/types/diagram").DiagramEdge;
  fromNode?: import("@/types/diagram").DiagramNode;
  toNode?: import("@/types/diagram").DiagramNode;
  onNavigateToSource?: (filePath: string, line: number) => void;
}> = ({ edge, fromNode, toNode, onNavigateToSource }) => {
  let sourceFilePath: string | null = null;
  let sourceLineNumber: number | null = null;

  if (edge.evidence_key) {
    const parts = edge.evidence_key.split(":");
    if (parts.length >= 3) {
      sourceFilePath = parts.slice(0, parts.length - 2).join(":");
      const lineRange = parts[parts.length - 2];
      const startLine = parseInt(lineRange.split("-")[0], 10);
      if (!isNaN(startLine)) {
        sourceLineNumber = startLine;
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 font-mono" data-testid="diagram-edge-inspector">
      <div className="flex flex-col gap-1 pb-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-text-primary text-sm">
            {edge.relationship}
          </span>
          <Badge variant={edge.confidence === "confirmed" ? "confirmed" : edge.confidence === "static" ? "static" : edge.confidence === "inferred" ? "inferred" : "unknown"} size="sm">
            {edge.confidence}
          </Badge>
        </div>
        {edge.label && (
          <div className="text-[11px] text-text-secondary mt-0.5">
            Label: <span className="text-text-primary font-medium">{edge.label}</span>
          </div>
        )}
      </div>

      {/* Endpoints */}
      <div className="flex flex-col gap-1.5 p-2 bg-canvas rounded border border-border-subtle text-[11px]">
        <span className="text-[10px] text-text-muted font-medium">
          Endpoints
        </span>
        <div className="text-text-secondary truncate">
          <span className="text-text-muted">From: </span>
          <span className="text-text-primary font-medium" title={edge.from}>
            {fromNode ? fromNode.label : edge.from}
          </span>
        </div>
        <div className="text-text-secondary truncate">
          <span className="text-text-muted">To: </span>
          <span className="text-text-primary font-medium" title={edge.to}>
            {toNode ? toNode.label : edge.to}
          </span>
        </div>
      </div>

      {/* Provenance Evidence */}
      <div className="flex flex-col gap-2 p-2 bg-subtle rounded border border-border-subtle text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-medium">
            Provenance Evidence
          </span>
          <span className="text-[9px] text-text-muted">ID #{edge.evidence_id}</span>
        </div>

        <div className="text-[10px] break-all bg-canvas p-1.5 rounded border border-border-subtle text-text-muted font-mono" title={edge.evidence_key}>
          Key: {edge.evidence_key}
        </div>

        {sourceFilePath && sourceLineNumber !== null && (
          <div className="flex items-center justify-between pt-1 text-[11px]">
            <span className="truncate text-text-secondary" title={sourceFilePath}>
              {sourceFilePath}:L{sourceLineNumber}
            </span>
            {onNavigateToSource && (
              <button
                type="button"
                onClick={() => onNavigateToSource(sourceFilePath!, sourceLineNumber!)}
                className="text-accent flex items-center gap-1 hover:underline text-[10px] flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Jump to Source</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
