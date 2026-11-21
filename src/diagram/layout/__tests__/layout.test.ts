import { describe, expect, it, vi } from "vitest";
import type {
  DiagramModel,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  PositionedModel,
} from "../../../types/diagram";
import { getNodeSizeForKind } from "../../../types/diagram";
import { layout } from "../engine";
import { LayoutWorkerClient } from "../index";
import callsTsClassDiagram from "../../../../fixtures/calls-ts/expected-class-diagram.json";

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
        evidence_key: "src/index.ts:1-1:import_stmt",
      },
      {
        id: "e2",
        from: "file:src/index.ts",
        to: "file:src/components/button.ts",
        relationship: "import",
        confidence: "static",
        evidence_id: 2,
        evidence_key: "src/index.ts:2-2:import_stmt",
      },
      {
        id: "e3",
        from: "file:src/components/modal.ts",
        to: "file:src/components/button.ts",
        relationship: "import",
        confidence: "static",
        evidence_id: 3,
        evidence_key: "src/components/modal.ts:1-1:import_stmt",
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

  it("positions nodes in group with 0 edges without overlapping group header", async () => {
    const zeroEdgeModel: DiagramModel = {
      diagram_type: "file_dependency",
      nodes: [
        { id: "f1", kind: "file", label: "README.md", group_id: "g:root", width: 180, height: 40 },
        { id: "f2", kind: "file", label: "RUNTIME_OPERATIONS.md", group_id: "g:root", width: 180, height: 40 },
        { id: "f3", kind: "file", label: "docker-compose.yml", group_id: "g:root", width: 180, height: 40 },
        { id: "f4", kind: "file", label: "package.json", group_id: "g:root", width: 180, height: 40 },
      ],
      groups: [
        { id: "g:root", label: "Project Root", collapsed: false },
      ],
      edges: [],
    };
    const positioned = await layout(zeroEdgeModel);
    const group = positioned.groups[0];
    expect(group).toBeDefined();
    for (const node of positioned.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(group.y + 56);
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

  it("layout executes on real builder output (calls-ts class diagram) without overlaps and with valid routes", async () => {
    const classModel = callsTsClassDiagram as unknown as DiagramModel;
    const positioned = await layout(classModel);

    expect(positioned.nodes.length).toBe(classModel.nodes.length);
    expect(positioned.edges.length).toBe(classModel.edges.length);

    // Verify no overlaps
    for (let i = 0; i < positioned.nodes.length; i++) {
      for (let j = i + 1; j < positioned.nodes.length; j++) {
        const a = positioned.nodes[i];
        const b = positioned.nodes[j];

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
          `Nodes ${a.id} and ${b.id} should not overlap in real class diagram layout`
        ).toBe(false);
      }
    }

    // Verify all edges routed
    for (const edge of positioned.edges) {
      expect(edge.points).toBeDefined();
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of edge.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("measured test: layout of 150-node / ~450-edge file graph", async () => {
    const nodeCount = 150;
    const nodes: DiagramNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: `file:src/file_${i}.ts`,
        kind: "file",
        label: `file_${i}.ts`,
        width: 180,
        height: 40,
      });
    }

    const edges: DiagramEdge[] = [];
    let edgeId = 0;
    // Exactly 3 edges per node -> 450 edges
    for (let i = 0; i < nodeCount; i++) {
      const src = `file:src/file_${i}.ts`;
      const t1 = `file:src/file_${(i + 1) % nodeCount}.ts`;
      const t2 = `file:src/file_${(i + 3) % nodeCount}.ts`;
      const t3 = `file:src/file_${(i + 7) % nodeCount}.ts`;

      edges.push({
        id: `edge:${++edgeId}`,
        from: src,
        to: t1,
        relationship: "import",
        confidence: "static",
        evidence_id: edgeId,
        evidence_key: `src/file_${i}.ts:1-1:import_stmt`,
      });
      edges.push({
        id: `edge:${++edgeId}`,
        from: src,
        to: t2,
        relationship: "import",
        confidence: "static",
        evidence_id: edgeId,
        evidence_key: `src/file_${i}.ts:2-2:import_stmt`,
      });
      edges.push({
        id: `edge:${++edgeId}`,
        from: src,
        to: t3,
        relationship: "import",
        confidence: "static",
        evidence_id: edgeId,
        evidence_key: `src/file_${i}.ts:3-3:import_stmt`,
      });
    }

    expect(nodes.length).toBe(150);
    expect(edges.length).toBe(450);

    const model: DiagramModel = {
      diagram_type: "file_dependency",
      nodes,
      edges,
      groups: [],
    };

    const startTime = performance.now();
    const positioned = await layout(model);
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    console.log(
      `[MEASURED PERF] 150-node / 450-edge file graph layout completed in: ${durationMs.toFixed(2)} ms`
    );

    expect(positioned.nodes.length).toBe(150);
    expect(positioned.edges.length).toBe(450);
    expect(durationMs).toBeLessThan(15000);
  }, 20000);

  it("measured test: layout of drill_down result of one 100-node group", async () => {
    const nodeCount = 100;
    const groupId = "group:dir:src/services";
    const nodes: DiagramNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: `file:src/services/service_${i}.ts`,
        kind: "file",
        label: `service_${i}.ts`,
        group_id: groupId,
        width: 180,
        height: 40,
      });
    }

    // ~200 internal edges within this group
    const edges: DiagramEdge[] = [];
    let edgeId = 0;
    for (let i = 0; i < nodeCount; i++) {
      const src = `file:src/services/service_${i}.ts`;
      const t1 = `file:src/services/service_${(i + 1) % nodeCount}.ts`;
      const t2 = `file:src/services/service_${(i + 4) % nodeCount}.ts`;

      edges.push({
        id: `edge:${++edgeId}`,
        from: src,
        to: t1,
        relationship: "import",
        confidence: "static",
        evidence_id: edgeId,
        evidence_key: `src/services/service_${i}.ts:1-1:import_stmt`,
      });
      edges.push({
        id: `edge:${++edgeId}`,
        from: src,
        to: t2,
        relationship: "import",
        confidence: "static",
        evidence_id: edgeId,
        evidence_key: `src/services/service_${i}.ts:2-2:import_stmt`,
      });
    }

    expect(nodes.length).toBe(100);
    expect(edges.length).toBe(200);

    const model: DiagramModel = {
      diagram_type: "file_dependency",
      nodes,
      edges,
      groups: [
        {
          id: groupId,
          label: "src/services",
          collapsed: false,
        },
      ],
    };

    const startTime = performance.now();
    const positioned = await layout(model);
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    console.log(
      `[MEASURED PERF] 100-node group drill_down layout completed in: ${durationMs.toFixed(2)} ms`
    );

    expect(positioned.nodes.length).toBe(100);
    expect(positioned.edges.length).toBe(200);
    expect(durationMs).toBeLessThan(10000);
  }, 20000);

  it("performance test: synthetic 2,000-node / 6,000-edge graph produces collapsed overview layout", async () => {
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
          evidence_key: `file:mod_${m}_file_${n}.ts:1-1:import_stmt`,
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
          evidence_key: `file:mod_${m}_file_${n}.ts:2-2:import_stmt`,
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
          evidence_key: `file:mod_${m}_file_${n}.ts:3-3:call_site`,
        });
      }
    }

    expect(syntheticNodes.length).toBe(2000);
    expect(syntheticEdges.length).toBe(6000);

    const overviewNodes: DiagramNode[] = syntheticGroups.map((g) => ({
      id: g.id,
      kind: "module",
      label: g.label,
      width: 200,
      height: 50,
    }));

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
        evidence_key: `${val.from}->${val.to}:aggregated`,
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
      `[MEASURED PERF] 2,000-node / 6,000-edge graph collapsed overview layout completed in: ${durationMs.toFixed(2)} ms`
    );

    expect(positionedOverview.nodes.length).toBe(overviewNodes.length);
    expect(positionedOverview.edges.length).toBe(overviewEdges.length);
    expect(durationMs).toBeLessThan(10000);
  }, 20000);
});

