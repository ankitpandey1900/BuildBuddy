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
import { computeStratifiedFallbackLayout } from "./fallback";

const elk = new ELK();

/**
 * Pure layout function.
 * Maps a normalized DiagramModel into a PositionedModel using ELK.js layered layout.
 * Gracefully falls back to stratified rank layout if ELK encounters unsupported subgraphs.
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

  // Semantic layout parameter tuning per diagram type
  if (model.diagram_type === "er_diagram") {
    nodeSpacing = options.nodeSpacing ?? (preset === "compact" ? 36 : 64);
    layerSpacing = preset === "compact" ? 56 : 88;
    groupPadding = 36;
  } else if (model.diagram_type === "system_flow") {
    nodeSpacing = options.nodeSpacing ?? (preset === "compact" ? 32 : 52);
    layerSpacing = preset === "compact" ? 48 : 76;
    groupPadding = 36;
  } else if (model.diagram_type === "file_dependency" || model.diagram_type === "module_dependency") {
    nodeSpacing = options.nodeSpacing ?? (preset === "compact" ? 24 : 44);
    layerSpacing = preset === "compact" ? 36 : 60;
    groupPadding = 32;
  } else if (preset === "compact") {
    nodeSpacing = 24;
    layerSpacing = 36;
    groupPadding = 20;
  } else if (preset === "spacious") {
    nodeSpacing = 60;
    layerSpacing = 80;
    groupPadding = 40;
  }

  // Top padding must clear the group header bar (~42px) with comfortable breathing room
  const groupPaddingTop = Math.max(groupPadding + 44, 76);

  // 1. Validate endpoints and detect dense graph for adaptive layout optimizations
  const validNodeIds = new Set<string>();
  for (const node of model.nodes) {
    validNodeIds.add(node.id);
  }
  for (const group of model.groups) {
    validNodeIds.add(group.id);
  }

  const validEdges = model.edges.filter(
    (edge) => validNodeIds.has(edge.from) && validNodeIds.has(edge.to) && edge.from !== edge.to
  );

  // Fallback / optimization: For large/dense graphs (>300 edges or >100 nodes),
  // crossing minimization dominates runtime. Disabling crossing minimization (NONE) keeps
  // layered hierarchy & orthogonal routing while bringing layout time under 1.5s.
  const isDenseGraph = validEdges.length > 300 || model.nodes.length > 100;

  // Build lookup of groups
  const groupChildrenMap = new Map<string, any[]>();
  for (const group of model.groups) {
    groupChildrenMap.set(group.id, []);
  }

  const rootChildren: any[] = [];
  const externalChildren: any[] = [];
  const allExternalNodes = model.nodes.filter((n) => n.kind === "external" && !n.group_id);
  const shouldGroupExternals = allExternalNodes.length > 3;

  for (const node of model.nodes) {
    const size = getNodeSizeForKind(node.kind);
    const w = node.width > 0 ? node.width : size.width;
    const h = node.height > 0 ? node.height : size.height;

    // Allocate sufficient layout footprint in ELK for styled cards without clipping
    let minW = 210;
    let minH = 64;
    if (model.diagram_type === "er_diagram") {
      minW = 240;
      minH = Math.max(h, 72);
    } else if (model.diagram_type === "system_flow") {
      minW = 230;
      minH = Math.max(h, 68);
    }

    const footprintW = Math.max(w, minW);
    const footprintH = Math.max(h, minH);

    const elkNode = {
      id: node.id,
      width: footprintW,
      height: footprintH,
      labels: [{ text: node.label }],
    };

    if (node.group_id && groupChildrenMap.has(node.group_id)) {
      groupChildrenMap.get(node.group_id)!.push(elkNode);
    } else if (node.kind === "external" && shouldGroupExternals) {
      externalChildren.push(elkNode);
    } else {
      rootChildren.push(elkNode);
    }
  }

  // Check if graph has compound hierarchy (contains sub-groups or grouped externals)
  const hasCompoundHierarchy = model.groups.length > 0 || externalChildren.length > 0;

  // Critical fix for ELK hierarchy-aware processor:
  // ELK layered layout with "elk.hierarchyHandling": "INCLUDE_CHILDREN" does not support
  // "LAYER_SWEEP" crossing minimization on compound graphs with cross-hierarchy edges,
  // throwing UnsupportedGraphException. For compound graphs, we use INTERACTIVE (or NONE for dense graphs).
  const crossingStrategy = isDenseGraph
    ? "NONE"
    : hasCompoundHierarchy
    ? "INTERACTIVE"
    : "LAYER_SWEEP";

  if (externalChildren.length > 0) {
    rootChildren.push({
      id: "group:layer:external",
      labels: [{ text: "External Dependencies" }],
      children: externalChildren,
      layoutOptions: {
        "elk.padding": "[top=30,left=16,bottom=16,right=16]",
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.aspectRatio": "1.4",
        "elk.spacing.nodeNode": "16",
        "elk.layered.spacing.nodeNodeBetweenLayers": "24",
      },
    });
  }

  // Sort groups in layered top-to-bottom order: frontend, shared, backend, data, external
  function getGroupLayerOrder(labelOrId: string): number {
    const l = labelOrId.toLowerCase();
    if (l.includes("front") || l.includes("ui") || l.includes("client") || l.includes("view")) return 1;
    if (l.includes("share") || l.includes("util") || l.includes("common") || l.includes("lib")) return 2;
    if (l.includes("back") || l.includes("server") || l.includes("api") || l.includes("service")) return 3;
    if (l.includes("data") || l.includes("db") || l.includes("model") || l.includes("store")) return 4;
    if (l.includes("extern") || l.includes("pkg") || l.includes("vendor")) return 5;
    return 6;
  }

  const sortedGroups = [...model.groups].sort(
    (a, b) => getGroupLayerOrder(a.label || a.id) - getGroupLayerOrder(b.label || b.id)
  );

  // Add group nodes to rootChildren (skip if already added as a node)
  const existingIds = new Set(rootChildren.map((c) => c.id));
  for (const group of sortedGroups) {
    if (existingIds.has(group.id)) {
      continue;
    }
    const children = groupChildrenMap.get(group.id) ?? [];
    rootChildren.push({
      id: group.id,
      labels: [{ text: group.label }],
      children,
      layoutOptions: {
        "elk.padding": `[top=${groupPaddingTop},left=${groupPadding},bottom=${groupPadding},right=${groupPadding}]`,
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.separateConnectedComponents": "false",
        "elk.spacing.componentComponent": "32",
        "elk.spacing.nodeNode": String(nodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
        "elk.layered.thoroughness": "1",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
        "elk.layered.crossingMinimization.strategy": isDenseGraph ? "NONE" : "INTERACTIVE",
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      },
    });
    existingIds.add(group.id);
  }

  // 2. Build ELK edges: deduplicate multiple parallel edges between the same (from, to) nodes
  // so ELK doesn't blow up edge spacing channels into huge parallel stripes across the canvas
  const uniqueElkPairs = new Map<string, { id: string; from: string; to: string }>();
  for (const edge of validEdges) {
    const pairKey = `${edge.from}->${edge.to}`;
    if (!uniqueElkPairs.has(pairKey)) {
      uniqueElkPairs.set(pairKey, { id: edge.id, from: edge.from, to: edge.to });
    }
  }

  const elkEdges = Array.from(uniqueElkPairs.values()).map((edge) => ({
    id: edge.id,
    sources: [edge.from],
    targets: [edge.to],
  }));

  // 3. Assemble root ELK graph
  const rootGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      "elk.aspectRatio": model.diagram_type === "er_diagram" ? "1.3" : "1.6",
      "elk.separateConnectedComponents": "false",
      "elk.spacing.componentComponent": "48",
      "elk.spacing.nodeNode": String(nodeSpacing),
      "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeEdge": "16",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.thoroughness": "2",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      "elk.layered.crossingMinimization.strategy": crossingStrategy,
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
      "org.eclipse.elk.randomSeed": "1",
    },
    children: rootChildren,
    edges: elkEdges,
  };

  // 4. Run ELK layout with resilient fallback
  let elkResult: any;
  try {
    elkResult = await elk.layout(rootGraph);
  } catch (layoutError) {
    console.warn(
      `[BuildBuddy Diagram Layout] ELK layout failed for ${model.diagram_type} (${model.nodes.length} nodes, ${model.edges.length} edges). Gracefully falling back to stratified rank layout. Error:`,
      layoutError
    );
    return computeStratifiedFallbackLayout(model, {
      direction: direction === "RIGHT" ? "RIGHT" : "DOWN",
      nodeSpacingX: nodeSpacing,
      nodeSpacingY: layerSpacing,
    });
  }

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
      const size = getNodeSizeForKind(origNode.kind);
      const finalW = origNode.width && origNode.width > 0 ? origNode.width : size.width;
      const finalH = origNode.height && origNode.height > 0 ? origNode.height : size.height;
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

  function collectAllEdges(elkContainer: any) {
    if (!elkContainer) return;
    if (elkContainer.edges) {
      collectEdgeSections(elkContainer.edges);
    }
    if (elkContainer.children) {
      for (const child of elkContainer.children) {
        collectAllEdges(child);
      }
    }
  }

  collectAllEdges(elkResult);

  // Position lookup for fallback routing
  const nodePosMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of positionedNodes) {
    nodePosMap.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height });
  }
  for (const g of positionedGroups) {
    nodePosMap.set(g.id, { x: g.x, y: g.y, w: g.width, h: g.height });
  }

  const positionedEdges: PositionedEdge[] = model.edges.map((edge) => {
    const pairKey = `${edge.from}->${edge.to}`;
    const primaryEdgeId = uniqueElkPairs.get(pairKey)?.id;
    const points = (primaryEdgeId ? edgePointsMap.get(primaryEdgeId) : edgePointsMap.get(edge.id)) ?? [];
    return {
      ...edge,
      points,
    };
  });

  // Sort deterministically
  positionedNodes.sort((a, b) => a.id.localeCompare(b.id));
  positionedEdges.sort((a, b) => a.id.localeCompare(b.id));
  positionedGroups.sort((a, b) => a.id.localeCompare(b.id));

  // Safety check: if for any unexpected reason ELK returned an empty node list when nodes were provided
  if (positionedNodes.length === 0 && model.nodes.length > 0) {
    return computeStratifiedFallbackLayout(model, {
      direction: direction === "RIGHT" ? "RIGHT" : "DOWN",
      nodeSpacingX: nodeSpacing,
      nodeSpacingY: layerSpacing,
    });
  }

  return {
    diagram_type: model.diagram_type,
    nodes: positionedNodes,
    edges: positionedEdges,
    groups: positionedGroups,
    width: (elkResult as any).width ?? 800,
    height: (elkResult as any).height ?? 600,
  };
}
