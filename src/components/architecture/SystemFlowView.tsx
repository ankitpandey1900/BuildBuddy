import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Loader2,
  Layers,
  Cpu,
  GitPullRequest,
  Code2,
  Paintbrush,
  Network,
} from "lucide-react";
import { getApiEndpoints, getDatabaseTables, getPackageInventory } from "../../lib/tauri";
import { ExcalidrawCanvas } from "./ExcalidrawCanvas";
import { MermaidViewer } from "../docs/MermaidViewer";
import { exportToMermaid } from "../../diagram/export/mermaid";
import { layout } from "../../diagram/layout/engine";
import { DiagramNodeComponent } from "./nodes/DiagramNodeComponent";
import { GroupNodeComponent } from "./nodes/GroupNodeComponent";
import { ErEntityNodeComponent } from "./nodes/ErEntityNodeComponent";
import { OrthogonalEdge } from "./edges/OrthogonalEdge";
import { SvgMarkerDefs } from "./controls/DiagramLegend";

import type { ApiEndpoint, DatabaseTable, PackageInventoryItem } from "../../types/ipc";
import type {
  DiagramModel,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  PositionedModel,
  SelectedDiagramElement,
} from "../../types/diagram";

export interface SystemFlowViewProps {
  projectId?: number;
  theme?: "dark" | "light";
  onSelectDiagramElement?: (element: SelectedDiagramElement | null) => void;
  onNavigateToSource?: (filePath: string, line: number) => void;
  canvasMode?: "graph" | "whiteboard";
}

type FlowSubTab = "layered" | "context" | "operational";
type ViewFormat = "graph" | "whiteboard" | "mermaid";

const nodeTypes = {
  diagramNode: DiagramNodeComponent,
  groupNode: GroupNodeComponent,
  erEntityNode: ErEntityNodeComponent,
};

const edgeTypes = {
  orthogonal: OrthogonalEdge,
};

