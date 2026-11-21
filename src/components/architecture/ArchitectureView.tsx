import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  useViewport,
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
  Play,
  Database,
  GitFork,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

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

import {
  DiagramNodeComponent,
  type DiagramNodeData,
} from "./nodes/DiagramNodeComponent";
import { GroupNodeComponent, type GroupNodeData } from "./nodes/GroupNodeComponent";
import { ErEntityNodeComponent } from "./nodes/ErEntityNodeComponent";
import { CallNodeComponent } from "./nodes/CallNodeComponent";
import { UmlClassNodeComponent } from "./nodes/UmlClassNodeComponent";
import { FileGraphNodeComponent } from "./nodes/FileGraphNodeComponent";
import { OrthogonalEdge, type OrthogonalEdgeData } from "./edges/OrthogonalEdge";
import { DiagramToolbar } from "./controls/DiagramToolbar";
import { DiagramFilterPanel, type DiagramFilterState } from "./controls/DiagramFilterPanel";
import { DiagramLegend, SvgMarkerDefs } from "./controls/DiagramLegend";
import { DiagramControls } from "./controls/DiagramControls";
import { SystemFlowView } from "./SystemFlowView";
import { ExcalidrawCanvas } from "./ExcalidrawCanvas";
import {
  classifyNodeLayer,
  classifyGroupLayer,
  computeNodeDegree,
  isIgnoredModuleOrDirectory,
  LAYER_STYLES,
  type ArchitectureLayer,
} from "./utils/layers";

export interface ArchitectureViewProps {
  projectId?: number;
  projectRootPath?: string | null;
  defaultDiagramType?: DiagramType;
  onNavigateToSource?: (filePath: string, line: number) => void;
  onSelectDiagramElement?: (element: SelectedDiagramElement | null) => void;
  onRunPipeline?: () => void;
  onTriggerScan?: () => void;
  /** When set, the diagram re-fetches whenever this value changes (e.g. after pipeline completes). */
  lastAnalysisRunId?: number;
  // Optional pre-positioned model for tests
  initialPositionedModel?: PositionedModel | null;
  theme?: "dark" | "light";
}

const nodeTypes = {
  diagramNode: DiagramNodeComponent,
  groupNode: GroupNodeComponent,
  erEntityNode: ErEntityNodeComponent,
  callNode: CallNodeComponent,
  umlClassNode: UmlClassNodeComponent,
  fileGraphNode: FileGraphNodeComponent,
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
    "entry",
  ]),
  confidences: new Set<DiagramConfidence>([
    "confirmed",
    "static",
    "inferred",
    "unknown",
  ]),
  isolatedGroupId: null,
  layers: new Set<ArchitectureLayer>([
    "frontend",
    "shared",
    "backend",
    "data",
    "config",
    "external",
    "unclassified",
  ]),
};

