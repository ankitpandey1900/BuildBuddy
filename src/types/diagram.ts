export type DiagramNodeKind = "file" | "module" | "class" | "component" | "external";

export type RelationshipType =
  | "import"
  | "call"
  | "inheritance"
  | "instantiation"
  | "declared_dependency"
  | "entry";

export type DiagramConfidence = "confirmed" | "static" | "inferred" | "unknown";

export type DiagramType =
  | "system_flow"
  | "architecture_overview"
  | "module_dependency"
  | "file_dependency"
  | "class_diagram"
  | "call_graph"
  | "er_diagram";

export interface SourceRef {
  file_path: string;
  start_line: number;
  end_line: number;
}

export interface NodeMetrics {
  line_count?: number;
  function_count?: number;
  class_count?: number;
  import_count?: number;
  complexity?: number;
}

export interface DiagramNode {
  id: string;
  kind: DiagramNodeKind;
  label: string;
  group_id?: string;
  width: number;
  height: number;
  source_ref?: SourceRef;
  metrics?: NodeMetrics;
  members?: string[];
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  relationship: RelationshipType;
  confidence: DiagramConfidence;
  evidence_id: number;
  evidence_key: string;
  label?: string;
}

export interface AggregatedEdge {
  id: string;
  from: string;
  to: string;
  relationship: RelationshipType;
  edge_count: number;
  underlying_edge_ids: string[];
  evidence_ids: number[];
  evidence_keys: string[];
}

export interface DiagramGroup {
  id: string;
  label: string;
  parent_group?: string;
  collapsed: boolean;
}

export interface DroppedEdge {
  from: string;
  to: string;
  relationship: string;
  reason: string;
}

export interface DiagramModel {
  diagram_type: DiagramType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
}

export interface DiagramReport {
  model: DiagramModel;
  dropped_edges: DroppedEdge[];
}

export interface CollapsedOverview {
  model: DiagramModel;
  aggregated_edges: AggregatedEdge[];
  total_node_count: number;
  threshold: number;
}

export interface DrillDownResult {
  group_id: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
}

export interface PositionedEdge extends DiagramEdge {
  points: Point[];
}

export interface PositionedGroup extends DiagramGroup {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedModel {
  diagram_type: DiagramType;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  groups: PositionedGroup[];
  width: number;
  height: number;
}

export interface DiagramOptions {
  enable_progressive_disclosure?: boolean;
}

export interface DiagramResponse {
  model: DiagramModel;
  dropped_edges: DroppedEdge[];
  collapsed_overview?: CollapsedOverview | null;
}

export type SelectedDiagramElement =
  | {
      type: "node";
      node: DiagramNode;
      connectedEdges?: DiagramEdge[];
    }
  | {
      type: "edge";
      edge: DiagramEdge;
      fromNode?: DiagramNode;
      toNode?: DiagramNode;
    };

export interface DiagramFilters {
  relationshipTypes: RelationshipType[];
  confidences: DiagramConfidence[];
  isolatedGroupId: string | null;
}

export const NODE_SIZE_FILE = { width: 180, height: 40 };
export const NODE_SIZE_MODULE = { width: 200, height: 50 };
export const NODE_SIZE_CLASS = { width: 220, height: 60 };
export const NODE_SIZE_COMPONENT = { width: 200, height: 50 };
export const NODE_SIZE_EXTERNAL = { width: 160, height: 40 };

export const PROGRESSIVE_DISCLOSURE_THRESHOLD = 150;

export function getNodeSizeForKind(kind: DiagramNodeKind): { width: number; height: number } {
  switch (kind) {
    case "file":
      return NODE_SIZE_FILE;
    case "module":
      return NODE_SIZE_MODULE;
    case "class":
      return NODE_SIZE_CLASS;
    case "component":
      return NODE_SIZE_COMPONENT;
    case "external":
      return NODE_SIZE_EXTERNAL;
  }
}