describe("LayoutWorkerClient lifecycle & cancellation", () => {
  function createMockWorker(): Worker & {
    postMessageMock: ReturnType<typeof vi.fn>;
    terminateMock: ReturnType<typeof vi.fn>;
  } {
    const postMessageMock = vi.fn();
    const terminateMock = vi.fn();

    const workerObj = {
      onmessage: null as any,
      postMessage: postMessageMock,
      terminate: terminateMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onerror: null as any,
      postMessageMock,
      terminateMock,
    };

    return workerObj as unknown as Worker & {
      postMessageMock: ReturnType<typeof vi.fn>;
      terminateMock: ReturnType<typeof vi.fn>;
    };
  }

  it("handles successful layout request via worker", async () => {
    let mockWorkerInstance: ReturnType<typeof createMockWorker> | null = null;
    const workerFactory = () => {
      mockWorkerInstance = createMockWorker();
      return mockWorkerInstance;
    };

    const client = new LayoutWorkerClient(workerFactory);
    const testModel: DiagramModel = {
      diagram_type: "file_dependency",
      nodes: [],
      edges: [],
      groups: [],
    };

    const calculation = client.calculate(testModel);

    expect(mockWorkerInstance).not.toBeNull();
    expect(mockWorkerInstance!.postMessageMock).toHaveBeenCalledTimes(1);
    const sentReq = mockWorkerInstance!.postMessageMock.mock.calls[0][0];
    expect(sentReq.type).toBe("layout");

    const mockPositioned: PositionedModel = {
      diagram_type: "file_dependency",
      nodes: [],
      edges: [],
      groups: [],
      width: 500,
      height: 400,
    };

    // Simulate worker reply
    if (mockWorkerInstance && (mockWorkerInstance as any).onmessage) {
      (mockWorkerInstance as any).onmessage({
        data: {
          type: "success",
          id: sentReq.id,
          model: mockPositioned,
        },
      } as MessageEvent);
    }

    const result = await calculation.promise;
    expect(result.width).toBe(500);
    expect(result.height).toBe(400);
  });

  it("cancellation terminates the worker thread and spawns a fresh worker instance", async () => {
    let workerSpawns = 0;
    const workerInstances: ReturnType<typeof createMockWorker>[] = [];

    const workerFactory = () => {
      workerSpawns++;
      const instance = createMockWorker();
      workerInstances.push(instance);
      return instance;
    };

    const client = new LayoutWorkerClient(workerFactory);
    expect(workerSpawns).toBe(1);

    const testModel: DiagramModel = {
      diagram_type: "file_dependency",
      nodes: [],
      edges: [],
      groups: [],
    };

    const calculation = client.calculate(testModel);
    const activeWorker = workerInstances[0];

    // Trigger cancellation
    calculation.cancel();

    // Verify terminate() was called to immediately halt CPU execution
    expect(activeWorker.terminateMock).toHaveBeenCalledTimes(1);

    // Verify fresh worker was re-initialized for subsequent calculations
    expect(workerSpawns).toBe(2);

    // Verify the promise was rejected with cancellation reason
    await expect(calculation.promise).rejects.toThrow("Layout calculation was cancelled");
  });

  it("handles worker error responses properly", async () => {
    let mockWorkerInstance: ReturnType<typeof createMockWorker> | null = null;
    const workerFactory = () => {
      mockWorkerInstance = createMockWorker();
      return mockWorkerInstance;
    };

    const client = new LayoutWorkerClient(workerFactory);
    const testModel: DiagramModel = {
      diagram_type: "file_dependency",
      nodes: [],
      edges: [],
      groups: [],
    };

    const calculation = client.calculate(testModel);
    const sentReq = mockWorkerInstance!.postMessageMock.mock.calls[0][0];

    // Simulate worker error
    if (mockWorkerInstance && (mockWorkerInstance as any).onmessage) {
      (mockWorkerInstance as any).onmessage({
        data: {
          type: "error",
          id: sentReq.id,
          error: "ELK parsing error in graph structure",
        },
      } as MessageEvent);
    }

    await expect(calculation.promise).rejects.toThrow("ELK parsing error in graph structure");
  });
});