const ArchitectureFlowInner: React.FC<ArchitectureViewProps> = ({
  projectId,
  projectRootPath,
  defaultDiagramType,
  onNavigateToSource,
  onSelectDiagramElement,
  onRunPipeline,
  onTriggerScan,
  lastAnalysisRunId,
  initialPositionedModel,
  theme = "dark",
}) => {
  const reactFlow = useReactFlow();
  const workerClientRef = useRef<LayoutWorkerClient | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // View state: default to defaultDiagramType prop or fallback to architecture_overview
  const [diagramType, setDiagramType] = useState<DiagramType>(
    () => initialPositionedModel?.diagram_type || defaultDiagramType || "architecture_overview"
  );
  const [direction, setDirection] = useState<LayoutDirection>("DOWN");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDrillGroupId, setActiveDrillGroupId] = useState<string | null>(null);

  // Progressive disclosure & models
  const [rawModel, setRawModel] = useState<DiagramModel | null>(null);
  const [activeModel, setActiveModel] = useState<DiagramModel | null>(() => {
    if (initialPositionedModel) {
      return {
        diagram_type: initialPositionedModel.diagram_type,
        nodes: initialPositionedModel.nodes,
        edges: initialPositionedModel.edges,
        groups: initialPositionedModel.groups,
      };
    }
    return null;
  });
  const [positionedModel, setPositionedModel] = useState<PositionedModel | null>(
    initialPositionedModel || null
  );
  const isInitialMount = useRef(Boolean(initialPositionedModel));
  const [isCollapsedOverview, setIsCollapsedOverview] = useState(false);
  const [fileViewMode, setFileViewMode] = useState<"graph" | "tree">("graph");
  const [totalRawNodeCount, setTotalRawNodeCount] = useState<number>(0);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  const [isMinimapVisible, setIsMinimapVisible] = useState(true);
  const [canvasMode, setCanvasMode] = useState<"graph" | "whiteboard">("graph");

  // Viewport & zoom state
  const { zoom } = useViewport();
  const zoomPercent = Math.round(zoom * 100);

  // Layout worker state
  const [isLoading, setIsLoading] = useState(false);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelActiveLayoutRef = useRef<(() => void) | null>(null);

  // Filters & Panels
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [filters, setFilters] = useState<DiagramFilterState>(DEFAULT_FILTERS);

  // Selection & dependency highlighting
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Camera overflow state
  const [showFitAllPrompt, setShowFitAllPrompt] = useState(false);

  const handleRunPipeline = useCallback(() => {
    if (onRunPipeline) {
      onRunPipeline();
    } else if (onTriggerScan) {
      onTriggerScan();
    } else if (projectId) {
      fetchDiagram(diagramType, projectId);
    }
  }, [onRunPipeline, onTriggerScan, projectId, diagramType]);

  // Initialize Worker Client
  useEffect(() => {
    workerClientRef.current = new LayoutWorkerClient();
    return () => {
      if (cancelActiveLayoutRef.current) {
        cancelActiveLayoutRef.current();
      }
    };
  }, []);

  // Keyboard zoom navigation shortcuts: Ctrl/Cmd + / - / 0
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        reactFlow.zoomIn({ duration: 250 });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        reactFlow.zoomOut({ duration: 250 });
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        reactFlow.zoomTo(1.0, { duration: 300 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reactFlow]);

  // Filter out dot-folders, node_modules, and build outputs from models
  const sanitizeModel = useCallback((model: DiagramModel): DiagramModel => {
    const validNodes = model.nodes.filter((node) => {
      if (isIgnoredModuleOrDirectory(node.id) || isIgnoredModuleOrDirectory(node.label)) {
        return false;
      }
      return true;
    });

    let validNodeIds = new Set(validNodes.map((n) => n.id));

    // Normalize module:root <-> module:. aliases between edges and nodes
    let hasDotModule = validNodeIds.has("module:.");
    let hasRootModule = validNodeIds.has("module:root");

    // If edges originate from root/dot module but the node was omitted from modules table, synthesize it
    const hasRootEdge = model.edges.some((e) => e.from === "module:root" || e.from === "module:.");
    if (hasRootEdge && !hasDotModule && !hasRootModule) {
      validNodes.push({
        id: "module:root",
        kind: "module",
        label: "Project Root",
        width: 200,
        height: 50,
      });
      validNodeIds.add("module:root");
      hasRootModule = true;
    }

    const normalizedEdges = model.edges.map((e) => {
      let from = e.from;
      let to = e.to;
      if (from === "module:root" && hasDotModule && !hasRootModule) from = "module:.";
      if (from === "module:." && hasRootModule && !hasDotModule) from = "module:root";
      if (to === "module:root" && hasDotModule && !hasRootModule) to = "module:.";
      if (to === "module:." && hasRootModule && !hasDotModule) to = "module:root";
      return { ...e, from, to };
    });

    const validEdges = normalizedEdges.filter((edge) => {
      return validNodeIds.has(edge.from) && validNodeIds.has(edge.to);
    });

    const validGroups = model.groups.filter((group) => {
      return !isIgnoredModuleOrDirectory(group.id) && !isIgnoredModuleOrDirectory(group.label);
    });

    // In architecture overview, limit external packages so 45 npm packages don't stretch into a 12,000px horizontal strip.
    // Keep external packages that have direct calls/imports or top frameworks; hide dev/type packages when there are many.
    const isDevOrTypePkg = (pkgId: string) => {
      const lower = pkgId.toLowerCase();
      return (
        lower.includes("@types/") ||
        lower.includes("eslint") ||
        lower.includes("prettier") ||
        lower.includes("toploader") ||
        lower.includes("bundle-analyzer") ||
        lower.includes("postcss") ||
        lower.includes("autoprefixer")
      );
    };

    const connectedNodeIds = new Set<string>();
    validEdges.forEach((e) => {
      connectedNodeIds.add(e.from);
      connectedNodeIds.add(e.to);
    });

    const isBinaryOrAsset = (filePath: string) => {
      const lower = filePath.toLowerCase();
      return (
        lower.endsWith(".webp") ||
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".ico") ||
        lower.endsWith(".svg") ||
        lower.endsWith(".woff") ||
        lower.endsWith(".woff2") ||
        lower.endsWith(".ttf") ||
        lower.endsWith(".eot")
      );
    };

    const cleanNodes = validNodes.filter((node) => {
      if (node.kind === "file") {
        const path = node.source_ref?.file_path || node.id.replace(/^file:/, "");
        if (isBinaryOrAsset(path)) return false;
      }
      if (node.kind === "external") {
        if (!connectedNodeIds.has(node.id)) return false;
        if (validNodes.length > 15 && isDevOrTypePkg(node.id)) return false;
      }
      return true;
    });

    // Ensure unparented root files are placed inside a Project Root group container
    const hasUngroupedFiles = cleanNodes.some((n) => n.kind === "file" && !n.group_id);
    const updatedGroups = [...validGroups];
    if (hasUngroupedFiles && !updatedGroups.some((g) => g.id === "group:dir:root")) {
      updatedGroups.push({
        id: "group:dir:root",
        label: "Project Root",
        collapsed: false,
      });
    }

    const assignedNodes = cleanNodes.map((n) => {
      if (n.kind === "file" && !n.group_id) {
        return { ...n, group_id: "group:dir:root" };
      }
      return n;
    });

    // Disambiguate duplicate file names (e.g. migration.sql, route.ts) by prefixing parent directory
    const nameCounts = new Map<string, number>();
    assignedNodes.forEach((n) => {
      if (n.kind === "file") {
        nameCounts.set(n.label, (nameCounts.get(n.label) || 0) + 1);
      }
    });

    const finalNodes = assignedNodes.map((n) => {
      if (n.kind === "file" && (nameCounts.get(n.label) || 0) > 1) {
        const path = (n.source_ref?.file_path || n.id.replace(/^file:/, "")).replace(/\\/g, "/");
        const parts = path.split("/");
        if (parts.length > 1) {
          const parentFolder = parts[parts.length - 2];
          return {
            ...n,
            label: `${parentFolder}/${n.label}`,
          };
        }
      }
      return n;
    });

    const cleanNodeIds = new Set(finalNodes.map((n) => n.id));
    const finalEdges = validEdges.filter(
      (edge) => cleanNodeIds.has(edge.from) && cleanNodeIds.has(edge.to)
    );

    return {
      ...model,
      nodes: finalNodes,
      groups: updatedGroups,
      edges: finalEdges,
    };
  }, []);

  // Fetch diagram model from DB
  const fetchDiagram = useCallback(
    async (dtype: DiagramType, pId?: number) => {
      if (!pId || dtype === "system_flow") {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      setActiveDrillGroupId(null);

      try {
        const response = await getDiagram(dtype, pId, {
          enable_progressive_disclosure: true,
        });

        const cleanRaw = sanitizeModel(response.model);
        setRawModel(cleanRaw);

        if (response.collapsed_overview) {
          setIsCollapsedOverview(true);
          setTotalRawNodeCount(response.collapsed_overview.total_node_count);
          const cleanOverview = sanitizeModel(response.collapsed_overview.model);
          setActiveModel(cleanOverview);
        } else {
          setIsCollapsedOverview(false);
          setTotalRawNodeCount(cleanRaw.nodes.length);
          setActiveModel(cleanRaw);
        }
      } catch (err) {
        console.error("Failed to fetch diagram", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [sanitizeModel]
  );

  // Trigger fetch when projectId, diagramType, or lastAnalysisRunId changes
  useEffect(() => {
    if (initialPositionedModel) {
      setPositionedModel(initialPositionedModel);
      setActiveModel({
        diagram_type: initialPositionedModel.diagram_type,
        nodes: initialPositionedModel.nodes,
        edges: initialPositionedModel.edges,
        groups: initialPositionedModel.groups,
      });
      return;
    }
    if (projectId) {
      fetchDiagram(diagramType, projectId);
    }
  }, [projectId, diagramType, lastAnalysisRunId, fetchDiagram, initialPositionedModel]);

  // Execute Layout in Web Worker whenever activeModel or direction changes
  useEffect(() => {
    if (!activeModel) return;

    // Skip recalculation on initial mount if initialPositionedModel is already provided and direction is default
    if (isInitialMount.current && direction === "DOWN") {
      isInitialMount.current = false;
      return;
    }
    isInitialMount.current = false;

    if (cancelActiveLayoutRef.current) {
      cancelActiveLayoutRef.current();
      cancelActiveLayoutRef.current = null;
    }

    if (!workerClientRef.current) {
      workerClientRef.current = new LayoutWorkerClient();
    }

    // Filter activeModel based on active layers and isolated group before layout so hidden nodes never distort geometry
    const visibleNodes = activeModel.nodes.filter((node) => {
      if (filters.isolatedGroupId && node.group_id !== filters.isolatedGroupId) {
        return false;
      }
      const layer = classifyNodeLayer(node);
      if (filters.layers && !filters.layers.has(layer)) {
        return false;
      }
      return true;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = activeModel.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to) && e.from !== e.to
    );
    const visibleGroupIds = new Set(visibleNodes.map((n) => n.group_id).filter(Boolean));
    const visibleGroups = activeModel.groups.filter((g) => visibleGroupIds.has(g.id));

    const modelToPosition: DiagramModel = {
      diagram_type: activeModel.diagram_type,
      nodes: visibleNodes,
      edges: visibleEdges,
      groups: visibleGroups,
    };

    // If active model has 0 nodes, nothing to position
    if (modelToPosition.nodes.length === 0) {
      setPositionedModel({
        diagram_type: activeModel.diagram_type,
        nodes: [],
        edges: [],
        groups: [],
        width: 0,
        height: 0,
      });
      return;
    }

    setIsLayoutRunning(true);
    const calculation = workerClientRef.current.calculate(modelToPosition, {
      direction,
      preset: "layered",
      nodeSpacing: 48,
      groupPadding: 36,
    });

    cancelActiveLayoutRef.current = calculation.cancel;

    calculation.promise
      .then((positioned) => {
        setPositionedModel(positioned);
        setIsLayoutRunning(false);
        cancelActiveLayoutRef.current = null;

        // Camera: fit view with padding, minimum zoom 0.6 on initial fit
        setTimeout(() => {
          reactFlow.fitView({ padding: 0.18, minZoom: 0.5, maxZoom: 1.15, duration: 500 });
          // Check if graph fits or needs fit-all prompt
          setTimeout(() => {
            const currentZoom = reactFlow.getZoom();
            if (currentZoom <= 0.61 && positioned.nodes.length > 8) {
              setShowFitAllPrompt(true);
            } else {
              setShowFitAllPrompt(false);
            }
          }, 550);
        }, 50);
      })
      .catch(async (err) => {
        if (err?.message === "Layout calculation was cancelled") {
          setIsLayoutRunning(false);
          return;
        }
        // Fallback to direct in-process engine calculation if worker fails
        try {
          const { layout } = await import("../../diagram/layout/engine");
          const fallbackPositioned = await layout(modelToPosition, {
            direction,
            preset: "layered",
            nodeSpacing: 48,
            groupPadding: 36,
          });
          setPositionedModel(fallbackPositioned);
          setTimeout(() => {
            reactFlow.fitView({ padding: 0.18, minZoom: 0.5, maxZoom: 1.15, duration: 500 });
          }, 50);
        } catch (fallbackErr: any) {
          console.error("Worker & fallback layout error", fallbackErr);
          setError(`Layout computation failed: ${fallbackErr?.message || fallbackErr}`);
        } finally {
          setIsLayoutRunning(false);
          cancelActiveLayoutRef.current = null;
        }
      });

    return () => {
      if (cancelActiveLayoutRef.current) {
        cancelActiveLayoutRef.current();
      }
    };
  }, [activeModel, direction, filters, reactFlow]);

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

        const drillModel: DiagramModel = sanitizeModel({
          diagram_type: diagramType,
          nodes: result.nodes,
          edges: result.edges,
          groups: [groupObj],
        });

        setActiveModel(drillModel);
      } catch (err) {
        console.error("Failed to drill down into group", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, diagramType, sanitizeModel]
  );

  // Return from drill-down back to collapsed overview
  const handleReturnToOverview = useCallback(() => {
    if (rawModel && projectId) {
      fetchDiagram(diagramType, projectId);
    }
  }, [rawModel, projectId, diagramType, fetchDiagram]);

  // Double click group to focus it
  const handleFocusGroup = useCallback(
    (groupId: string) => {
      if (isCollapsedOverview) {
        handleDrillDown(groupId);
        return;
      }
      const group = positionedModel?.groups.find((g) => g.id === groupId);
      if (group) {
        reactFlow.setCenter(group.x + group.width / 2, group.y + group.height / 2, {
          zoom: 1.0,
          duration: 600,
        });
      }
    },
    [isCollapsedOverview, handleDrillDown, positionedModel, reactFlow]
  );

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

  // Hovered edge endpoints
  const hoveredEndpoints = useMemo(() => {
    if (!hoveredEdgeId || !positionedModel) return new Set<string>();
    const edge = positionedModel.edges.find((e) => e.id === hoveredEdgeId);
    if (!edge) return new Set<string>();
    return new Set<string>([edge.from, edge.to]);
  }, [hoveredEdgeId, positionedModel]);

  // Node degrees (in/out counts)
  const nodeDegrees = useMemo(() => {
    if (!positionedModel) return new Map<string, { inDegree: number; outDegree: number }>();
    return computeNodeDegree(positionedModel.nodes, positionedModel.edges);
  }, [positionedModel]);

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
      zoom: 1.25,
      duration: 600,
    });
  }, [searchMatches, reactFlow]);

  // Compute organic Obsidian-style clustering for file dependency graph view
  const fileClusterPositions = useMemo(() => {
    if (diagramType !== "file_dependency" || !positionedModel) return new Map<string, { x: number; y: number }>();
    const clusterMap = new Map<string, { x: number; y: number }>();

    // Group files by containing group or directory
    const groups = new Map<string, typeof positionedModel.nodes>();
    for (const node of positionedModel.nodes) {
      const gid = node.group_id || "group:dir:root";
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid)!.push(node);
    }

    const groupKeys = Array.from(groups.keys());
    const groupCount = Math.max(1, groupKeys.length);
    const centerRadius = Math.max(280, groupCount * 90);

    groupKeys.forEach((gid, gIdx) => {
      const gAngle = (2 * Math.PI * gIdx) / groupCount;
      const groupCenterX = Math.cos(gAngle) * centerRadius;
      const groupCenterY = Math.sin(gAngle) * centerRadius;

      const groupNodes = groups.get(gid)!;
      const nodeCount = groupNodes.length;
      const localRadius = Math.max(70, Math.sqrt(nodeCount) * 55);

      groupNodes.forEach((node, nIdx) => {
        const nAngle = (2 * Math.PI * nIdx) / Math.max(1, nodeCount) + (gIdx % 2 ? 0.35 : 0);
        const dist = localRadius * (0.35 + 0.65 * ((nIdx % 4) / 3));
        const nx = groupCenterX + Math.cos(nAngle) * dist;
        const ny = groupCenterY + Math.sin(nAngle) * dist;
        clusterMap.set(node.id, { x: nx, y: ny });
      });
    });

    return clusterMap;
  }, [diagramType, positionedModel]);

  // React Flow Nodes conversion with filtering and layer grouping
  const flowNodes: Node[] = useMemo(() => {
    if (!positionedModel) return [];

    const nodes: Node[] = [];
    const isGraphMode = diagramType === "file_dependency" && fileViewMode === "graph";

    // 1. Group nodes (rendered behind, hidden in organic graph view)
    if (!isGraphMode) {
      for (const group of positionedModel.groups) {
        if (filters.isolatedGroupId && filters.isolatedGroupId !== group.id) {
          continue;
        }

        const layer = classifyGroupLayer(group);
        if (filters.layers && !filters.layers.has(layer)) {
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
            layer,
            onToggleCollapse: () => {
              if (isCollapsedOverview) {
                handleDrillDown(group.id);
              }
            },
            onFocusGroup: handleFocusGroup,
          } as GroupNodeData,
          style: {
            width: group.width,
            height: group.height,
            zIndex: 0,
          },
        });
      }
    }

    // 2. Leaf / domain nodes
    for (const node of positionedModel.nodes) {
      if (filters.isolatedGroupId && node.group_id !== filters.isolatedGroupId) {
        continue;
      }

      const layer = classifyNodeLayer(node);
      if (filters.layers && !filters.layers.has(layer)) {
        continue;
      }

      const isUp = upstreamNodeIds.has(node.id);
      const isDown = downstreamNodeIds.has(node.id);
      const isSearchMatch = searchMatches.some((m) => m.id === node.id);
      const isEndpoint = hoveredEndpoints.has(node.id);
      const isSelected = selectedNodeId === node.id;
      const isDimmed = selectedNodeId !== null && !isSelected && !isUp && !isDown;

      const degree = nodeDegrees.get(node.id) || { inDegree: 0, outDegree: 0 };

      let nodeType = "diagramNode";
      let posX = node.x;
      let posY = node.y;

      if (diagramType === "er_diagram") {
        nodeType = "erEntityNode";
      } else if (diagramType === "call_graph") {
        nodeType = "callNode";
      } else if (diagramType === "class_diagram") {
        nodeType = "umlClassNode";
      } else if (isGraphMode) {
        nodeType = "fileGraphNode";
        if (fileClusterPositions.has(node.id)) {
          const cp = fileClusterPositions.get(node.id)!;
          posX = cp.x;
          posY = cp.y;
        }
      }

      nodes.push({
        id: node.id,
        type: nodeType,
        position: { x: posX, y: posY },
        selected: isSelected,
        data: {
          ...node,
          layer,
          inDegree: degree.inDegree,
          outDegree: degree.outDegree,
          isDimmed,
          isHighlighted: isUp || isDown,
          isUpstream: isUp,
          isDownstream: isDown,
          isSearchMatch,
          isHoveredEndpoint: isEndpoint,
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
    diagramType,
    fileViewMode,
    fileClusterPositions,
    filters.isolatedGroupId,
    filters.layers,
    upstreamNodeIds,
    downstreamNodeIds,
    searchMatches,
    hoveredEndpoints,
    selectedNodeId,
    nodeDegrees,
    onNavigateToSource,
    isCollapsedOverview,
    handleDrillDown,
    handleFocusGroup,
  ]);

  // React Flow Edges conversion with filtering, self-loop suppression, and duplicate edge bundling
  const flowEdges: Edge[] = useMemo(() => {
    if (!positionedModel) return [];

    const visibleNodeIds = new Set(flowNodes.map((n) => n.id));
    const isCurvedGraph =
      diagramType === "call_graph" ||
      (diagramType === "file_dependency" && fileViewMode === "graph");

    // Group multiple parallel edges between the same two nodes
    const edgeMap = new Map<
      string,
      {
        primary: (typeof positionedModel.edges)[0];
        count: number;
        allIds: string[];
        labels: string[];
      }
    >();

    for (const edge of positionedModel.edges) {
      // Suppress self-loops in architectural diagrams to prevent hairball loops
      if (edge.from === edge.to) {
        continue;
      }
      if (!filters.relationshipTypes.has(edge.relationship)) {
        continue;
      }
      if (!filters.confidences.has(edge.confidence)) {
        continue;
      }
      if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) {
        continue;
      }

      const key = `${edge.from}->${edge.to}:${edge.relationship}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.allIds.push(edge.id);
        if (edge.label && !existing.labels.includes(edge.label)) {
          existing.labels.push(edge.label);
        }
      } else {
        edgeMap.set(key, {
          primary: edge,
          count: 1,
          allIds: [edge.id],
          labels: edge.label ? [edge.label] : [],
        });
      }
    }

    const edges: Edge[] = [];

    for (const agg of edgeMap.values()) {
      const edge = agg.primary;
      const isConnected = agg.allIds.some((id) => connectedEdgeIds.has(id));
      const isEdgeHovered = agg.allIds.some((id) => hoveredEdgeId === id);
      const isSelected = agg.allIds.some((id) => selectedEdgeId === id);

      let displayLabel = edge.label;
      if (agg.count > 1) {
        if (edge.relationship === "import") {
          displayLabel = `${agg.count} imports`;
        } else if (edge.relationship === "call") {
          displayLabel = `${agg.count} calls`;
        } else {
          displayLabel = `${agg.count} connections`;
        }
      }

      // Compute intelligent handle connection points based on node spatial geometry
      const srcNode = positionedModel.nodes.find((n) => n.id === edge.from);
      const tgtNode = positionedModel.nodes.find((n) => n.id === edge.to);
      let sourceHandle = direction === "RIGHT" ? "right" : "bottom";
      let targetHandle = direction === "RIGHT" ? "left" : "top";
      if (!isCurvedGraph && srcNode && tgtNode) {
        const dy = tgtNode.y - srcNode.y;
        const dx = tgtNode.x - srcNode.x;
        if (Math.abs(dy) >= Math.abs(dx)) {
          sourceHandle = dy >= 0 ? "bottom" : "top";
          targetHandle = dy >= 0 ? "top" : "bottom";
        } else {
          sourceHandle = dx >= 0 ? "right" : "left";
          targetHandle = dx >= 0 ? "left" : "right";
        }
      }

      edges.push({
        id: edge.id,
        type: isCurvedGraph ? "default" : "orthogonal",
        source: edge.from,
        target: edge.to,
        sourceHandle: isCurvedGraph ? undefined : sourceHandle,
        targetHandle: isCurvedGraph ? undefined : targetHandle,
        animated: isConnected,
        markerEnd: isCurvedGraph
          ? {
              type: "arrowclosed" as any,
              width: 14,
              height: 14,
              color: isConnected
                ? "var(--accent-default, #388BFD)"
                : isEdgeHovered
                ? "var(--accent-default, #388BFD)"
                : "rgba(139, 148, 158, 0.5)",
            }
          : undefined,
        style: isCurvedGraph
          ? {
              stroke: isConnected
                ? "var(--accent-default, #388BFD)"
                : isEdgeHovered
                ? "var(--accent-default, #388BFD)"
                : "rgba(139, 148, 158, 0.35)",
              strokeWidth: isConnected || isEdgeHovered ? 2 : 1.25,
              opacity: isConnected || isEdgeHovered ? 1 : 0.65,
            }
          : undefined,
        selected: isSelected,
        data: {
          ...edge,
          label: displayLabel,
          points: edge.points,
          direction,
          isHighlighted: isConnected || isEdgeHovered,
          isUpstream: selectedNodeId ? edge.to === selectedNodeId : false,
          isDownstream: selectedNodeId ? edge.from === selectedNodeId : false,
          onEdgeHover: setHoveredEdgeId,
        } as OrthogonalEdgeData,
      });
    }

    return edges;
  }, [
    positionedModel,
    flowNodes,
    diagramType,
    fileViewMode,
    direction,
    filters.relationshipTypes,
    filters.confidences,
    connectedEdgeIds,
    hoveredEdgeId,
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

  // Export handler
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
            scale: 2,
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
    if (filters.layers && filters.layers.size < 6) count += 6 - filters.layers.size;
    if (filters.isolatedGroupId) count += 1;
    return count;
  }, [filters]);

  // Check empty or no-dependencies low-data state:
  // If diagram has no nodes at all, show the empty state banner.
  // If nodes exist but no edges, still render the canvas with isolated nodes in a grid.
  const hasNoData = positionedModel && positionedModel.nodes.length === 0 && positionedModel.edges.length === 0;
  const hasNoEdges = positionedModel && positionedModel.edges.length === 0 && positionedModel.nodes.length > 0;

  return (
    <div
      ref={canvasContainerRef}
      className="flex-1 flex flex-col h-full w-full bg-canvas overflow-hidden relative"
      data-testid="architecture-screen"
    >
      {/* SVG Marker Definitions for Orthogonal Arrowheads */}
      <SvgMarkerDefs />

      {/* Top Toolbar */}
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
        canvasMode={canvasMode}
        onToggleCanvasMode={setCanvasMode}
        onZoomIn={() => reactFlow.zoomIn({ duration: 250 })}
        onZoomOut={() => reactFlow.zoomOut({ duration: 250 })}
        onFitView={() => {
          reactFlow.fitView({ padding: 0.22, minZoom: 0.1, duration: 500 });
          setShowFitAllPrompt(false);
        }}
        onResetZoom={() => reactFlow.zoomTo(1.0, { duration: 300 })}
        zoomPercent={zoomPercent}
        onExport={handleExport}
        isLayoutRunning={isLayoutRunning}
        onCancelLayout={() => {
          if (cancelActiveLayoutRef.current) {
            cancelActiveLayoutRef.current();
            cancelActiveLayoutRef.current = null;
          }
          setIsLayoutRunning(false);
        }}
        isLegendOpen={isLegendOpen}
        onToggleLegend={() => setIsLegendOpen((v) => !v)}
        fileViewMode={fileViewMode}
        onToggleFileViewMode={() => setFileViewMode((m) => (m === "graph" ? "tree" : "graph"))}
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
        onToggleLayer={(layer) => {
          setFilters((prev) => {
            const next = new Set(prev.layers || DEFAULT_FILTERS.layers);
            if (next.has(layer)) next.delete(layer);
            else next.add(layer);
            return { ...prev, layers: next };
          });
        }}
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Loading & Error States */}
      {isLoading && (
        <div className="absolute inset-0 bg-canvas/60 backdrop-blur-xs flex items-center justify-center z-20 font-mono text-xs text-text-primary">
          <div className="flex items-center space-x-2 bg-surface p-3 rounded-md border border-border-default shadow">
            <Loader2 className="w-4 h-4 animate-spin text-accent-default" />
            <span>Loading architecture graph...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 max-w-md w-full p-3 rounded-md bg-surface border border-error text-error text-xs font-mono shadow-lg flex items-start space-x-2">
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

      {/* System Flow Diagram (Excalidraw / Architecture Workflow Engine) */}
      {diagramType === "system_flow" && (
        <SystemFlowView
          projectId={projectId}
          theme={theme}
          onSelectDiagramElement={onSelectDiagramElement}
          onNavigateToSource={onNavigateToSource}
          canvasMode={canvasMode}
        />
      )}

      {/* Empty State when no project is loaded */}
      {diagramType !== "system_flow" && !projectId && !initialPositionedModel && (
        <div className="flex-1 flex flex-col items-center justify-center font-mono text-xs text-text-muted space-y-2 p-4">
          <FolderOpen className="w-8 h-8 text-text-faint" />
          <span>No project opened. Select or open a repository to explore its architecture.</span>
        </div>
      )}

      {/* Section 1: Empty and low-data states */}
      {/* If no nodes and no edges exist, show clear empty state with pipeline action */}
      {diagramType !== "system_flow" && (projectId || initialPositionedModel) && hasNoData && (
        <div
          data-testid="no-dependencies-state"
          className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-canvas select-none z-10"
        >
          <div className="max-w-md w-full bg-surface border border-border-default rounded-lg p-6 shadow-sm flex flex-col items-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-subtle border border-border-subtle flex items-center justify-center text-text-muted mb-1">
              {diagramType === "er_diagram" ? (
                <Database className="w-5 h-5 text-accent" />
              ) : diagramType === "call_graph" ? (
                <GitFork className="w-5 h-5 text-accent" />
              ) : diagramType === "class_diagram" ? (
                <Box className="w-5 h-5 text-accent" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-warning" />
              )}
            </div>

            <h2 className="text-[15px] font-sans font-semibold text-text-primary">
              {diagramType === "er_diagram"
                ? "No Database Entities Detected"
                : diagramType === "call_graph"
                ? "No Function Calls Mapped"
                : diagramType === "class_diagram"
                ? "No Classes Detected"
                : "No dependencies detected"}
            </h2>

            <p className="text-xs text-text-secondary font-mono leading-relaxed max-w-sm">
              {diagramType === "er_diagram"
                ? "0 files parsed. Run analysis to extract Prisma schemas (*.prisma), SQL migrations, and database models."
                : diagramType === "call_graph"
                ? "0 files parsed. Run analysis to map function call sites and cross-file relationships."
                : diagramType === "class_diagram"
                ? "0 files parsed. Run analysis to index classes and inheritance hierarchies."
                : "0 files parsed. Run analysis or select a valid project root to generate the graph."}
            </p>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                data-testid="run-pipeline-btn"
                icon={<Play className="w-3.5 h-3.5 fill-current" />}
                onClick={handleRunPipeline}
              >
                Run Analysis Pipeline
              </Button>
              {onTriggerScan && (
                <Button
                  variant="secondary"
                  size="md"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={onTriggerScan}
                >
                  Re-scan
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Excalidraw Whiteboard Canvas (rendered for all diagram views when toggled to whiteboard mode) */}
      {canvasMode === "whiteboard" && diagramType !== "system_flow" && (projectId || initialPositionedModel) && !hasNoData && (
        <div className="flex-1 w-full h-full relative" data-testid="excalidraw-wrapper">
          <ExcalidrawCanvas
            model={activeModel || positionedModel}
            title={diagramType.replace(/_/g, " ")}
            theme={theme}
            onSelectDiagramElement={onSelectDiagramElement}
            onNavigateToSource={onNavigateToSource}
          />
        </div>
      )}

      {/* React Flow Canvas (rendered in graph mode when nodes exist — with or without edges) */}
      {canvasMode === "graph" && diagramType !== "system_flow" && (projectId || initialPositionedModel) && !hasNoData && (
        <div className="flex-1 w-full h-full relative" data-testid="react-flow-wrapper">
          <ReactFlow
            colorMode={theme}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: 0.5, maxZoom: 1.15 }}
            minZoom={0.25}
            maxZoom={2.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
            className="bg-canvas"
            proOptions={{ hideAttribution: true }}
            zoomOnScroll={!isCanvasLocked}
            panOnDrag={!isCanvasLocked}
          >
            <Background color="var(--border-subtle, #21262D)" gap={20} size={1} />

            {/* Informational banner when nodes exist but no edges detected (shown only in detailed view) */}
            {hasNoEdges && !isCollapsedOverview && (
              <Panel position="top-center" className="!mt-3 !p-0 z-10">
                <div
                  data-testid="isolated-nodes-banner"
                  className="flex items-center space-x-2 bg-surface/90 backdrop-blur-md border border-border-default rounded-lg px-3 py-1.5 text-xs font-sans text-text-secondary shadow-subtle"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                  <span>
                    {positionedModel?.nodes.length} component{positionedModel?.nodes.length === 1 ? "" : "s"} indexed, 0 dependencies detected.
                  </span>
                  <button
                    type="button"
                    onClick={handleRunPipeline}
                    className="ml-1 px-2.5 py-1 rounded bg-accent hover:bg-accent-hover text-white text-[11px] font-sans font-medium transition-colors shadow-xs"
                  >
                    Run Pipeline
                  </button>
                </div>
              </Panel>
            )}

            {/* Custom compact vertical zoom controls pill bottom-left */}
            <Panel position="bottom-left" className="!m-4 !p-0">
              <DiagramControls
                zoomPercent={zoomPercent}
                onZoomIn={() => reactFlow.zoomIn({ duration: 250 })}
                onZoomOut={() => reactFlow.zoomOut({ duration: 250 })}
                onFitView={() => {
                  reactFlow.fitView({ padding: 0.22, minZoom: 0.1, duration: 500 });
                  setShowFitAllPrompt(false);
                }}
                onResetZoom={() => reactFlow.zoomTo(1.0, { duration: 300 })}
                showFitAllPrompt={showFitAllPrompt}
                isLocked={isCanvasLocked}
                onToggleLock={() => setIsCanvasLocked((prev) => !prev)}
                isMinimapOpen={isMinimapVisible}
                onToggleMinimap={() => setIsMinimapVisible((prev) => !prev)}
              />
            </Panel>

            {/* Minimap bottom-right: 160x100, layer colors, hidden when graph <= 4 nodes or toggled off */}
            {flowNodes.length > 4 && isMinimapVisible && (
              <MiniMap
                nodeColor={(n) => {
                  const layer = (n.data as any)?.layer || "unclassified";
                  const style = LAYER_STYLES[layer as ArchitectureLayer];
                  return theme === "light"
                    ? style?.accentColorLight || "#007AFF"
                    : style?.accentColorDark || "#0A84FF";
                }}
                maskColor={theme === "light" ? "rgba(248, 250, 252, 0.75)" : "rgba(14, 15, 19, 0.75)"}
                className="!bg-surface !border !border-border-default !rounded-lg !w-[160px] !h-[100px] !bottom-4 !right-4 shadow-menu overflow-hidden"
                zoomable
                pannable
              />
            )}

            {/* Collapsible Legend Panel */}
            <DiagramLegend
              isOpen={isLegendOpen}
              onToggle={() => setIsLegendOpen((v) => !v)}
            />
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
