import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeIntelligenceView } from "./CodeIntelligenceView";
import type { SymbolRecord } from "@/types/ipc";

const mockSymbols: SymbolRecord[] = [
  {
    id: 1,
    project_id: 1,
    file_id: 10,
    file_path: "src/core/parser.ts",
    stable_id: "sym_ts_1",
    name: "parseFile",
    qualified_name: "src/core/parser.parseFile",
    kind: "function",
    parent_name: null,
    signature: "export function parseFile(path: string): Promise<ParseResult>",
    return_type: "Promise<ParseResult>",
    visibility: "public",
    is_exported: true,
    is_async: true,
    docstring: "Parses source file and extracts symbols.",
    start_line: 45,
    end_line: 90,
    start_column: 1,
    end_column: 62,
    confidence: "confirmed",
    complexity: 6,
    has_error_handling: true,
    has_side_effects: true,
    callers: ["main", "startScan"],
    callees: ["readFile", "tokenize"],
  },
  {
    id: 2,
    project_id: 1,
    file_id: 11,
    file_path: "src/core/model.py",
    stable_id: "sym_py_2",
    name: "AstNode",
    qualified_name: "src.core.model.AstNode",
    kind: "class",
    parent_name: null,
    signature: "class AstNode(BaseNode):",
    return_type: null,
    visibility: "public",
    is_exported: false,
    is_async: false,
    docstring: "Represents an abstract syntax tree node.",
    start_line: 12,
    end_line: 60,
    start_column: 1,
    end_column: 25,
    confidence: "confirmed",
    complexity: 1,
    has_error_handling: false,
    has_side_effects: false,
    callers: [],
    callees: [],
  },
  {
    id: 3,
    project_id: 1,
    file_id: 12,
    file_path: "src/utils/helpers.ts",
    stable_id: "sym_ts_3",
    name: "calculateComplexity",
    qualified_name: "src/utils/helpers.calculateComplexity",
    kind: "function",
    parent_name: null,
    signature: "function calculateComplexity(branches: number, loops: number): number",
    return_type: "number",
    visibility: null,
    is_exported: false,
    is_async: false,
    docstring: "Computes cyclomatic complexity via McCabe formula.",
    start_line: 10,
    end_line: 25,
    start_column: 1,
    end_column: 60,
    confidence: "confirmed",
    complexity: 2,
    has_error_handling: false,
    has_side_effects: false,
    callers: ["parseFile"],
    callees: [],
  },
  {
    id: 4,
    project_id: 1,
    file_id: 13,
    file_path: "src/net/client.py",
    stable_id: "sym_py_4",
    name: "fetchRemoteData",
    qualified_name: "src.net.client.fetchRemoteData",
    kind: "function",
    parent_name: null,
    signature: "def fetchRemoteData(url: str) -> dict:",
    return_type: "dict",
    visibility: "public",
    is_exported: true,
    is_async: false,
    docstring: null,
    start_line: 15,
    end_line: 40,
    start_column: 1,
    end_column: 38,
    confidence: "confirmed",
    complexity: 12,
    has_error_handling: true,
    has_side_effects: true,
    callers: ["syncRunner"],
    callees: ["requests.get"],
  },
];

