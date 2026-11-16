import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  FileText,
  Hash,
  Layers,
  ShieldCheck,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import type {
  ClassDetailResponse,
  FileRecord,
  SymbolDetail,
  SymbolRecord,
  CallDetailItem,
  SideEffectMarker,
} from "@/types/ipc";
import type { SelectedDiagramElement } from "@/types/diagram";
import { Badge } from "@/components/ui/Badge";
import { getClassDetail, getSymbolDetail } from "@/lib/tauri";

export interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  selectedFile: FileRecord | null;
  selectedSymbol?: SymbolRecord | null;
  selectedDiagramElement?: SelectedDiagramElement | null;
  onClearDiagramElement?: () => void;
  onSelectSymbol?: (symbol: SymbolRecord | null) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  // Optional pre-loaded detail for tests
  initialSymbolDetail?: SymbolDetail | null;
  initialClassDetail?: ClassDetailResponse | null;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  onToggle,
  width,
  selectedFile,
  selectedSymbol,
  selectedDiagramElement,
  onClearDiagramElement,
  onSelectSymbol,
  onNavigateToSource,
  initialSymbolDetail,
  initialClassDetail,
}) => {
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
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  if (!isOpen) {
    return (
      <div className="w-8 bg-surface border-l border-border-default flex flex-col items-center py-2 flex-shrink-0">
        <button
          onClick={onToggle}
          title="Open Inspector Panel"
          className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus-ring"
          data-testid="toggle-inspector-open"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="[writing-mode:vertical-lr] rotate-180 mt-4 text-micro font-mono text-text-muted uppercase tracking-wider select-none">
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
      className="bg-surface border-l border-border-default flex flex-col select-none flex-shrink-0 h-full overflow-hidden"
      data-testid="inspector-panel"
    >
      {/* Header */}
      <div className="h-8 border-b border-border-default px-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleBack}
              title="Go back to previous symbol"
              className="p-0.5 rounded hover:bg-hover text-text-muted hover:text-text-primary flex items-center gap-0.5 text-micro font-mono"
              data-testid="inspector-back-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back ({history.length})</span>
            </button>
          )}
          <span className="text-caption font-semibold text-text-primary uppercase tracking-wider font-mono">
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
                    <Badge variant="neutral" size="sm" className="uppercase font-mono">
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
              <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
                Signature
              </div>
              {activeSymbolRecord.signature ? (
                <pre className="p-2 bg-canvas rounded border border-border-subtle font-mono text-micro overflow-x-auto select-text text-text-primary whitespace-pre-wrap">
                  <code>{activeSymbolRecord.signature}</code>
                </pre>
              ) : (
                <span className="text-text-muted text-caption italic">None detected</span>
              )}
            </div>

            {/* SECTION 2: RELATIONSHIPS (CALLERS & CALLEES) */}
            <div className="flex flex-col gap-3" data-testid="inspector-section-relationships">
              <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono border-b border-border-subtle pb-1">
                Relationships
              </div>

              {/* Callers */}
              <div className="flex flex-col gap-1.5" data-testid="inspector-callers-group">
                <div className="text-micro font-mono text-text-muted uppercase">
                  Incoming Calls (Callers)
                </div>
                {incomingCalls.length === 0 ? (
                  <span className="text-text-muted text-caption italic">None detected</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Confirmed / Static Callers */}
                    {confirmedIncoming.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-mono text-emerald-400 font-medium">
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
                        <div className="text-[10px] font-mono text-amber-400 font-medium">
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
                <div className="text-micro font-mono text-text-muted uppercase">
                  Outgoing Calls (Callees)
                </div>
                {outgoingCalls.length === 0 ? (
                  <span className="text-text-muted text-caption italic">None detected</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Confirmed / Static Callees */}
                    {confirmedOutgoing.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-mono text-emerald-400 font-medium">
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
                        <div className="text-[10px] font-mono text-amber-400 font-medium">
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
              <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
                Metrics
              </div>
              {symbolDetail?.function_metrics ? (
                <div className="grid grid-cols-2 gap-2 text-caption font-mono">
                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="McCabe Cyclomatic Complexity: CC = 1 + ∑ branches + ∑ loops (from DECISIONS.md)"
                  >
                    <span className="text-text-muted text-micro uppercase">Complexity</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.cyclomatic_complexity}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Branch points: if/elif, conditionals/ternaries, switch cases, and boolean operators (&&, ||, ??, and, or)"
                  >
                    <span className="text-text-muted text-micro uppercase">Branches</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.branch_count}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Loop points: for, for-in, for-of, while, do-while"
                  >
                    <span className="text-text-muted text-micro uppercase">Loops</span>
                    <span className="text-text-primary font-medium text-body">
                      {symbolDetail.function_metrics.loop_count}
                    </span>
                  </div>

                  <div
                    className="bg-canvas p-2 rounded border border-border-subtle flex flex-col cursor-help"
                    title="Explicit exception handling constructs: try/catch (TS/JS) or try/except (Python)"
                  >
                    <span className="text-text-muted text-micro uppercase">Error Handling</span>
                    <span className="text-text-primary font-medium text-body truncate">
                      {symbolDetail.function_metrics.has_error_handling
                        ? "Present"
                        : "None detected"}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-text-muted text-caption italic">None detected</span>
              )}
            </div>

            {/* SECTION 4: SIDE EFFECTS */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-side-effects">
              <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
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
                        <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 font-semibold uppercase text-[9px]">
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
                <span className="text-text-muted text-caption italic">None detected</span>
              )}
            </div>

            {/* SECTION 5: EVIDENCE */}
            <div className="flex flex-col gap-1.5" data-testid="inspector-section-evidence">
              <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
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
                    <span className="text-text-muted text-[10px] uppercase">Snippet:</span>
                    <pre className="p-2 bg-surface rounded border border-border-subtle font-mono text-micro overflow-x-auto text-text-muted max-h-36 select-text whitespace-pre-wrap">
                      <code>{symbolDetail.snippet}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="text-text-muted text-[10px] uppercase block">Snippet:</span>
                    <span className="text-text-muted text-caption italic">None detected</span>
                  </div>
                )}
              </div>
            </div>

            {/* CLASS SECTIONS: MEMBERS & INHERITANCE */}
            {isClass && (
              <div className="flex flex-col gap-4 pt-2 border-t border-border-subtle" data-testid="inspector-section-classes">
                {/* Inheritance */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
                    Inheritance & Bases
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {/* Superclass / Base Classes */}
                    <div className="text-micro font-mono text-text-muted">Base Classes:</div>
                    {classDetail?.base_classes && classDetail.base_classes.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {classDetail.base_classes.map((bc, i) => (
                          <Badge key={i} variant="neutral" size="sm" className="font-mono">
                            {bc}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}

                    {/* Interfaces */}
                    <div className="text-micro font-mono text-text-muted mt-1">Interfaces:</div>
                    {classDetail?.interfaces && classDetail.interfaces.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {classDetail.interfaces.map((iface, i) => (
                          <Badge key={i} variant="neutral" size="sm" className="font-mono">
                            {iface}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}

                    {/* Instantiation Sites */}
                    <div className="text-micro font-mono text-text-muted mt-1">Instantiation Sites:</div>
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
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}
                  </div>
                </div>

                {/* Class Members */}
                <div className="flex flex-col gap-2">
                  <div className="text-micro font-semibold text-text-secondary uppercase tracking-wider font-mono">
                    Class Members
                  </div>

                  {/* Constructors */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-mono text-text-muted">Constructors:</span>
                    {classDetail?.constructors && classDetail.constructors.length > 0 ? (
                      classDetail.constructors.map((ctor, i) => (
                        <div key={i} className="p-1.5 bg-canvas rounded border border-border-subtle font-mono text-micro text-text-primary">
                          <code>{ctor.signature}</code>
                          <span className="text-text-muted ml-2">L{ctor.start_line}-{ctor.end_line}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}
                  </div>

                  {/* Methods */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-mono text-text-muted">Methods:</span>
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
                                <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25">
                                  static
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}
                  </div>

                  {/* Properties */}
                  <div className="flex flex-col gap-1">
                    <span className="text-micro font-mono text-text-muted">Properties:</span>
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
                      <span className="text-text-muted text-caption italic">None detected</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : selectedFile ? (
          /* File Inspector Mode */
          <div className="flex flex-col gap-4" data-testid="file-inspector-section">
            <div className="flex items-start gap-2.5 pb-3 border-b border-border-subtle">
              <FileText className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-text-primary text-body truncate">
                  {selectedFile.file_name}
                </span>
                <span className="text-caption font-mono text-text-muted break-all">
                  {selectedFile.relative_path}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-caption font-mono">
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Lines</span>
                <span className="text-text-primary font-medium text-body">
                  {selectedFile.line_count.toLocaleString()}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Size</span>
                <span className="text-text-primary font-medium text-body">
                  {formatBytes(selectedFile.size_bytes)}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Extension</span>
                <span className="text-text-primary font-medium text-body">
                  {selectedFile.extension ? `.${selectedFile.extension}` : "none"}
                </span>
              </div>
              <div className="bg-canvas p-2 rounded border border-border-subtle flex flex-col">
                <span className="text-text-muted text-micro uppercase">Status</span>
                <Badge
                  variant={
                    selectedFile.status === "parsed"
                      ? "confirmed"
                      : selectedFile.status === "error"
                      ? "unknown"
                      : "neutral"
                  }
                  size="sm"
                >
                  {selectedFile.status}
                </Badge>
              </div>
            </div>

            {selectedFile.status === "error" && selectedFile.error_message && (
              <div className="flex flex-col gap-1">
                <span className="text-status-error text-micro uppercase font-mono font-medium">
                  Error Details
                </span>
                <div className="p-2 bg-status-error/10 border border-status-error/20 rounded font-mono text-micro text-status-error break-all select-text">
                  {selectedFile.error_message}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-text-muted text-micro uppercase font-mono">
                <Hash className="w-3 h-3" />
                <span>Content Hash (BLAKE3)</span>
              </div>
              <div className="p-1.5 bg-canvas rounded border border-border-subtle font-mono text-micro text-text-muted break-all select-text">
                {selectedFile.content_hash || "Not hashed"}
              </div>
            </div>

            <div className="p-2.5 bg-accent/5 rounded border border-accent/20 flex flex-col gap-1 text-micro text-text-secondary">
              <div className="flex items-center gap-1 text-accent font-medium font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Provenance Tracked</span>
              </div>
              <p>
                Static structural analysis records exact line spans and source evidence in SQLite.
              </p>
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
      className="p-1.5 bg-canvas rounded border border-border-subtle flex items-center justify-between text-micro font-mono gap-1"
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
          <Badge variant="neutral" size="sm" className="uppercase text-[10px]">
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
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
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
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
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
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
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
          <span className="font-semibold text-text-primary text-sm uppercase">
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
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
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
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
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