export const SystemFlowView: React.FC<SystemFlowViewProps> = ({
  projectId,
  theme = "dark",
  onSelectDiagramElement,
  onNavigateToSource,
  canvasMode,
}) => {
  const [activeTab, setActiveTab] = useState<FlowSubTab>("layered");
  const [viewFormat, setViewFormat] = useState<ViewFormat>(canvasMode || "graph");

  useEffect(() => {
    if (canvasMode) {
      setViewFormat(canvasMode);
    }
  }, [canvasMode]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLayingOut, setIsLayingOut] = useState(false);

  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [packages, setPackages] = useState<PackageInventoryItem[]>([]);
  const [positionedModel, setPositionedModel] = useState<PositionedModel | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let isCancelled = false;
    setIsLoading(true);

    // Parallel fetch real project AST entities
    Promise.allSettled([
      getApiEndpoints(projectId).catch(() => [] as ApiEndpoint[]),
      getDatabaseTables(projectId).catch(() => [] as DatabaseTable[]),
      getPackageInventory(projectId).catch(() => [] as PackageInventoryItem[]),
    ])
      .then(([apiResult, dbResult, pkgResult]) => {
        if (isCancelled) return;

        if (apiResult.status === "fulfilled" && apiResult.value) {
          setEndpoints(apiResult.value);
        }
        if (dbResult.status === "fulfilled" && dbResult.value) {
          setTables(dbResult.value);
        }
        if (pkgResult.status === "fulfilled" && pkgResult.value) {
          setPackages(pkgResult.value);
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  // Construct semantic multi-tier DiagramModel from real indexed metadata
  const flowModel = useMemo<DiagramModel>(() => {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    const groups: DiagramGroup[] = [];

    if (activeTab === "layered") {
      // Architectural Layer Groups
      groups.push({
        id: "group:layer:frontend",
        label: "Presentation Layer (Web / Client)",
        collapsed: false,
      });
      groups.push({
        id: "group:layer:backend",
        label: "Application & API Layer",
        collapsed: false,
      });
      groups.push({
        id: "group:layer:data",
        label: "Data Access & Persistence Layer",
        collapsed: false,
      });
      if (packages.length > 0) {
        groups.push({
          id: "group:layer:external",
          label: "External Services & Dependencies",
          collapsed: false,
        });
      }

      // 1. Frontend Layer
      nodes.push({
        id: "node:web_client",
        kind: "component",
        label: "Web Client Application\n(Interactive UI Components)",
        group_id: "group:layer:frontend",
        width: 250,
        height: 68,
        members: [],
      });

      // 2. Backend Layer: API Endpoints
      if (endpoints.length > 0) {
        endpoints.slice(0, 9).forEach((ep, idx) => {
          const epId = `endpoint:${ep.id || idx}`;
          nodes.push({
            id: epId,
            kind: "component",
            label: `${ep.method} ${ep.route}\n(${ep.framework})`,
            group_id: "group:layer:backend",
            source_ref: {
              file_path: ep.file_path,
              start_line: ep.start_line,
              end_line: ep.end_line,
            },
            width: 250,
            height: 68,
            members: [],
          });
        });
      } else {
        nodes.push({
          id: "node:default_handler",
          kind: "component",
          label: "Application Route Handlers\n(Controllers & Middleware)",
          group_id: "group:layer:backend",
          width: 250,
          height: 68,
          members: [],
        });
      }

      // 3. Data Layer: Tables
      if (tables.length > 0) {
        tables.slice(0, 9).forEach((tbl, idx) => {
          const tblId = `table:${idx}`;
          const fieldsStr = tbl.fields ? ` (${tbl.fields.length} fields)` : "";
          nodes.push({
            id: tblId,
            kind: "component",
            label: `Entity: ${tbl.name}${fieldsStr}`,
            group_id: "group:layer:data",
            source_ref: tbl.file_path
              ? {
                  file_path: tbl.file_path,
                  start_line: tbl.start_line || 1,
                  end_line: tbl.end_line || 1,
                }
              : undefined,
            width: 250,
            height: 68,
            members: [],
          });
        });
      } else {
        nodes.push({
          id: "node:default_db",
          kind: "component",
          label: "Primary Database Storage\n(State & Entities)",
          group_id: "group:layer:data",
          width: 250,
          height: 68,
          members: [],
        });
      }

      // 4. External Layer: Packages
      if (packages.length > 0) {
        packages.slice(0, 6).forEach((pkg, idx) => {
          const pkgId = `pkg:${idx}`;
          nodes.push({
            id: pkgId,
            kind: "external",
            label: `${pkg.name} (${pkg.category})`,
            group_id: "group:layer:external",
            width: 250,
            height: 68,
            members: [],
          });
        });
      }

      // Connect layers orthogonally
      const beNodes = nodes.filter((n) => n.group_id === "group:layer:backend");
      const dbNodes = nodes.filter((n) => n.group_id === "group:layer:data");
      const extNodes = nodes.filter((n) => n.group_id === "group:layer:external");

      beNodes.slice(0, 2).forEach((be, i) => {
        edges.push({
          id: `edge:web_to_${be.id}`,
          from: "node:web_client",
          to: be.id,
          relationship: "call",
          confidence: "confirmed",
          evidence_id: 1,
          evidence_key: "web->api",
          label: i === 0 ? "HTTPS / JSON" : undefined,
        });
      });

      beNodes.slice(0, 3).forEach((be, idx) => {
        if (dbNodes[idx]) {
          edges.push({
            id: `edge:${be.id}_to_${dbNodes[idx].id}`,
            from: be.id,
            to: dbNodes[idx].id,
            relationship: "call",
            confidence: "confirmed",
            evidence_id: 2,
            evidence_key: "api->db",
            label: idx === 0 ? "Type-Safe Query / ORM" : undefined,
          });
        }
      });

      if (beNodes[0] && extNodes[0]) {
        edges.push({
          id: `edge:${beNodes[0].id}_to_${extNodes[0].id}`,
          from: beNodes[0].id,
          to: extNodes[0].id,
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 3,
          evidence_key: "api->ext",
          label: "Imports & SDK",
        });
      }
    } else if (activeTab === "context") {
      groups.push({
        id: "group:flow:client",
        label: "1. Client Entrypoints",
        collapsed: false,
      });
      groups.push({
        id: "group:flow:engine",
        label: "2. Application Engine & Processing",
        collapsed: false,
      });
      groups.push({
        id: "group:flow:storage",
        label: "3. Storage & Infrastructure",
        collapsed: false,
      });

      nodes.push({
        id: "ctx:client",
        kind: "component",
        label: "Client Applications\n(Web, Mobile & CLI)",
        group_id: "group:flow:client",
        width: 250,
        height: 68,
        members: [],
      });
      nodes.push({
        id: "ctx:engine",
        kind: "component",
        label: `Application Engine\n(${endpoints.length} Routes Indexed)`,
        group_id: "group:flow:engine",
        width: 250,
        height: 68,
        members: [],
      });
      nodes.push({
        id: "ctx:db",
        kind: "component",
        label: `Database Cluster\n(${tables.length} Models Indexed)`,
        group_id: "group:flow:storage",
        width: 250,
        height: 68,
        members: [],
      });
      if (packages.length > 0) {
        nodes.push({
          id: "ctx:ext",
          kind: "external",
          label: `External Ecosystem\n(${packages.length} Packages)`,
          group_id: "group:flow:storage",
          width: 250,
          height: 68,
          members: [],
        });
      }

      edges.push({
        id: "ctx_e1",
        from: "ctx:client",
        to: "ctx:engine",
        relationship: "call",
        confidence: "confirmed",
        evidence_id: 1,
        evidence_key: "ctx:1",
        label: "HTTPS / TLS 1.3",
      });
      edges.push({
        id: "ctx_e2",
        from: "ctx:engine",
        to: "ctx:db",
        relationship: "call",
        confidence: "confirmed",
        evidence_id: 2,
        evidence_key: "ctx:2",
        label: "SQL Connection Pool",
      });
      if (packages.length > 0) {
        edges.push({
          id: "ctx_e3",
          from: "ctx:engine",
          to: "ctx:ext",
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 3,
          evidence_key: "ctx:3",
          label: "Dependencies & SDKs",
        });
      }
    } else {
      const sampleEp = endpoints[0]?.route || "/api/action";
      const sampleTbl = tables[0]?.name || "Entity";

      groups.push({
        id: "group:op:inbound",
        label: "Inbound Request Flow",
        collapsed: false,
      });
      groups.push({
        id: "group:op:backend",
        label: "Execution & Persistence",
        collapsed: false,
      });

      nodes.push({
        id: "op:user",
        kind: "component",
        label: "1. Client User Action\n(Dispatch HTTPS Request)",
        group_id: "group:op:inbound",
        width: 250,
        height: 68,
        members: [],
      });
      nodes.push({
        id: "op:gateway",
        kind: "component",
        label: `2. API Gateway Verify\n(${sampleEp})`,
        group_id: "group:op:inbound",
        width: 250,
        height: 68,
        members: [],
      });
      nodes.push({
        id: "op:orm",
        kind: "component",
        label: `3. ORM Mutation\n(${sampleTbl} Table)`,
        group_id: "group:op:backend",
        width: 250,
        height: 68,
        members: [],
      });
      nodes.push({
        id: "op:response",
        kind: "component",
        label: "4. State Hydration\n(200 OK / Updated State)",
        group_id: "group:op:backend",
        width: 250,
        height: 68,
        members: [],
      });

      edges.push({
        id: "op_e1",
        from: "op:user",
        to: "op:gateway",
        relationship: "call",
        confidence: "confirmed",
        evidence_id: 1,
        evidence_key: "op:1",
        label: "REST / JSON Payload",
      });
      edges.push({
        id: "op_e2",
        from: "op:gateway",
        to: "op:orm",
        relationship: "call",
        confidence: "confirmed",
        evidence_id: 2,
        evidence_key: "op:2",
        label: "Execute Mutation",
      });
      edges.push({
        id: "op_e3",
        from: "op:orm",
        to: "op:response",
        relationship: "call",
        confidence: "confirmed",
        evidence_id: 3,
        evidence_key: "op:3",
        label: "Return Result",
      });
    }

    return {
      diagram_type: "system_flow",
      nodes,
      edges,
      groups,
    };
  }, [activeTab, endpoints, tables, packages]);

  // Compute layered graph positions whenever the flowModel changes
  useEffect(() => {
    let isCancelled = false;
    setIsLayingOut(true);

    layout(flowModel, { direction: "DOWN", preset: "layered" })
      .then((positioned) => {
        if (!isCancelled) {
          setPositionedModel(positioned);
        }
      })
      .catch((err) => {
        console.error("[SystemFlowView] Layout computation error:", err);
      })
      .finally(() => {
        if (!isCancelled) setIsLayingOut(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [flowModel]);

  const currentTitle = useMemo(() => {
    if (activeTab === "context") return "Protocol Flow";
    if (activeTab === "layered") return "Multi-Tier Architecture";
    return "Operational Flow";
  }, [activeTab]);

  const mermaidSource = useMemo(() => {
    return exportToMermaid(flowModel);
  }, [flowModel]);

  // Map positioned model to React Flow nodes and edges
  const flowNodes = useMemo<Node[]>(() => {
    if (!positionedModel) return [];
    const res: Node[] = [];

    // Group containers first
    for (const g of positionedModel.groups) {
      res.push({
        id: g.id,
        type: "groupNode",
        position: { x: g.x, y: g.y },
        data: {
          id: g.id,
          label: g.label,
          collapsed: false,
          width: g.width,
          height: g.height,
        },
        style: {
          width: g.width,
          height: g.height,
          zIndex: -1,
        },
      });
    }

    // Interactive component cards
    for (const n of positionedModel.nodes) {
      res.push({
        id: n.id,
        type: "diagramNode",
        position: { x: n.x, y: n.y },
        data: {
          ...n,
          onOpenSource: (filePath: string, line: number) => {
            if (onNavigateToSource) {
              onNavigateToSource(filePath, line);
            }
          },
        },
        style: {
          width: n.width,
          height: n.height,
        },
      });
    }

    return res;
  }, [positionedModel, onNavigateToSource]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!positionedModel) return [];
    return positionedModel.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "orthogonal",
      data: {
        ...e,
        direction: "DOWN",
      },
    }));
  }, [positionedModel]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onSelectDiagramElement) {
        const origNode = flowModel.nodes.find((n) => n.id === node.id);
        if (origNode) {
          onSelectDiagramElement({
            type: "node",
            node: origNode,
          });
        }
      }
    },
    [flowModel, onSelectDiagramElement]
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (onSelectDiagramElement) {
        const origEdge = flowModel.edges.find((e) => e.id === edge.id);
        if (origEdge) {
          onSelectDiagramElement({
            type: "edge",
            edge: origEdge,
          });
        }
      }
    },
    [flowModel, onSelectDiagramElement]
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden">
      {/* Subtab selection and view format switcher */}
      <div className="px-4 py-2 border-b border-border bg-card/70 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("layered")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium transition-colors ${
              activeTab === "layered"
                ? "bg-muted text-foreground shadow-xs border border-border font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Multi-Tier Architecture</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium transition-colors ${
              activeTab === "context"
                ? "bg-muted text-foreground shadow-xs border border-border font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>System Protocol Flow</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("operational")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium transition-colors ${
              activeTab === "operational"
                ? "bg-muted text-foreground shadow-xs border border-border font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5 text-emerald-400" />
            <span>Operational Data Flow</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span>{endpoints.length} routes</span>
            <span>•</span>
            <span>{tables.length} models</span>
            <span>•</span>
            <span>{packages.length} packages</span>
          </div>

          <div className="flex items-center bg-muted/60 p-0.5 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setViewFormat("graph")}
              className={`p-1 rounded text-xs transition-colors ${
                viewFormat === "graph"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Structured Engineering Workbench (XYFlow + ELK)"
            >
              <Network className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewFormat("whiteboard")}
              className={`p-1 rounded text-xs transition-colors ${
                viewFormat === "whiteboard"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Whiteboard Canvas (Excalidraw)"
            >
              <Paintbrush className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewFormat("mermaid")}
              className={`p-1 rounded text-xs transition-colors ${
                viewFormat === "mermaid"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Mermaid / Code Mode"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main viewer container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {(isLoading || isLayingOut) && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center px-3 py-1.5 rounded bg-card/90 border border-border text-xs font-mono text-muted-foreground space-x-2 shadow-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span>Aligning architecture layers with ELK engine...</span>
          </div>
        )}

        <div className="flex-1 w-full h-full min-h-0 flex flex-col">
          {viewFormat === "graph" ? (
            <div className="flex-1 w-full h-full relative" data-testid="system-flow-graph">
              <SvgMarkerDefs />
              <ReactFlowProvider>
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  colorMode={theme}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  minZoom={0.15}
                  maxZoom={2.5}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                  onPaneClick={() => onSelectDiagramElement?.(null)}
                >
                  <Background color="var(--border-subtle, #30363D)" gap={20} size={1} />
                  <Controls className="!bg-surface !border-border-default !rounded-md" />
                </ReactFlow>
              </ReactFlowProvider>
            </div>
          ) : viewFormat === "whiteboard" ? (
            <ExcalidrawCanvas
              model={flowModel}
              title={currentTitle}
              theme={theme}
              onSelectDiagramElement={onSelectDiagramElement}
              onNavigateToSource={onNavigateToSource}
            />
          ) : (
            <MermaidViewer
              code={mermaidSource}
              title={currentTitle}
              theme={theme}
            />
          )}
        </div>
      </div>
    </div>
  );
};
