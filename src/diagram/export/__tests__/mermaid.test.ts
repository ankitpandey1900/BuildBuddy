import { describe, expect, it } from "vitest";
import type { DiagramModel } from "../../../types/diagram";
import { exportToMermaid, sanitizeMermaidId } from "../mermaid";

describe("Mermaid Diagram Export", () => {
  const smallModel: DiagramModel = {
    diagram_type: "file_dependency",
    groups: [
      {
        id: "group:src/ui",
        label: "UI Components",
        collapsed: false,
      },
    ],
    nodes: [
      {
        id: "file:src/index.ts",
        kind: "file",
        label: "index.ts",
        width: 180,
        height: 40,
      },
      {
        id: "file:src/ui/Button.tsx",
        kind: "component",
        label: "Button.tsx",
        group_id: "group:src/ui",
        width: 200,
        height: 50,
      },
      {
        id: "class:BaseService",
        kind: "class",
        label: "BaseService",
        width: 220,
        height: 60,
      },
      {
        id: "module:api",
        kind: "module",
        label: "API Layer",
        width: 200,
        height: 50,
      },
      {
        id: "external:react",
        kind: "external",
        label: "react",
        width: 160,
        height: 40,
      },
    ],
    edges: [
      {
        id: "e1",
        from: "file:src/index.ts",
        to: "file:src/ui/Button.tsx",
        relationship: "import",
        confidence: "static",
        evidence_id: 1,
        evidence_key: "src/index.ts:1-1:import_stmt",
        label: "import",
      },
      {
        id: "e2",
        from: "file:src/ui/Button.tsx",
        to: "external:react",
        relationship: "declared_dependency",
        confidence: "static",
        evidence_id: 2,
        evidence_key: "package.json:10-10:manifest_entry",
        label: "react",
      },
      {
        id: "e3",
        from: "file:src/index.ts",
        to: "class:BaseService",
        relationship: "call",
        confidence: "inferred",
        evidence_id: 3,
        evidence_key: "src/index.ts:5-5:call_site",
        label: "startService",
      },
    ],
  };

  const expectedMermaidOutput = `graph TD
    subgraph group_src_ui ["UI Components"]
        file_src_ui_Button_tsx[["Button.tsx"]]
    end
    class_BaseService["[class] BaseService"]
    external_react{{"react"}}
    file_src_index_ts["index.ts"]
    module_api(["API Layer"])
    file_src_index_ts -->|import| file_src_ui_Button_tsx
    file_src_ui_Button_tsx -.->|react| external_react
    file_src_index_ts -.->|startService [inferred]| class_BaseService`;

  it("exports small model matching committed expected string", () => {
    const result = exportToMermaid(smallModel, { direction: "TD" });
    expect(result).toBe(expectedMermaidOutput);
  });

  it("sanitizes node IDs correctly for Mermaid identifiers", () => {
    expect(sanitizeMermaidId("file:src/components/Header.tsx")).toBe(
      "file_src_components_Header_tsx"
    );
    expect(sanitizeMermaidId("group:dir:@core/utils")).toBe("group_dir__core_utils");
  });

  it("renders inferred edges with dashed style and [inferred] text label", () => {
    const modelWithInferred: DiagramModel = {
      diagram_type: "architecture_overview",
      groups: [],
      nodes: [
        { id: "mod:a", kind: "module", label: "Module A", width: 200, height: 50 },
        { id: "mod:b", kind: "module", label: "Module B", width: 200, height: 50 },
      ],
      edges: [
        {
          id: "e_inf",
          from: "mod:a",
          to: "mod:b",
          relationship: "call",
          confidence: "inferred",
          evidence_id: 99,
          evidence_key: "a.ts:10-10:call_site",
        },
      ],
    };

    const output = exportToMermaid(modelWithInferred);
    expect(output).toContain("-.->");
    expect(output).toContain("[inferred]");
  });
});

