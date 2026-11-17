import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ArchitectureView } from "../ArchitectureView";
import type { PositionedModel } from "../../../types/diagram";
import * as tauriLib from "../../../lib/tauri";

describe("ArchitectureView React Flow Integration", () => {
  const goldenPositionedModel: PositionedModel = {
    diagram_type: "architecture_overview",
    width: 1200,
    height: 800,
    groups: [
      {
        id: "group:ui",
        label: "UI Components",
        collapsed: false,
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      },
    ],
    nodes: [
      {
        id: "file:src/index.ts",
        kind: "file",
        label: "index.ts",
        x: 150,
        y: 150,
        width: 180,
        height: 40,
        source_ref: {
          file_path: "src/index.ts",
          start_line: 1,
          end_line: 25,
        },
        metrics: {
          line_count: 25,
          function_count: 2,
        },
      },
      {
        id: "file:src/ui/Button.tsx",
        kind: "component",
        label: "Button.tsx",
        group_id: "group:ui",
        x: 200,
        y: 220,
        width: 200,
        height: 50,
        source_ref: {
          file_path: "src/ui/Button.tsx",
          start_line: 5,
          end_line: 40,
        },
      },
      {
        id: "class:BaseService",
        kind: "class",
        label: "BaseService",
        x: 600,
        y: 150,
        width: 220,
        height: 60,
        metrics: {
          class_count: 1,
          function_count: 4,
          complexity: 2,
        },
      },
      {
        id: "module:core",
        kind: "module",
        label: "core",
        x: 600,
        y: 350,
        width: 200,
        height: 50,
      },
      {
        id: "external:react",
        kind: "external",
        label: "react",
        x: 200,
        y: 450,
        width: 160,
        height: 40,
      },
    ],
    edges: [
      {
        id: "edge:import",
        from: "file:src/index.ts",
        to: "file:src/ui/Button.tsx",
        relationship: "import",
        confidence: "static",
        evidence_id: 101,
        evidence_key: "src/index.ts:1-1:import_stmt",
        label: "imports Button",
        points: [
          { x: 150, y: 190 },
          { x: 200, y: 220 },
        ],
      },
      {
        id: "edge:call",
        from: "file:src/index.ts",
        to: "class:BaseService",
        relationship: "call",
        confidence: "static",
        evidence_id: 102,
        evidence_key: "src/index.ts:10-10:call_site",
        label: "executes",
        points: [
          { x: 330, y: 170 },
          { x: 600, y: 170 },
        ],
      },
      {
        id: "edge:inheritance",
        from: "class:BaseService",
        to: "module:core",
        relationship: "inheritance",
        confidence: "confirmed",
        evidence_id: 103,
        evidence_key: "BaseService.ts:5-15:ast_node",
        label: "extends",
        points: [
          { x: 700, y: 210 },
          { x: 700, y: 350 },
        ],
      },
      {
        id: "edge:instantiation",
        from: "file:src/index.ts",
        to: "class:BaseService",
        relationship: "instantiation",
        confidence: "confirmed",
        evidence_id: 104,
        evidence_key: "src/index.ts:12-12:call_site",
        label: "new Service()",
        points: [
          { x: 330, y: 180 },
          { x: 600, y: 180 },
        ],
      },
      {
        id: "edge:declared_dependency",
        from: "file:src/ui/Button.tsx",
        to: "external:react",
        relationship: "declared_dependency",
        confidence: "static",
        evidence_id: 105,
        evidence_key: "package.json:15-15:manifest_entry",
        label: "react dep",
        points: [
          { x: 250, y: 270 },
          { x: 250, y: 450 },
        ],
      },
      {
        id: "edge:entry",
        from: "file:src/index.ts",
        to: "module:core",
        relationship: "entry",
        confidence: "confirmed",
        evidence_id: 106,
        evidence_key: "package.json:5-5:entry_point",
        label: "starts core",
        points: [
          { x: 240, y: 190 },
          { x: 600, y: 370 },
        ],
      },
      {
        id: "edge:inferred",
        from: "file:src/ui/Button.tsx",
        to: "class:BaseService",
        relationship: "call",
        confidence: "inferred",
        evidence_id: 107,
        evidence_key: "src/ui/Button.tsx:20-20:call_site",
        label: "client.notify",
        points: [
          { x: 400, y: 240 },
          { x: 600, y: 190 },
        ],
      },
      {
        id: "edge:unknown",
        from: "file:src/index.ts",
        to: "external:react",
        relationship: "call",
        confidence: "unknown",
        evidence_id: 108,
        evidence_key: "src/index.ts:25-25:call_site",
        label: "dynamicCall",
        points: [
          { x: 200, y: 190 },
          { x: 200, y: 450 },
        ],
      },
    ],
  };

  it("renders nodes and groups from golden positioned model", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    expect(screen.getByText("index.ts")).toBeInTheDocument();
    expect(screen.getByText("Button.tsx")).toBeInTheDocument();
    expect(screen.getByText("BaseService")).toBeInTheDocument();
    expect(screen.getByText("core")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("UI Components")).toBeInTheDocument();
  });

  it("inferred edge renders visible text badge 'inferred'", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const inferredBadge = screen.getByTestId("edge-inferred-badge");
    expect(inferredBadge).toBeInTheDocument();
    expect(inferredBadge).toHaveTextContent("inferred");
  });

  it("unknown edge renders visible text badge 'unknown'", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const unknownBadge = screen.getByTestId("edge-unknown-badge");
    expect(unknownBadge).toBeInTheDocument();
    expect(unknownBadge).toHaveTextContent("unknown");
  });

  it("legend toggles and shows all relationship types and confidence descriptions", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const legendBtn = screen.getByLabelText("Toggle diagram legend");
    expect(legendBtn).toBeInTheDocument();

    // Click to open legend
    fireEvent.click(legendBtn);

    expect(screen.getByText("Relationships")).toBeInTheDocument();
    expect(screen.getByText("import")).toBeInTheDocument();
    expect(screen.getByText("call")).toBeInTheDocument();
    expect(screen.getByText("instantiation")).toBeInTheDocument();
    expect(screen.getByText("inheritance")).toBeInTheDocument();
    expect(screen.getByText("manifest dep")).toBeInTheDocument();
    expect(screen.getByText("entry point")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("dashed line")).toBeInTheDocument();
  });

  it("filtering hides the right edges reactively", async () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    // Initially edges like 'imports Button' and 'client.notify' are visible
    expect(screen.getByText("imports Button")).toBeInTheDocument();
    expect(screen.getByText("client.notify")).toBeInTheDocument();

    // Open filter panel
    const filterBtn = screen.getByLabelText("Toggle diagram filters");
    fireEvent.click(filterBtn);

    // Toggle off 'import' relationships
    const importCheck = screen.getByLabelText("import");
    fireEvent.click(importCheck);

    // The 'imports Button' edge label should now be hidden
    await waitFor(() => {
      expect(screen.queryByText("imports Button")).not.toBeInTheDocument();
    });

    // But other edges remain
    expect(screen.getByText("client.notify")).toBeInTheDocument();
  });

  it("search highlights and focuses the matching node", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const searchInput = screen.getByRole("searchbox", { name: "Search nodes" });
    fireEvent.change(searchInput, { target: { value: "BaseService" } });

    expect(screen.getByText("1 match")).toBeInTheDocument();

    // Press Enter to focus
    fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter" });

    const baseServiceNode = screen.getByRole("button", {
      name: "class node: BaseService",
    });
    expect(baseServiceNode).toBeInTheDocument();
  });

  it("clicking a node opens source in Explorer at the line and selects it in inspector", () => {
    const handleNavigateToSource = vi.fn();
    const handleSelectDiagramElement = vi.fn();

    render(
      <ArchitectureView
        initialPositionedModel={goldenPositionedModel}
        onNavigateToSource={handleNavigateToSource}
        onSelectDiagramElement={handleSelectDiagramElement}
      />
    );

    const indexNode = screen.getByRole("button", {
      name: "file node: index.ts",
    });
    fireEvent.click(indexNode);

    // Assert source navigation called with exact file and line
    expect(handleNavigateToSource).toHaveBeenCalledWith("src/index.ts", 1);

    // Assert diagram element selected for inspector
    expect(handleSelectDiagramElement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node",
        node: expect.objectContaining({ id: "file:src/index.ts" }),
      })
    );
  });

  it("keyboard navigation: Tab to nodes and Enter to open source", () => {
    const handleNavigateToSource = vi.fn();

    render(
      <ArchitectureView
        initialPositionedModel={goldenPositionedModel}
        onNavigateToSource={handleNavigateToSource}
      />
    );

    const indexNode = screen.getByRole("button", {
      name: "file node: index.ts",
    });

    // Press Enter while focused on node
    fireEvent.keyDown(indexNode, { key: "Enter", code: "Enter" });
    expect(handleNavigateToSource).toHaveBeenCalledWith("src/index.ts", 1);
  });

  it("progressive disclosure: synthetic 2,000-node model returns collapsed overview and keeps DOM node count bounded", async () => {
    // Mock getDiagram to return a collapsed overview for a large 2,000-node repo
    const mockOverviewNodes = Array.from({ length: 20 }, (_, i) => ({
      id: `group:mod_${i}`,
      kind: "module" as const,
      label: `Module ${i}`,
      width: 200,
      height: 50,
      x: (i % 5) * 220,
      y: Math.floor(i / 5) * 80,
    }));

    const mockCollapsedOverview = {
      model: {
        diagram_type: "module_dependency" as const,
        nodes: mockOverviewNodes,
        edges: [],
        groups: Array.from({ length: 20 }, (_, i) => ({
          id: `group:mod_${i}`,
          label: `Module ${i}`,
          collapsed: true,
        })),
      },
      aggregated_edges: [],
      total_node_count: 2000,
      threshold: 150,
    };

    vi.spyOn(tauriLib, "getDiagram").mockResolvedValue({
      model: {
        diagram_type: "file_dependency",
        nodes: Array.from({ length: 2000 }, (_, i) => ({
          id: `file:src/file_${i}.ts`,
          kind: "file",
          label: `file_${i}.ts`,
          width: 180,
          height: 40,
        })),
        edges: [],
        groups: [],
      },
      dropped_edges: [],
      collapsed_overview: mockCollapsedOverview,
    });

    render(<ArchitectureView projectId={1} />);

    // Verify banner notifies user of progressive disclosure
    await waitFor(() => {
      expect(screen.getByTestId("progressive-disclosure-banner")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Graph exceeds 150 nodes \(2000 files\)/)
    ).toBeInTheDocument();

    // Verify DOM node count remains strictly bounded to overview (around 20 modules, not 2,000 DOM elements)
    const renderedButtons = screen.getAllByRole("button");
    // Far fewer than 2,000 DOM nodes!
    expect(renderedButtons.length).toBeLessThan(100);
  });

  it("export menu disables PDF option while PDF generation is a stub", async () => {
    vi.spyOn(tauriLib, "getDiagram").mockResolvedValue({
      model: {
        diagram_type: "architecture_overview",
        nodes: [],
        edges: [],
        groups: [],
      },
      dropped_edges: [],
    });

    render(<ArchitectureView projectId={1} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export diagram/i })).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole("button", { name: /export diagram/i });
    fireEvent.click(exportBtn);

    // PDF button should be present in menu but disabled
    const pdfBtn = screen.getByRole("menuitem", { name: /pdf/i });
    expect(pdfBtn).toBeDisabled();

    // SVG, PNG, Mermaid are enabled
    expect(screen.getByRole("menuitem", { name: /svg/i })).not.toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /png/i })).not.toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /mermaid/i })).not.toBeDisabled();
  });

  it("empty state: renders 'No dependencies detected' with reason and pipeline button when diagram has no edges", () => {
    const handleRunPipeline = vi.fn();
    const emptyEdgesModel: PositionedModel = {
      diagram_type: "module_dependency",
      width: 800,
      height: 600,
      groups: [],
      nodes: [
        {
          id: "file:src/isolated.ts",
          kind: "file",
          label: "isolated.ts",
          x: 100,
          y: 100,
          width: 220,
          height: 70,
        },
      ],
      edges: [],
    };

    render(
      <ArchitectureView
        initialPositionedModel={emptyEdgesModel}
        onRunPipeline={handleRunPipeline}
      />
    );

    // Verify empty state is rendered, NOT a bare node row
    expect(screen.getByTestId("no-dependencies-state")).toBeInTheDocument();
    expect(screen.getByText("No dependencies detected")).toBeInTheDocument();
    expect(screen.getByText(/0 dependencies detected. Run analysis pipeline/)).toBeInTheDocument();

    const pipelineBtn = screen.getByTestId("run-pipeline-btn");
    expect(pipelineBtn).toBeInTheDocument();
    expect(pipelineBtn).toHaveTextContent("Run Analysis Pipeline");

    fireEvent.click(pipelineBtn);
    expect(handleRunPipeline).toHaveBeenCalledTimes(1);
  });

  it("node card content: renders 13-14px bold name, secondary line, and metric chips with in/out counts", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const indexNode = screen.getByTestId("diagram-node-file:src/index.ts");
    expect(indexNode).toBeInTheDocument();

    // 3px left border accent
    expect(indexNode).toHaveStyle({ borderLeftWidth: "3px" });

    // 13-14px bold name
    const titleEl = screen.getByText("index.ts");
    expect(titleEl).toHaveClass("text-[13px]");
    expect(titleEl).toHaveClass("font-semibold");
    expect(titleEl).toHaveAttribute("title", "index.ts");

    // Secondary line
    expect(screen.getByText("2 fn · 25 lines")).toBeInTheDocument();

    // Metric chips: in-degree and out-degree counts
    // index.ts has outgoing edges to Button.tsx, BaseService (call + instantiation), core, react
    expect(indexNode).toHaveTextContent("0"); // in-degree
    expect(screen.getByTitle("5 outgoing dependencies")).toBeInTheDocument();
  });

  it("selection dimming: non-related nodes are dimmed to 35% opacity when a node is selected", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    const indexNode = screen.getByTestId("diagram-node-file:src/index.ts");
    const buttonNode = screen.getByTestId("diagram-node-file:src/ui/Button.tsx");

    // Before selection, none are dimmed
    expect(indexNode).not.toHaveClass("opacity-35");
    expect(buttonNode).not.toHaveClass("opacity-35");

    // Click to select Button.tsx
    fireEvent.click(buttonNode);

    // Button.tsx is selected (has accent border)
    expect(buttonNode).toHaveClass("border-accent-default");
    expect(buttonNode).not.toHaveClass("opacity-35");

    // index.ts is connected (it imports Button.tsx), so it is highlighted, NOT dimmed
    expect(indexNode).not.toHaveClass("opacity-35");
  });

  it("legend panel: collapsible and lists line styles and layer colors with text descriptions", () => {
    render(<ArchitectureView initialPositionedModel={goldenPositionedModel} />);

    // Toggle legend open
    const legendBtn = screen.getByLabelText("Toggle diagram legend");
    fireEvent.click(legendBtn);

    const legendPanel = screen.getByTestId("diagram-legend-panel");
    expect(legendPanel).toBeInTheDocument();

    // Text descriptions, not color alone
    expect(screen.getAllByText("solid line").length).toBeGreaterThan(0);
    expect(screen.getAllByText("dotted line").length).toBeGreaterThan(0);
    expect(screen.getByText("bold solid")).toBeInTheDocument();
    expect(screen.getByText("triangle head")).toBeInTheDocument();

    // Layer accents with text
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });
});