describe("CodeIntelligenceView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table headers, row data, and result count", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    // Assert headers
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Kind")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Complexity")).toBeInTheDocument();
    expect(screen.getByText("Callers")).toBeInTheDocument();
    expect(screen.getByText("Callees")).toBeInTheDocument();
    expect(screen.getByText("Flags")).toBeInTheDocument();

    // Assert rows
    expect(screen.getByText("parseFile")).toBeInTheDocument();
    expect(screen.getByText("AstNode")).toBeInTheDocument();
    expect(screen.getByText("calculateComplexity")).toBeInTheDocument();
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();

    // Assert result count
    expect(screen.getByTestId("result-count")).toHaveTextContent("4 symbols");
  });

  it("filters symbols by language dropdown", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const langSelect = screen.getByTestId("filter-language");

    // Filter to Python
    fireEvent.change(langSelect, { target: { value: "python" } });

    expect(screen.getByText("AstNode")).toBeInTheDocument();
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();
    expect(screen.queryByText("parseFile")).not.toBeInTheDocument();
    expect(screen.queryByText("calculateComplexity")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-count")).toHaveTextContent("2 symbols");

    // Filter to TypeScript
    fireEvent.change(langSelect, { target: { value: "typescript" } });
    expect(screen.getByText("parseFile")).toBeInTheDocument();
    expect(screen.getByText("calculateComplexity")).toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();
    expect(screen.queryByText("fetchRemoteData")).not.toBeInTheDocument();
  });

  it("filters symbols by kind dropdown", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const kindSelect = screen.getByTestId("filter-kind");

    // Filter to Class
    fireEvent.change(kindSelect, { target: { value: "class" } });
    expect(screen.getByText("AstNode")).toBeInTheDocument();
    expect(screen.queryByText("parseFile")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-count")).toHaveTextContent("1 symbol");
  });

  it("filters symbols by path prefix", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const pathInput = screen.getByTestId("filter-path-prefix");

    fireEvent.change(pathInput, { target: { value: "src/utils" } });
    expect(screen.getByText("calculateComplexity")).toBeInTheDocument();
    expect(screen.queryByText("parseFile")).not.toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();
  });

  it("filters symbols by min complexity", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const complexitySelect = screen.getByTestId("filter-min-complexity");

    // Min CC >= 5 (should keep parseFile: 6, fetchRemoteData: 12)
    fireEvent.change(complexitySelect, { target: { value: "5" } });
    expect(screen.getByText("parseFile")).toBeInTheDocument();
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();
    expect(screen.queryByText("calculateComplexity")).not.toBeInTheDocument();

    // Min CC >= 10 (only fetchRemoteData: 12)
    fireEvent.change(complexitySelect, { target: { value: "10" } });
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();
    expect(screen.queryByText("parseFile")).not.toBeInTheDocument();
  });

  it("filters symbols by flags (exported, error handling, side effects)", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const exportedCheckbox = screen.getByTestId("filter-exported");
    const errorCheckbox = screen.getByTestId("filter-error-handling");
    const sideEffectsCheckbox = screen.getByTestId("filter-side-effects");

    // Only exported
    fireEvent.click(exportedCheckbox);
    expect(screen.getByText("parseFile")).toBeInTheDocument();
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();
    expect(screen.queryByText("calculateComplexity")).not.toBeInTheDocument();

    // Uncheck exported
    fireEvent.click(exportedCheckbox);

    // Only error handling
    fireEvent.click(errorCheckbox);
    expect(screen.getByText("parseFile")).toBeInTheDocument();
    expect(screen.getByText("fetchRemoteData")).toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();

    // Side effects checkbox
    fireEvent.click(sideEffectsCheckbox);
    expect(screen.getByText("parseFile")).toBeInTheDocument();
  });

  it("filters symbols by text search query", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const searchInput = screen.getByTestId("symbol-search-input");
    fireEvent.change(searchInput, { target: { value: "mccabe" } }); // in calculateComplexity docstring

    expect(screen.getByText("calculateComplexity")).toBeInTheDocument();
    expect(screen.queryByText("parseFile")).not.toBeInTheDocument();
    expect(screen.queryByText("AstNode")).not.toBeInTheDocument();
  });

  it("renders empty state when no symbols match filters", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const searchInput = screen.getByTestId("symbol-search-input");
    fireEvent.change(searchInput, { target: { value: "nonexistent_query_xyz" } });

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No symbols match the current filters")).toBeInTheDocument();
  });

  it("handles keyboard navigation: Up/Down arrow moves selection, Enter opens file in Explorer", () => {
    const onSelectSymbol = vi.fn();
    const onNavigateToFileLine = vi.fn();

    render(
      <CodeIntelligenceView
        initialSymbols={mockSymbols}
        onSelectSymbol={onSelectSymbol}
        onNavigateToFileLine={onNavigateToFileLine}
      />
    );

    const root = screen.getByTestId("code-intelligence-view");

    // Table is sorted alphabetically by name:
    // [0] AstNode (mockSymbols[1])
    // [1] calculateComplexity (mockSymbols[2])
    // [2] fetchRemoteData (mockSymbols[3])
    // [3] parseFile (mockSymbols[0])

    // Press Down arrow -> moves to index 1 (calculateComplexity)
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(onSelectSymbol).toHaveBeenCalledWith(mockSymbols[2]);

    // Press Enter -> opens Explorer at calculateComplexity's file and start_line
    fireEvent.keyDown(root, { key: "Enter" });
    expect(onNavigateToFileLine).toHaveBeenCalledWith(
      mockSymbols[2].file_path,
      mockSymbols[2].start_line
    );

    // Press Up arrow -> moves back to index 0 (AstNode)
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(onSelectSymbol).toHaveBeenCalledWith(mockSymbols[1]);
  });

  it("focuses search input when '/' key is pressed", () => {
    render(<CodeIntelligenceView initialSymbols={mockSymbols} />);

    const searchInput = screen.getByTestId("symbol-search-input");
    const focusSpy = vi.spyOn(searchInput, "focus");

    fireEvent.keyDown(window, { key: "/" });
    expect(focusSpy).toHaveBeenCalled();
  });

  it("renders 20,000 synthetic rows and keeps DOM row count small via virtualizer", () => {
    // Generate 20,000 synthetic symbols
    const count = 20000;
    const syntheticSymbols: SymbolRecord[] = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      project_id: 1,
      file_id: (i % 100) + 1,
      file_path: `src/synthetic/module_${i % 50}.ts`,
      stable_id: `sym_synth_${i}`,
      name: `fn_synthetic_${i}`,
      qualified_name: `src.synthetic.fn_synthetic_${i}`,
      kind: "function",
      parent_name: null,
      signature: `function fn_synthetic_${i}(): void`,
      return_type: "void",
      visibility: "public",
      is_exported: i % 2 === 0,
      is_async: i % 3 === 0,
      docstring: null,
      start_line: (i * 10) + 1,
      end_line: (i * 10) + 8,
      start_column: 1,
      end_column: 30,
      confidence: "confirmed",
      complexity: (i % 15) + 1,
      has_error_handling: i % 4 === 0,
      has_side_effects: i % 5 === 0,
      callers: [`caller_${i}`],
      callees: [`callee_${i}`],
    }));

    const { container } = render(
      <CodeIntelligenceView initialSymbols={syntheticSymbols} />
    );

    // Verify result count reports all 20,000 symbols
    expect(screen.getByTestId("result-count")).toHaveTextContent("20,000 symbols");

    // Verify DOM row count in tbody
    const renderedRows = container.querySelectorAll("tbody tr");

    // The virtualizer MUST keep the DOM row count small (not 20,000)
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(100);
  });
});
