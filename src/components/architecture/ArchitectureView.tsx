import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  FolderOpen,
} from "lucide-react";

import type {
  DiagramModel,
  DiagramGroup,
  DiagramType,
  PositionedModel,
  RelationshipType,
  DiagramConfidence,
  SelectedDiagramElement,
} from "../../types/diagram";
import type { LayoutDirection } from "../../diagram/layout/types";
import type { ExportFormat } from "../../types/export";
import { LayoutWorkerClient } from "../../diagram/layout";
import { getDiagram, drillDown } from "../../lib/tauri";

import { DiagramNodeComponent, type DiagramNodeData } from "./nodes/DiagramNodeComponent";
import { GroupNodeComponent, type GroupNodeData } from "./nodes/GroupNodeComponent";
import { OrthogonalEdge, type OrthogonalEdgeData } from "./edges/OrthogonalEdge";
import { DiagramToolbar } from "./controls/DiagramToolbar";
import { DiagramFilterPanel, type DiagramFilterState } from "./controls/DiagramFilterPanel";
import { DiagramLegend, SvgMarkerDefs } from "./controls/DiagramLegend";

export interface ArchitectureViewProps {
  projectId?: number;
  projectRootPath?: string | null;
  onNavigateToSource?: (filePath: string, line: number) => void;
  onSelectDiagramElement?: (element: SelectedDiagramElement | null) => void;
  // Optional pre-positioned model for tests
  initialPositionedModel?: PositionedModel | null;
  theme?: "dark" | "light";
}

const nodeTypes = {
  diagramNode: DiagramNodeComponent,
  groupNode: GroupNodeComponent,
};

const edgeTypes = {
  orthogonal: OrthogonalEdge,
};

const DEFAULT_FILTERS: DiagramFilterState = {
  relationshipTypes: new Set<RelationshipType>([
    "import",
    "call",
    "inheritance",
    "instantiation",
    "declared_dependency",
    "entry",
  ]),
  confidences: new Set<DiagramConfidence>([
    "confirmed",
    "static",
    "inferred",
    "unknown",
  ]),
  isolatedGroupId: null,
};

