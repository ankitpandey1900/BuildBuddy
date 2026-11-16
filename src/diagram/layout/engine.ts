import ELK from "elkjs/lib/elk.bundled.js";
import type {
  DiagramModel,
  Point,
  PositionedEdge,
  PositionedGroup,
  PositionedModel,
  PositionedNode,
} from "../../types/diagram";
import { getNodeSizeForKind } from "../../types/diagram";
import type { LayoutOptions } from "./types";

const elk = new ELK();

/**
 * Pure layout function.
 * Maps a normalized DiagramModel into a PositionedModel using ELK.js layered layout.
 */
export async function layout(
  model: DiagramModel,
  options: LayoutOptions = {}
): Promise<PositionedModel> {
  const direction = options.direction ?? "DOWN";
  const preset = options.preset ?? "layered";

  let nodeSpacing = options.nodeSpacing ?? 40;
  let layerSpacing = 50;
  let groupPadding = options.groupPadding ?? 30;

  if (preset === "compact") {
    nodeSpacing = 24;
    layerSpacing = 36;
    groupPadding = 20;
  } else if (preset === "spacious") {
    nodeSpacing = 60;
    layerSpacing = 80;
    groupPadding = 40;
  }

  // 1. Validate endpoints and detect dense graph for adaptive layout optimizations
  const validNodeIds = new Set<string>();
  for (const node of model.nodes) {
    validNodeIds.add(node.id);
  }
  for (const group of model.groups) {
    validNodeIds.add(group.id);
  }

  const validEdges = model.edges.filter(
    (edge) => validNodeIds.has(edge.from) && validNodeIds.has(edge.to)
  );

  // Fallback / optimization: For large/dense graphs (>300 edges or >100 nodes),
  // crossing minimization dominates runtime (O(E * N) to O(E^2)).
  // Disabling crossing minimization (NONE) keeps layered hierarchy & orthogonal routing
  // while bringing layout time under 1.5s.
  const isDenseGraph = validEdges.length > 300 || model.nodes.length > 100;
  const crossingStrategy = isDenseGraph ? "NONE" : "LAYER_SWEEP";

  // Build lookup of groups
  const groupChildrenMap = new Map<string, any[]>();
  for (const group of model.groups) {
    groupChildrenMap.set(group.id, []);
  }

  const rootChildren: any[] = [];

  for (const node of model.nodes) {
    const size = getNodeSizeForKind(node.kind);
    const w = node.width > 0 ? node.width : size.width;
    const h = node.height > 0 ? node.height : size.height;

    const elkNode = {
      id: node.id,
      width: w,
      height: h,
      labels: [{ text: node.label }],
    };

    if (node.group_id && groupChildrenMap.has(node.group_id)) {
      groupChildrenMap.get(node.group_id)!.push(elkNode);
    } else {
      rootChildren.push(elkNode);
    }
  }

  // Add group nodes to rootChildren (skip if already added as a node)
  const existingIds = new Set(rootChildren.map((c) => c.id));
  for (const group of model.groups) {
    if (existingIds.has(group.id)) {
      continue;
    }
    const children = groupChildrenMap.get(group.id) ?? [];
    rootChildren.push({
      id: group.id,
      labels: [{ text: group.label }],
      children,
      layoutOptions: {
        "elk.padding": `[top=${groupPadding},left=${groupPadding},bottom=${groupPadding},right=${groupPadding}]`,
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.spacing.nodeNode": String(nodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
        "elk.layered.thoroughness": "1",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
        "elk.layered.crossingMinimization.strategy": crossingStrategy,
      },
    });
    existingIds.add(group.id);
  }

  // 2. Build ELK edges
  const elkEdges = validEdges.map((edge) => ({
    id: edge.id,
    sources: [edge.from],
    targets: [edge.to],
    labels: edge.label ? [{ text: edge.label, width: 80, height: 16 }] : [],
  }));

  // 3. Assemble root ELK graph
  const rootGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(nodeSpacing),
      "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeEdge": "16",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.thoroughness": "1",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.layered.crossingMinimization.strategy": crossingStrategy,
      "org.eclipse.elk.randomSeed": "1",
    },
    children: rootChildren,
    edges: elkEdges,
  };

  // 4. Run ELK layout
  const elkResult = await elk.layout(rootGraph);

  // 5. Extract positioned nodes and groups
  const positionedNodes: PositionedNode[] = [];
  const positionedGroups: PositionedGroup[] = [];

  // Index original nodes and groups for fast lookup
  const origNodeMap = new Map(model.nodes.map((n) => [n.id, n]));
  const origGroupMap = new Map(model.groups.map((g) => [g.id, g]));

  // Traverse ELK tree to compute absolute coordinates
  function processElkNode(n: any, parentX = 0, parentY = 0) {
    const absX = parentX + (n.x ?? 0);
    const absY = parentY + (n.y ?? 0);

    if (origNodeMap.has(n.id)) {
      const origNode = origNodeMap.get(n.id)!;
      const finalW = n.width && n.width > 0 ? n.width : origNode.width;
      const finalH = n.height && n.height > 0 ? n.height : origNode.height;
      positionedNodes.push({
        ...origNode,
        x: absX,
        y: absY,
        width: finalW,
        height: finalH,
      });
    }

    if (origGroupMap.has(n.id)) {
      const origGroup = origGroupMap.get(n.id)!;
      positionedGroups.push({
        ...origGroup,
        x: absX,
        y: absY,
        width: n.width ?? 200,
        height: n.height ?? 100,
      });

      if (n.children) {
        for (const child of n.children) {
          processElkNode(child, absX, absY);
        }
      }
    }
  }

  if (elkResult.children) {
    for (const child of elkResult.children) {
      processElkNode(child, 0, 0);
    }
  }

  // 6. Extract positioned edges with orthogonal routes / bend points
  const edgePointsMap = new Map<string, Point[]>();

  function collectEdgeSections(edgeList?: any[]) {
    if (!edgeList) return;
    for (const edge of edgeList) {
      const points: Point[] = [];
      if (edge.sections && edge.sections.length > 0) {
        for (const sec of edge.sections) {
          if (sec.startPoint) {
            points.push({ x: sec.startPoint.x, y: sec.startPoint.y });
          }
          if (sec.bendPoints) {
            for (const bp of sec.bendPoints) {
              points.push({ x: bp.x, y: bp.y });
            }
          }
          if (sec.endPoint) {
            points.push({ x: sec.endPoint.x, y: sec.endPoint.y });
          }
        }
      }
      edgePointsMap.set(edge.id, points);
    }
  }

  collectEdgeSections(elkResult.edges);

  // Position lookup for fallback routing
  const nodePosMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of positionedNodes) {
    nodePosMap.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height });
  }
  for (const g of positionedGroups) {
    nodePosMap.set(g.id, { x: g.x, y: g.y, w: g.width, h: g.height });
  }

  const positionedEdges: PositionedEdge[] = model.edges.map((edge) => {
    let points = edgePointsMap.get(edge.id) ?? [];
    if (points.length === 0) {
      // Fallback orthogonal route from source center to target center
      const src = nodePosMap.get(edge.from);
      const tgt = nodePosMap.get(edge.to);
      if (src && tgt) {
        const startX = src.x + src.w / 2;
        const startY = src.y + src.h;
        const endX = tgt.x + tgt.w / 2;
        const endY = tgt.y;
        const midY = (startY + endY) / 2;
        points = [
          { x: startX, y: startY },
          { x: startX, y: midY },
          { x: endX, y: midY },
          { x: endX, y: endY },
        ];
      }
    }

    return {
      ...edge,
      points,
    };
  });

  // Sort deterministically
  positionedNodes.sort((a, b) => a.id.localeCompare(b.id));
  positionedEdges.sort((a, b) => a.id.localeCompare(b.id));
  positionedGroups.sort((a, b) => a.id.localeCompare(b.id));

  return {
    diagram_type: model.diagram_type,
    nodes: positionedNodes,
    edges: positionedEdges,
    groups: positionedGroups,
    width: (elkResult as any).width ?? 800,
    height: (elkResult as any).height ?? 600,
  };
}
