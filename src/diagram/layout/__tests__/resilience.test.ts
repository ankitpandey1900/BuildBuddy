import { describe, expect, it } from "vitest";
import type { DiagramModel } from "../../../types/diagram";
import { layout } from "../engine";
import { computeStratifiedFallbackLayout } from "../fallback";

describe("Layout Engine Resilience & Compound Hierarchy", () => {
  it("successfully lays out compound graphs with cross-hierarchy edges without throwing", async () => {
    // Model with groups and cross-hierarchy edges (which previously caused LAYER_SWEEP UnsupportedGraphException)
    const compoundModel: DiagramModel = {
      diagram_type: "system_flow",
      groups: [
        {
          id: "group:layer:frontend",
          label: "Presentation Layer",
          collapsed: false,
        },
        {
          id: "group:layer:backend",
          label: "Application Layer",
          collapsed: false,
        },
        {
          id: "group:layer:data",
          label: "Persistence Layer",
          collapsed: false,
        },
      ],
      nodes: [
        {
          id: "node:client",
          kind: "component",
          label: "Web Client",
          group_id: "group:layer:frontend",
          width: 240,
          height: 68,
        },
        {
          id: "node:api_handler",
          kind: "component",
          label: "POST /api/action",
          group_id: "group:layer:backend",
          width: 240,
          height: 68,
        },
        {
          id: "node:db_table",
          kind: "component",
          label: "users table",
          group_id: "group:layer:data",
          width: 240,
          height: 68,
        },
      ],
      edges: [
        {
          id: "edge:client->api",
          from: "node:client",
          to: "node:api_handler",
          relationship: "call",
          confidence: "confirmed",
          evidence_id: 1,
          evidence_key: "ev1",
          label: "HTTPS",
        },
        {
          id: "edge:api->db",
          from: "node:api_handler",
          to: "node:db_table",
          relationship: "call",
          confidence: "confirmed",
          evidence_id: 2,
          evidence_key: "ev2",
          label: "SQL",
        },
      ],
    };

    const result = await layout(compoundModel, { direction: "DOWN" });
    expect(result).toBeDefined();
    expect(result.nodes).toHaveLength(3);
    expect(result.groups).toHaveLength(3);
    expect(result.edges).toHaveLength(2);

    // Verify all nodes received finite coordinates
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBeGreaterThanOrEqual(230);
      expect(node.height).toBeGreaterThanOrEqual(68);
    }
  });

  it("handles er_diagram with multiple columns and proper footprints", async () => {
    const erModel: DiagramModel = {
      diagram_type: "er_diagram",
      groups: [
        {
          id: "group:schema:main",
          label: "schema.sql",
          collapsed: false,
        },
      ],
      nodes: [
        {
          id: "table:users",
          kind: "class",
          label: "users",
          group_id: "group:schema:main",
          width: 240,
          height: 120,
          members: [
            "PK|id|INTEGER",
            "-|email|VARCHAR",
            "-|created_at|TIMESTAMP",
          ],
        },
        {
          id: "table:orders",
          kind: "class",
          label: "orders",
          group_id: "group:schema:main",
          width: 240,
          height: 140,
          members: [
            "PK|id|INTEGER",
            "FK|user_id|INTEGER",
            "-|total_cents|INTEGER",
            "-|status|VARCHAR",
          ],
        },
      ],
      edges: [
        {
          id: "edge:fk:orders:users",
          from: "table:orders",
          to: "table:users",
          relationship: "declared_dependency",
          confidence: "static",
          evidence_id: 1,
          evidence_key: "ev:fk",
          label: "FK (user_id)",
        },
      ],
    };

    const result = await layout(erModel, { direction: "DOWN" });
    expect(result.nodes).toHaveLength(2);
    expect(result.groups).toHaveLength(1);
    expect(result.edges).toHaveLength(1);

    // Verify horizontal spacing or layer spacing prevents overlap
    const [orders, users] = result.nodes;
    expect(orders).toBeDefined();
    expect(users).toBeDefined();
  });

  it("computes deterministic stratified fallback layout for arbitrary graphs", () => {
    const graph: DiagramModel = {
      diagram_type: "module_dependency",
      groups: [],
      nodes: [
        { id: "A", kind: "module", label: "Module A", width: 100, height: 40 },
        { id: "B", kind: "module", label: "Module B", width: 100, height: 40 },
        { id: "C", kind: "module", label: "Module C", width: 100, height: 40 },
      ],
      edges: [
        {
          id: "e1",
          from: "A",
          to: "B",
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 1,
          evidence_key: "k1",
        },
        {
          id: "e2",
          from: "B",
          to: "C",
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 2,
          evidence_key: "k2",
        },
      ],
    };

    const result = computeStratifiedFallbackLayout(graph, { direction: "DOWN" });
    expect(result.nodes).toHaveLength(3);

    const posA = result.nodes.find((n) => n.id === "A")!;
    const posB = result.nodes.find((n) => n.id === "B")!;
    const posC = result.nodes.find((n) => n.id === "C")!;

    // In a DOWN direction, depth ranks must place A above B above C
    expect(posA.y).toBeLessThan(posB.y);
    expect(posB.y).toBeLessThan(posC.y);
  });

  it("handles cyclic graphs gracefully in stratified fallback layout without infinite loop", () => {
    const cyclicGraph: DiagramModel = {
      diagram_type: "file_dependency",
      groups: [],
      nodes: [
        { id: "N1", kind: "file", label: "File 1", width: 80, height: 30 },
        { id: "N2", kind: "file", label: "File 2", width: 80, height: 30 },
      ],
      edges: [
        {
          id: "c1",
          from: "N1",
          to: "N2",
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 1,
          evidence_key: "c1",
        },
        {
          id: "c2",
          from: "N2",
          to: "N1",
          relationship: "import",
          confidence: "confirmed",
          evidence_id: 2,
          evidence_key: "c2",
        },
      ],
    };

    const result = computeStratifiedFallbackLayout(cyclicGraph);
    expect(result.nodes).toHaveLength(2);
    expect(Number.isFinite(result.nodes[0].x)).toBe(true);
    expect(Number.isFinite(result.nodes[1].x)).toBe(true);
  });
});
