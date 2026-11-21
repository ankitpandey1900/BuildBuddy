/**
 * BuildBuddy Resilient Fallback Layout Engine
 * Provides deterministic, non-crashing topological and stratified rank layouts
 * when native ELK hierarchy processors encounter unsupported subgraphs.
 */

import type {
  DiagramModel,
  PositionedEdge,
  PositionedGroup,
  PositionedModel,
  PositionedNode,
} from "../../types/diagram";
import { getNodeSizeForKind } from "../../types/diagram";

interface FallbackLayoutOptions {
  direction?: "DOWN" | "RIGHT";
  nodeSpacingX?: number;
  nodeSpacingY?: number;
}

/**
 * Computes a deterministic stratified rank layout.
 * Groups nodes into topological ranks based on dependency depth,
 * assigns x/y coordinates, and computes enclosing group bounding boxes.
 */
export function computeStratifiedFallbackLayout(
  model: DiagramModel,
  options: FallbackLayoutOptions = {}
): PositionedModel {
  const isHorizontal = options.direction === "RIGHT";
  const spacingX = options.nodeSpacingX ?? (isHorizontal ? 80 : 50);
  const spacingY = options.nodeSpacingY ?? (isHorizontal ? 50 : 80);

  // 1. Build adjacency graph
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of model.nodes) {
    inDegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }

  for (const edge of model.edges) {
    if (inDegree.has(edge.to) && outEdges.has(edge.from) && edge.from !== edge.to) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      outEdges.get(edge.from)!.push(edge.to);
    }
  }

  // 2. Assign ranks via BFS / longest path from roots (Kahn's-like stratification)
  const nodeRank = new Map<string, number>();
  const queue: { id: string; rank: number }[] = [];

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push({ id, rank: 0 });
      nodeRank.set(id, 0);
    }
  }

  // If graph is a pure cycle or has no root, seed all nodes with rank 0
  if (queue.length === 0) {
    for (const node of model.nodes) {
      queue.push({ id: node.id, rank: 0 });
      nodeRank.set(node.id, 0);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, rank } = queue.shift()!;
    visited.add(id);

    const neighbors = outEdges.get(id) || [];
    for (const nextId of neighbors) {
      const nextRank = Math.max(nodeRank.get(nextId) || 0, rank + 1);
      nodeRank.set(nextId, nextRank);
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, rank: nextRank });
      }
    }
  }

  // 3. Group nodes by rank
  const rankGroups = new Map<number, string[]>();
  for (const node of model.nodes) {
    const r = nodeRank.get(node.id) || 0;
    if (!rankGroups.has(r)) {
      rankGroups.set(r, []);
    }
    rankGroups.get(r)!.push(node.id);
  }

  const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);

  // 4. Position nodes
  const positionedNodes: PositionedNode[] = [];
  const nodePosMap = new Map<string, { x: number; y: number; width: number; height: number }>();

  let currentTierOffset = 40;

  for (const rank of sortedRanks) {
    const nodeIds = rankGroups.get(rank)!;
    // Sort nodes in rank deterministically by label
    nodeIds.sort((a, b) => {
      const nA = model.nodes.find((n) => n.id === a)?.label || a;
      const nB = model.nodes.find((n) => n.id === b)?.label || b;
      return nA.localeCompare(nB);
    });

    let maxBreadthInTier = 0;
    let lateralOffset = 40;

    for (const id of nodeIds) {
      const origNode = model.nodes.find((n) => n.id === id)!;
      const defaultSize = getNodeSizeForKind(origNode.kind);
      const width = origNode.width && origNode.width > 0 ? origNode.width : defaultSize.width;
      const height = origNode.height && origNode.height > 0 ? origNode.height : defaultSize.height;

      const x = isHorizontal ? currentTierOffset : lateralOffset;
      const y = isHorizontal ? lateralOffset : currentTierOffset;

      positionedNodes.push({
        ...origNode,
        x,
        y,
        width,
        height,
      });

      nodePosMap.set(id, { x, y, width, height });

      if (isHorizontal) {
        lateralOffset += height + spacingY;
        maxBreadthInTier = Math.max(maxBreadthInTier, width);
      } else {
        lateralOffset += width + spacingX;
        maxBreadthInTier = Math.max(maxBreadthInTier, height);
      }
    }

    currentTierOffset += maxBreadthInTier + (isHorizontal ? spacingX : spacingY);
  }

  // 5. Compute bounding boxes for groups
  const positionedGroups: PositionedGroup[] = [];
  for (const group of model.groups) {
    const memberNodes = positionedNodes.filter((n) => n.group_id === group.id);
    if (memberNodes.length === 0) {
      positionedGroups.push({
        ...group,
        x: 0,
        y: 0,
        width: 220,
        height: 100,
      });
      continue;
    }

    const padding = 24;
    const paddingTop = 48; // Room for group title header
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of memberNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }

    const gx = minX - padding;
    const gy = minY - paddingTop;
    const gw = maxX - minX + padding * 2;
    const gh = maxY - minY + paddingTop + padding;

    positionedGroups.push({
      ...group,
      x: gx,
      y: gy,
      width: gw,
      height: gh,
    });
  }

  // 6. Generate orthogonal routes for edges
  const positionedEdges: PositionedEdge[] = model.edges.map((edge) => {
    const src = nodePosMap.get(edge.from);
    const tgt = nodePosMap.get(edge.to);

    if (!src || !tgt) {
      return { ...edge, points: [] };
    }

    // Connect from bottom/right of source to top/left of target
    const startX = isHorizontal ? src.x + src.width : src.x + src.width / 2;
    const startY = isHorizontal ? src.y + src.height / 2 : src.y + src.height;
    const endX = isHorizontal ? tgt.x : tgt.x + tgt.width / 2;
    const endY = isHorizontal ? tgt.y + tgt.height / 2 : tgt.y;

    // Simple 3-segment orthogonal routing with mid-point bend
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    const points = isHorizontal
      ? [
          { x: startX, y: startY },
          { x: midX, y: startY },
          { x: midX, y: endY },
          { x: endX, y: endY },
        ]
      : [
          { x: startX, y: startY },
          { x: startX, y: midY },
          { x: endX, y: midY },
          { x: endX, y: endY },
        ];

    return {
      ...edge,
      points,
    };
  });

  return {
    diagram_type: model.diagram_type,
    nodes: positionedNodes,
    edges: positionedEdges,
    groups: positionedGroups,
    width: isHorizontal ? currentTierOffset + 100 : 1200,
    height: isHorizontal ? 900 : currentTierOffset + 100,
  };
}