const ArchitectureFlowInner: React.FC<ArchitectureViewProps> = ({
  projectId,
  projectRootPath,
  onNavigateToSource,
  onSelectDiagramElement,
  initialPositionedModel,
  theme = "dark",
}) => {
  const reactFlow = useReactFlow();
  const workerClientRef = useRef<LayoutWorkerClient | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // View state
  const [diagramType, setDiagramType] = useState<DiagramType>("module_dependency");
  const [direction, setDirection] = useState<LayoutDirection>("DOWN");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDrillGroupId, setActiveDrillGroupId] = useState<string | null>(null);

  // Progressive disclosure & models
  const [rawModel, setRawModel] = useState<DiagramModel | null>(null);
  const [activeModel, setActiveModel] = useState<DiagramModel | null>(null);
  const [positionedModel, setPositionedModel] = useState<PositionedModel | null>(
    initialPositionedModel || null
  );
  const [isCollapsedOverview, setIsCollapsedOverview] = useState(false);
  const [totalRawNodeCount, setTotalRawNodeCount] = useState<number>(0);

  // Layout worker state
  const [isLoading, setIsLoading] = useState(false);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelActiveLayoutRef = useRef<(() => void) | null>(null);

  // Filters & Panels
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filters, setFilters] = useState<DiagramFilterState>(DEFAULT_FILTERS);

  // Selection & dependency highlighting
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Initialize Worker Client
  useEffect(() => {
    workerClientRef.current = new LayoutWorkerClient();
    return () => {
      if (cancelActiveLayoutRef.current) {
        cancelActiveLayoutRef.current();
      }
    };
  }, []);

  // Fetch diagram model from DB
  const fetchDiagram = useCallback(
    async (dtype: DiagramType, pId?: number) => {
      if (!pId) return;
      setIsLoading(true);
      setError(null);
      setActiveDrillGroupId(null);

      try {
        const response = await getDiagram(dtype, pId, {
          enable_progressive_disclosure: true,
        });

        setRawModel(response.model);

        if (response.collapsed_overview) {
          setIsCollapsedOverview(true);
          setTotalRawNodeCount(response.collapsed_overview.total_node_count);
          setActiveModel(response.collapsed_overview.model);
        } else {
          setIsCollapsedOverview(false);
          setTotalRawNodeCount(response.model.nodes.length);
          setActiveModel(response.model);
        }
      } catch (err) {
        console.error("Failed to fetch diagram", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Trigger fetch when projectId or diagramType changes
  useEffect(() => {
    if (initialPositionedModel) {
      setPositionedModel(initialPositionedModel);
      return;
    }
    if (projectId) {
      fetchDiagram(diagramType, projectId);
    }
  }, [projectId, diagramType, fetchDiagram, initialPositionedModel]);

  // Execute Layout in Web Worker whenever activeModel or direction changes
  useEffect(() => {
    if (!activeModel || initialPositionedModel) return;

    if (cancelActiveLayoutRef.current) {
      cancelActiveLayoutRef.current();
      cancelActiveLayoutRef.current = null;
    }

    if (!workerClientRef.current) {
      workerClientRef.current = new LayoutWorkerClient();
    }

    setIsLayoutRunning(true);
    const calculation = workerClientRef.current.calculate(activeModel, {
      direction,
      preset: "layered",
    });

    cancelActiveLayoutRef.current = calculation.cancel;

    calculation.promise
      .then((positioned) => {
        setPositionedModel(positioned);
        setIsLayoutRunning(false);
        cancelActiveLayoutRef.current = null;
        setTimeout(() => {
          reactFlow.fitView({ padding: 0.15, duration: 600 });
        }, 50);
      })
      .catch((err) => {
        if (err?.message !== "Layout calculation was cancelled") {
          console.error("Worker layout calculation error", err);
          setError(`Layout computation failed: ${err?.message || err}`);
        }
        setIsLayoutRunning(false);
      });

    return () => {
      if (cancelActiveLayoutRef.current) {
        cancelActiveLayoutRef.current();
      }
    };
  }, [activeModel, direction, initialPositionedModel, reactFlow]);

  // Handle drill down into a collapsed group
  const handleDrillDown = useCallback(
    async (groupId: string) => {
      if (!projectId) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await drillDown(groupId, projectId, diagramType);
        setActiveDrillGroupId(groupId);

        const groupObj: DiagramGroup = {
          id: groupId,
          label: groupId.replace(/^group:(dir:)?/, ""),
          collapsed: false,
        };

        const drillModel: DiagramModel = {
          diagram_type: diagramType,
          nodes: result.nodes,
          edges: result.edges,
          groups: [groupObj],
        };

        setActiveModel(drillModel);
      } catch (err) {
        console.error("Failed to drill down into group", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, diagramType]
  );

  // Return from drill-down back to collapsed overview
  const handleReturnToOverview = useCallback(() => {
    if (rawModel && projectId) {
      fetchDiagram(diagramType, projectId);
    }
  }, [rawModel, projectId, diagramType, fetchDiagram]);

  // Compute upstream & downstream dependencies for selected node
  const { upstreamNodeIds, downstreamNodeIds, connectedEdgeIds } = useMemo(() => {
    if (!selectedNodeId || !positionedModel) {
      return {
        upstreamNodeIds: new Set<string>(),
        downstreamNodeIds: new Set<string>(),
        connectedEdgeIds: new Set<string>(),
      };
    }

    const upstream = new Set<string>();
    const downstream = new Set<string>();
    const connected = new Set<string>();

    for (const edge of positionedModel.edges) {
      if (edge.to === selectedNodeId) {
        upstream.add(edge.from);
        connected.add(edge.id);
      }
      if (edge.from === selectedNodeId) {
        downstream.add(edge.to);
        connected.add(edge.id);
      }
    }

    return {
      upstreamNodeIds: upstream,
      downstreamNodeIds: downstream,
      connectedEdgeIds: connected,
    };
  }, [selectedNodeId, positionedModel]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim() || !positionedModel) return [];
    const q = searchQuery.toLowerCase();
    return positionedModel.nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        (n.source_ref && n.source_ref.file_path.toLowerCase().includes(q))
    );
  }, [searchQuery, positionedModel]);

  // Focus and zoom to matching node
  const handleSearchFocusNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    const target = searchMatches[0];
    setSelectedNodeId(target.id);
    reactFlow.setCenter(target.x + target.width / 2, target.y + target.height / 2, {
      zoom: 1.3,
      duration: 800,
    });
  }, [searchMatches, reactFlow]);

  // React Flow Nodes conversion with filtering
  const flowNodes: Node[] = useMemo(() => {
    if (!positionedModel) return [];

    const nodes: Node[] = [];

    // 1. Group nodes (rendered behind)
    for (const group of positionedModel.groups) {
      // If module is isolated and not matching, hide
      if (filters.isolatedGroupId && filters.isolatedGroupId !== group.id) {
        continue;
      }

      nodes.push({
        id: group.id,
        type: "groupNode",
        position: { x: group.x, y: group.y },
        data: {
          ...group,
          width: group.width,
          height: group.height,
          onToggleCollapse: () => {
            if (isCollapsedOverview) {
              handleDrillDown(group.id);
            }
          },
        } as GroupNodeData,
        style: {
          width: group.width,
          height: group.height,
          zIndex: 0,
        },
      });
    }

    // 2. Leaf/domain nodes
    for (const node of positionedModel.nodes) {
      // If module is isolated and not in this group, hide
      if (filters.isolatedGroupId && node.group_id !== filters.isolatedGroupId) {
        continue;
      }

      const isUp = upstreamNodeIds.has(node.id);
      const isDown = downstreamNodeIds.has(node.id);
      const isSearchMatch = searchMatches.some((m) => m.id === node.id);

      nodes.push({
        id: node.id,
        type: "diagramNode",
        position: { x: node.x, y: node.y },
        selected: selectedNodeId === node.id,
        data: {
          ...node,
          isHighlighted: isUp || isDown || isSearchMatch,
          isUpstream: isUp,
          isDownstream: isDown,
          onOpenSource: onNavigateToSource,
        } as DiagramNodeData,
        style: {
          zIndex: 1,
        },
      });
    }

    return nodes;
  }, [
    positionedModel,
    filters.isolatedGroupId,
    upstreamNodeIds,
    downstreamNodeIds,
    searchMatches,
    selectedNodeId,
    onNavigateToSource,
    isCollapsedOverview,
    handleDrillDown,
  ]);

  // React Flow Edges conversion with filtering
  const flowEdges: Edge[] = useMemo(() => {
    if (!positionedModel) return [];

    const edges: Edge[] = [];
    const visibleNodeIds = new Set(flowNodes.map((n) => n.id));

    for (const edge of positionedModel.edges) {
      // 1. Filter by relationship type
      if (!filters.relationshipTypes.has(edge.relationship)) {
        continue;
      }
      // 2. Filter by confidence
      if (!filters.confidences.has(edge.confidence)) {
        continue;
      }
      // 3. Ensure endpoints are visible
      if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) {
        continue;
      }

      const isConnected = connectedEdgeIds.has(edge.id);

      edges.push({
        id: edge.id,
        type: "orthogonal",
        source: edge.from,
        target: edge.to,
        selected: selectedEdgeId === edge.id,
        data: {
          ...edge,
          points: edge.points,
          isHighlighted: isConnected,
          isUpstream: selectedNodeId ? edge.to === selectedNodeId : false,
          isDownstream: selectedNodeId ? edge.from === selectedNodeId : false,
        } as OrthogonalEdgeData,
      });
    }

    return edges;
  }, [
    positionedModel,
    flowNodes,
    filters.relationshipTypes,
    filters.confidences,
    connectedEdgeIds,
    selectedEdgeId,
    selectedNodeId,
  ]);

  // Node Click: inspector & navigation
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);

      const rawNode = positionedModel?.nodes.find((n) => n.id === node.id);
      if (rawNode) {
        const connected = positionedModel?.edges.filter(
          (e) => e.from === node.id || e.to === node.id
        );

        if (onSelectDiagramElement) {
          onSelectDiagramElement({
            type: "node",
            node: rawNode,
            connectedEdges: connected,
          });
        }

        // Open in source explorer if source_ref is available
        if (rawNode.source_ref && onNavigateToSource) {
          onNavigateToSource(rawNode.source_ref.file_path, rawNode.source_ref.start_line);
        }
      }
    },
    [positionedModel, onSelectDiagramElement, onNavigateToSource]
  );

  // Edge Click: inspector selection
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);

      const rawEdge = positionedModel?.edges.find((e) => e.id === edge.id);
      if (rawEdge) {
        const fromNode = positionedModel?.nodes.find((n) => n.id === rawEdge.from);
        const toNode = positionedModel?.nodes.find((n) => n.id === rawEdge.to);

        if (onSelectDiagramElement) {
          onSelectDiagramElement({
            type: "edge",
            edge: rawEdge,
            fromNode,
            toNode,
          });
        }
      }
    },
    [positionedModel, onSelectDiagramElement]
  );

  // Export handler with dynamic import() for export libraries
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const filenameBase = `${diagramType}_${new Date().toISOString().slice(0, 10)}`;

      if (format === "mermaid") {
        if (!activeModel) return;
        const { exportToMermaid } = await import("../../diagram/export/mermaid");
        const { downloadFile } = await import("../../diagram/export/image");
        const mermaidText = exportToMermaid(activeModel, {
          direction: direction === "DOWN" ? "TD" : "LR",
        });
        downloadFile(mermaidText, `${filenameBase}.mmd`, "text/plain");
        return;
      }

      const canvasContainer = canvasContainerRef.current;
      if (!canvasContainer) return;

      try {
        if (format === "svg") {
          const { serializeToSvg, downloadFile } = await import("../../diagram/export/image");
          const svgContent = serializeToSvg(canvasContainer, {
            theme,
            projectRootPath,
          });
          downloadFile(svgContent, `${filenameBase}.svg`, "image/svg+xml");
        } else if (format === "png") {
          const { serializeToPng, downloadFile } = await import("../../diagram/export/image");
          const pngUrl = await serializeToPng(canvasContainer, {
            scale: 2, // 2x high resolution
            theme,
            projectRootPath,
          });
          downloadFile(pngUrl, `${filenameBase}.png`, "image/png");
        } else if (format === "pdf") {
          throw new Error("PDF export is stubbed: vector PDF generation library is not yet integrated. Please export as SVG or PNG.");
        }
      } catch (err) {
        console.error("Export error", err);
        alert(err instanceof Error ? err.message : String(err));
      }
    },
    [activeModel, direction, diagramType, theme, projectRootPath]
  );

  // Active filter count
  const filterActiveCount = useMemo(() => {
    let count = 0;
    if (filters.relationshipTypes.size < 6) count += 6 - filters.relationshipTypes.size;
    if (filters.confidences.size < 4) count += 4 - filters.confidences.size;
    if (filters.isolatedGroupId) count += 1;
    return count;
  }, [filters]);

  return (
    <div
      ref={canvasContainerRef}
      className="flex-1 flex flex-col h-full w-full bg-canvas overflow-hidden relative"
      data-testid="architecture-screen"
    >
      {/* SVG Marker Definitions for Orthogonal Arrowheads */}
      <SvgMarkerDefs />

      {/* Toolbar */}
      <DiagramToolbar
        diagramType={diagramType}
        onSelectDiagramType={setDiagramType}
        direction={direction}
        onToggleDirection={() => setDirection((d) => (d === "DOWN" ? "RIGHT" : "DOWN"))}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchFocusNext}
        searchMatchCount={searchMatches.length}
        filterActiveCount={filterActiveCount}
        onToggleFilterPanel={() => setIsFilterPanelOpen((v) => !v)}
        onZoomIn={() => reactFlow.zoomIn()}
        onZoomOut={() => reactFlow.zoomOut()}
        onFitView={() => reactFlow.fitView({ padding: 0.15, duration: 400 })}
        onExport={handleExport}
        isLayoutRunning={isLayoutRunning}
        onCancelLayout={() => {
          if (cancelActiveLayoutRef.current) {
            cancelActiveLayoutRef.current();
            cancelActiveLayoutRef.current = null;
          }
          setIsLayoutRunning(false);
        }}
      />

      {/* Progressive Disclosure Notification Banner */}
      {isCollapsedOverview && !activeDrillGroupId && (
        <div
          data-testid="progressive-disclosure-banner"
          className="bg-accent-subtle/80 border-b border-accent-default/30 px-3 py-1.5 flex items-center justify-between text-xs font-mono text-accent-text z-10"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
            <span>
              Graph exceeds 150 nodes ({totalRawNodeCount} files). Showing module-level overview with
              collapsed groups. Click any module group to drill down.
            </span>
          </div>
        </div>
      )}

      {/* Drill-down Breadcrumb Banner */}
      {activeDrillGroupId && (
        <div
          data-testid="drilldown-banner"
          className="bg-surface border-b border-border-default px-3 py-1 flex items-center justify-between text-xs font-mono z-10"
        >
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleReturnToOverview}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-subtle hover:bg-hover text-text-primary border border-border-default focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Overview</span>
            </button>
            <span className="text-text-muted">/</span>
            <span className="text-text-primary font-semibold truncate">
              {activeDrillGroupId.replace(/^group:(dir:)?/, "")}
            </span>
          </div>
        </div>
      )}

      {/* Filter Panel Popup */}
      <DiagramFilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        filters={filters}
        groups={positionedModel?.groups || []}
        onToggleRelationship={(rel) => {
          setFilters((prev) => {
            const next = new Set(prev.relationshipTypes);
            if (next.has(rel)) next.delete(rel);
            else next.add(rel);
            return { ...prev, relationshipTypes: next };
          });
        }}
        onToggleConfidence={(conf) => {
          setFilters((prev) => {
            const next = new Set(prev.confidences);
            if (next.has(conf)) next.delete(conf);
            else next.add(conf);
            return { ...prev, confidences: next };
          });
        }}
        onSetIsolatedGroup={(groupId) => {
          setFilters((prev) => ({ ...prev, isolatedGroupId: groupId }));
        }}
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Loading & Error States */}
      {isLoading && (
        <div className="absolute inset-0 bg-canvas/60 backdrop-blur-xs flex items-center justify-center z-20 font-mono text-xs text-text-primary">
          <div className="flex items-center space-x-2 bg-surface p-3 rounded border border-border-default shadow">
            <Loader2 className="w-4 h-4 animate-spin text-accent-default" />
            <span>Loading architecture graph...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 max-w-md w-full p-3 rounded bg-surface border border-error text-error text-xs font-mono shadow-lg flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Graph Error</div>
            <div className="text-text-muted text-[11px] mt-0.5">{error}</div>
          </div>
          <button
            type="button"
            onClick={() => fetchDiagram(diagramType, projectId)}
            className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary"
            title="Retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Empty State when no project is loaded */}
      {!projectId && !initialPositionedModel && (
        <div className="flex-1 flex flex-col items-center justify-center font-mono text-xs text-text-muted space-y-2 p-4">
          <FolderOpen className="w-8 h-8 text-text-faint" />
          <span>No project opened. Select or open a repository to explore its architecture.</span>
        </div>
      )}

      {/* React Flow Canvas */}
      {(projectId || initialPositionedModel) && (
        <div className="flex-1 w-full h-full relative" data-testid="react-flow-wrapper">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            minZoom={0.1}
            maxZoom={2.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
            className="bg-canvas"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border-subtle, #21262D)" gap={20} size={1} />
            <MiniMap
              nodeColor={() => "var(--border-strong, #6E7681)"}
              maskColor="rgba(0, 0, 0, 0.4)"
              className="!bg-surface !border !border-border-default !rounded"
              zoomable
              pannable
            />
            <Controls className="!bg-surface !border !border-border-default !rounded shadow-none" />
            <DiagramLegend />
          </ReactFlow>
        </div>
      )}
    </div>
  );
};

export const ArchitectureView: React.FC<ArchitectureViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <ArchitectureFlowInner {...props} />
    </ReactFlowProvider>
  );
};
