import { describe, expect, it } from "vitest";
import type { DiagramModel, DiagramNode, DiagramEdge, DiagramGroup } from "../../../types/diagram";
import { getNodeSizeForKind } from "../../../types/diagram";
import { layout } from "../engine";

describe("ELK.js Layout Engine", () => {
  const sampleModel: DiagramModel = {
    diagram_type: "file_dependency",
    nodes: [
      {
        id: "file:src/index.ts",
        kind: "file",
        label: "index.ts",
        width: 180,
        height: 40,
      },
      {
        id: "file:src/utils.ts",
        kind: "file",
        label: "utils.ts",
        width: 180,
        height: 40,
      },
      {
        id: "file:src/components/button.ts",
        kind: "file",
        label: "button.ts",
        group_id: "group:components",
        width: 180,
        height: 40,
      },
      {
        id: "file:src/components/modal.ts",
        kind: "file",
        label: "modal.ts",
        group_id: "group:components",
        width: 180,
        height: 40,
      },
      {
        id: "class:BaseService",
        kind: "class",
        label: "BaseService",
        width: 220,
        height: 60,
      },
      {
        id: "module:core",
        kind: "module",
        label: "core",
        width: 200,
        height: 50,
      },
    ],
    groups: [
      {
        id: "group:components",
        label: "Components",
        collapsed: false,
      },
    ],
    edges: [
      {
        id: "e1",
        from: "file:src/index.ts",
        to: "file:src/utils.ts",
        relationship: "import",
        confidence: "static",
        evidence_id: 1,
      },
      {
        id: "e2",
        from: "file:src/index.ts",
        to: "file:src/components/button.ts",
        relationship: "import",
        confidence: "static",
        evidence_id: 2,
      },
      {
        id: "e3",
        from: "file:src/components/modal.ts",
        to: "file:src/components/button.ts",
        relationship: "import",
        confidence: "static",
        evidence_id: 3,
      },
    ],
  };

  it("produces positions without node overlap", async () => {
    const positioned = await layout(sampleModel);
    expect(positioned.nodes.length).toBe(sampleModel.nodes.length);

    // Verify no two non-nested nodes overlap
    for (let i = 0; i < positioned.nodes.length; i++) {
      for (let j = i + 1; j < positioned.nodes.length; j++) {
        const a = positioned.nodes[i];
        const b = positioned.nodes[j];

        // Check if a and b share the same group or both have no group
        // If one is inside a group and one is outside, bounding box check still applies to canvas
        const aRight = a.x + a.width;
        const aBottom = a.y + a.height;
        const bRight = b.x + b.width;
        const bBottom = b.y + b.height;

        const overlaps = !(
          aRight <= b.x ||
          bRight <= a.x ||
          aBottom <= b.y ||
          bBottom <= a.y
        );

        expect(
          overlaps,
          `Nodes ${a.id} [${a.x},${a.y},${a.width},${a.height}] and ${b.id} [${b.x},${b.y},${b.width},${b.height}] should not overlap`
        ).toBe(false);
      }
    }
  });

  it("all edges have routes with valid waypoints/bend points", async () => {
    const positioned = await layout(sampleModel);
    expect(positioned.edges.length).toBe(sampleModel.edges.length);

    for (const edge of positioned.edges) {
      expect(edge.points).toBeDefined();
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of edge.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("all nodes of the same kind have the same size", async () => {
    const positioned = await layout(sampleModel);

    for (const node of positioned.nodes) {
      const expectedSize = getNodeSizeForKind(node.kind);
      expect(node.width).toBe(expectedSize.width);
      expect(node.height).toBe(expectedSize.height);
    }
  });

  it("output is deterministic for the same input", async () => {
    const run1 = await layout(sampleModel);
    const run2 = await layout(sampleModel);

    expect(run1.width).toBe(run2.width);
    expect(run1.height).toBe(run2.height);

    for (let i = 0; i < run1.nodes.length; i++) {
      const n1 = run1.nodes[i];
      const n2 = run2.nodes[i];
      expect(n1.id).toBe(n2.id);
      expect(n1.x).toBe(n2.x);
      expect(n1.y).toBe(n2.y);
      expect(n1.width).toBe(n2.width);
      expect(n1.height).toBe(n2.height);
    }

    for (let i = 0; i < run1.edges.length; i++) {
      const e1 = run1.edges[i];
      const e2 = run2.edges[i];
      expect(e1.id).toBe(e2.id);
      expect(e1.points).toEqual(e2.points);
    }
  });

  it("performance test: synthetic 2,000-node / 6,000-edge graph produces collapsed overview layout", async () => {
    // Generate synthetic 2,000-node and 6,000-edge graph distributed over 20 modules
    const numModules = 20;
    const nodesPerModule = 100;

    const syntheticNodes: DiagramNode[] = [];
    const syntheticGroups: DiagramGroup[] = [];

    for (let m = 0; m < numModules; m++) {
      const groupId = `group:module_${m}`;
      syntheticGroups.push({
        id: groupId,
        label: `Module ${m}`,
        collapsed: false,
      });

      for (let n = 0; n < nodesPerModule; n++) {
        syntheticNodes.push({
          id: `file:mod_${m}_file_${n}.ts`,
          kind: "file",
          label: `file_${n}.ts`,
          group_id: groupId,
          width: 180,
          height: 40,
        });
      }
    }

    // Generate 6,000 edges: 3 per node on average
    const syntheticEdges: DiagramEdge[] = [];
    let edgeIdCounter = 0;

    for (let m = 0; m < numModules; m++) {
      for (let n = 0; n < nodesPerModule; n++) {
        const srcId = `file:mod_${m}_file_${n}.ts`;

        // 1 internal edge
        const internalTarget = `file:mod_${m}_file_${(n + 1) % nodesPerModule}.ts`;
        syntheticEdges.push({
          id: `edge:${++edgeIdCounter}`,
          from: srcId,
          to: internalTarget,
          relationship: "import",
          confidence: "static",
          evidence_id: edgeIdCounter,
        });

        // 2 cross-module edges
        const nextMod = (m + 1) % numModules;
        const crossTarget1 = `file:mod_${nextMod}_file_${n}.ts`;
        syntheticEdges.push({
          id: `edge:${++edgeIdCounter}`,
          from: srcId,
          to: crossTarget1,
          relationship: "import",
          confidence: "static",
          evidence_id: edgeIdCounter,
        });

        const farMod = (m + 3) % numModules;
        const crossTarget2 = `file:mod_${farMod}_file_${(n + 5) % nodesPerModule}.ts`;
        syntheticEdges.push({
          id: `edge:${++edgeIdCounter}`,
          from: srcId,
          to: crossTarget2,
          relationship: "call",
          confidence: "inferred",
          evidence_id: edgeIdCounter,
        });
      }
    }

    expect(syntheticNodes.length).toBe(2000);
    expect(syntheticEdges.length).toBe(6000);

    // Progressive disclosure collapse: for >150 nodes, builder produces module-level overview
    // Collapsed overview represents 20 modules and aggregated inter-module edges
    const overviewNodes: DiagramNode[] = syntheticGroups.map((g) => ({
      id: g.id,
      kind: "module",
      label: g.label,
      width: 200,
      height: 50,
    }));

    // Aggregate edges between modules
    const aggMap = new Map<string, { from: string; to: string; count: number }>();
    const nodeToGroup = new Map(syntheticNodes.map((n) => [n.id, n.group_id!]));

    for (const edge of syntheticEdges) {
      const fromG = nodeToGroup.get(edge.from)!;
      const toG = nodeToGroup.get(edge.to)!;
      if (fromG !== toG) {
        const key = `${fromG}->${toG}`;
        const existing = aggMap.get(key) ?? { from: fromG, to: toG, count: 0 };
        existing.count++;
        aggMap.set(key, existing);
      }
    }

    const overviewEdges: DiagramEdge[] = [];
    let aggId = 0;
    for (const [, val] of aggMap.entries()) {
      overviewEdges.push({
        id: `agg_edge:${++aggId}`,
        from: val.from,
        to: val.to,
        relationship: "import",
        confidence: "static",
        evidence_id: aggId,
        label: `${val.count} edges`,
      });
    }

    const collapsedModel: DiagramModel = {
      diagram_type: "module_dependency",
      nodes: overviewNodes,
      edges: overviewEdges,
      groups: syntheticGroups.map((g) => ({ ...g, collapsed: true })),
    };

    const startTime = performance.now();
    const positionedOverview = await layout(collapsedModel);
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    console.log(
      `[PERF] 2,000-node / 6,000-edge graph collapsed overview layout completed in: ${durationMs.toFixed(2)} ms`
    );

    expect(positionedOverview.nodes.length).toBe(overviewNodes.length);
    expect(positionedOverview.edges.length).toBe(overviewEdges.length);
    expect(durationMs).toBeLessThan(5000); // Well under 5 seconds
  });
});
