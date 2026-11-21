import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { InspectorPanel } from "./InspectorPanel";
import type {
  ClassDetailResponse,
  FileRecord,
  SymbolDetail,
  SymbolRecord,
  CallDetailItem,
} from "@/types/ipc";

const mockFile: FileRecord = {
  id: 1,
  project_id: 1,
  file_name: "parser.ts",
  relative_path: "src/core/parser.ts",
  extension: "ts",
  language_id: null,
  size_bytes: 4096,
  line_count: 120,
  function_count: 1,
  class_count: 0,
  import_count: 1,
  content_hash: "blake3_hash_abcdef123456",
  status: "parsed",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockSymbol: SymbolRecord = {
  id: 10,
  project_id: 1,
  file_id: 1,
  file_path: "src/core/parser.ts",
  stable_id: "sym_parser_10",
  name: "parseFile",
  qualified_name: "src/core/parser.parseFile",
  kind: "function",
  parent_name: null,
  signature: "export function parseFile(path: string): Promise<ParseResult>",
  return_type: "Promise<ParseResult>",
  visibility: "public",
  is_exported: true,
  is_async: true,
  docstring: "Parses file AST",
  start_line: 20,
  end_line: 55,
  start_column: 1,
  end_column: 62,
  confidence: "confirmed",
  complexity: 7,
  has_error_handling: true,
  has_side_effects: true,
  callers: ["main"],
  callees: ["readFile", "unknownDynamic"],
};

const mockIncomingCalls: CallDetailItem[] = [
  {
    id: 101,
    caller_symbol_id: 20,
    caller_name: "main",
    caller_file_path: "src/index.ts",
    callee_symbol_id: 10,
    callee_name: "parseFile",
    callee_file_path: "src/core/parser.ts",
    resolution_status: "confirmed",
    is_dynamic: false,
    start_line: 15,
    end_line: 15,
    start_column: 5,
    end_column: 20,
    snippet: "parseFile('test.ts')",
    confidence: "confirmed",
  },
  {
    id: 102,
    caller_symbol_id: 21,
    caller_name: "legacyRunner",
    caller_file_path: "src/legacy.ts",
    callee_symbol_id: 10,
    callee_name: "parseFile",
    callee_file_path: "src/core/parser.ts",
    resolution_status: "static",
    is_dynamic: false,
    start_line: 32,
    end_line: 32,
    start_column: 3,
    end_column: 22,
    snippet: "parseFile(path)",
    confidence: "static",
  },
  {
    id: 103,
    caller_symbol_id: null,
    caller_name: "dynamicDispatchCaller",
    caller_file_path: "src/eval.ts",
    callee_symbol_id: 10,
    callee_name: "parseFile",
    callee_file_path: "src/core/parser.ts",
    resolution_status: "inferred",
    is_dynamic: true,
    start_line: 99,
    end_line: 99,
    start_column: 1,
    end_column: 30,
    snippet: "registry[fnName](path)",
    confidence: "inferred",
  },
  {
    id: 104,
    caller_symbol_id: null,
    caller_name: "unresolvedCaller",
    caller_file_path: "src/eval.ts",
    callee_symbol_id: 10,
    callee_name: "parseFile",
    callee_file_path: "src/core/parser.ts",
    resolution_status: "unknown",
    is_dynamic: true,
    start_line: 115,
    end_line: 115,
    start_column: 1,
    end_column: 20,
    snippet: "mystery()",
    confidence: "unknown",
  },
];

const mockOutgoingCalls: CallDetailItem[] = [
  {
    id: 201,
    caller_symbol_id: 10,
    caller_name: "parseFile",
    caller_file_path: "src/core/parser.ts",
    callee_symbol_id: 30,
    callee_name: "readFile",
    callee_file_path: "src/fs/reader.ts",
    resolution_status: "confirmed",
    is_dynamic: false,
    start_line: 25,
    end_line: 25,
    start_column: 9,
    end_column: 25,
    snippet: "readFile(path)",
    confidence: "confirmed",
  },
  {
    id: 202,
    caller_symbol_id: 10,
    caller_name: "parseFile",
    caller_file_path: "src/core/parser.ts",
    callee_symbol_id: null,
    callee_name: "fetchRemote",
    callee_file_path: null,
    resolution_status: "inferred",
    is_dynamic: true,
    start_line: 40,
    end_line: 40,
    start_column: 9,
    end_column: 35,
    snippet: "client.fetchRemote()",
    confidence: "inferred",
  },
];

const mockSymbolDetail: SymbolDetail = {
  symbol: mockSymbol,
  snippet: "export function parseFile(path: string) {\n  const data = readFile(path);\n  return data;\n}",
  function_metrics: {
    id: 1,
    symbol_id: 10,
    file_id: 1,
    name: "parseFile",
    parameters: [
      { name: "path", type_annotation: "string", default_value: null },
    ],
    return_type: "Promise<ParseResult>",
    branch_count: 3,
    loop_count: 2,
    cyclomatic_complexity: 6,
    has_error_handling: true,
    side_effects: [
      {
        category: "fs",
        pattern: "fs.readFile",
        confidence: "static",
        line_number: 26,
      },
      {
        category: "network",
        pattern: "fetch",
        confidence: "static",
        line_number: 40,
      },
    ],
    imports_used: ["readFile"],
    callers: ["main"],
    callees: ["readFile"],
    source_evidence_id: 50,
  },
  class_details: null,
  incoming_calls: mockIncomingCalls,
  outgoing_calls: mockOutgoingCalls,
  instantiations: [],
};

describe("InspectorPanel Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four badge variants with the exact text", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
      />
    );

    // Assert that badges for all 4 variants exist with exact text
    expect(screen.getAllByText("confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("static").length).toBeGreaterThan(0);
    expect(screen.getAllByText("inferred").length).toBeGreaterThan(0);
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
  });

  it("ensures an inferred row is NEVER rendered with the confirmed label", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
      />
    );

    // Look up the specific inferred caller row "dynamicDispatchCaller"
    const inferredCallerName = screen.getByText("dynamicDispatchCaller");
    const inferredRow = inferredCallerName.closest('[data-testid="relationship-row"]') as HTMLElement;
    expect(inferredRow).toBeInTheDocument();

    // Verify it contains "inferred"
    expect(within(inferredRow).getByText("inferred")).toBeInTheDocument();

    // STRICT CHECK: An inferred row must NEVER contain the "confirmed" label
    expect(within(inferredRow).queryByText("confirmed")).not.toBeInTheDocument();

    // Check inferred outgoing call "fetchRemote"
    const inferredCalleeName = screen.getByText("fetchRemote");
    const inferredCalleeRow = inferredCalleeName.closest('[data-testid="relationship-row"]') as HTMLElement;
    expect(inferredCalleeRow).toBeInTheDocument();
    expect(within(inferredCalleeRow).getByText("inferred")).toBeInTheDocument();
    expect(within(inferredCalleeRow).queryByText("confirmed")).not.toBeInTheDocument();
  });

  it("groups inferred and unknown rows apart from confirmed/static rows", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
      />
    );

    // Assert distinct grouping headers
    expect(
      screen.getAllByText(/Resolved Callers \(Confirmed \/ Static\)/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Unresolved \/ Dynamic Callers \(Inferred \/ Unknown\)/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Resolved Callees \(Confirmed \/ Static\)/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Unresolved \/ Dynamic Callees \(Inferred \/ Unknown\)/i).length
    ).toBeGreaterThan(0);
  });

  it("renders metric tooltips with definitions from DECISIONS.md", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
      />
    );

    // Complexity card has the DECISIONS.md McCabe definition in title
    const complexityCard = screen
      .getByText("Complexity")
      .closest('[title*="McCabe Cyclomatic Complexity"]')!;
    expect(complexityCard).toBeInTheDocument();
    expect(complexityCard.getAttribute("title")).toContain(
      "CC = 1 + ∑ branches + ∑ loops"
    );

    // Branch card
    const branchCard = screen
      .getByText("Branches")
      .closest('[title*="Branch points"]')!;
    expect(branchCard).toBeInTheDocument();

    // Loops card
    const loopCard = screen
      .getByText("Loops")
      .closest('[title*="Loop points"]')!;
    expect(loopCard).toBeInTheDocument();
  });

  it("displays 'None detected' for empty sections with no mock data", () => {
    const emptySymbol: SymbolRecord = {
      ...mockSymbol,
      id: 99,
      name: "emptySymbol",
      signature: "",
      confidence: "unknown",
      complexity: null,
      has_error_handling: false,
      has_side_effects: false,
      callers: [],
      callees: [],
    };

    const emptyDetail: SymbolDetail = {
      symbol: emptySymbol,
      snippet: null,
      function_metrics: null,
      class_details: null,
      incoming_calls: [],
      outgoing_calls: [],
      instantiations: [],
    };

    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={emptySymbol}
        initialSymbolDetail={emptyDetail}
      />
    );

    // Multiple sections must display "None detected"
    const noneDetectedElements = screen.getAllByText("None detected");
    expect(noneDetectedElements.length).toBeGreaterThanOrEqual(4);
  });

  it("supports click-to-source on items", () => {
    const onNavigateToSource = vi.fn();

    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
        onNavigateToSource={onNavigateToSource}
      />
    );

    // Header click-to-source button
    const headerSourceBtn = screen.getByTestId("click-to-source-header");
    fireEvent.click(headerSourceBtn);
    expect(onNavigateToSource).toHaveBeenCalledWith(
      mockSymbol.file_path,
      mockSymbol.start_line
    );

    // Relationship row click-to-source button
    const rowSourceBtns = screen.getAllByTestId("click-to-source-btn");
    expect(rowSourceBtns.length).toBeGreaterThan(0);
    fireEvent.click(rowSourceBtns[0]);
    expect(onNavigateToSource).toHaveBeenCalled();
  });

  it("supports navigation history stack with Back button when inspecting relationships", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={mockSymbol}
        initialSymbolDetail={mockSymbolDetail}
      />
    );

    // Initially, no Back button exists
    expect(screen.queryByTestId("inspector-back-btn")).not.toBeInTheDocument();

    // Click on caller "main" (which has caller_symbol_id: 20)
    const inspectLinks = screen.getAllByTestId("inspect-symbol-link");
    expect(inspectLinks.length).toBeGreaterThan(0);

    fireEvent.click(inspectLinks[0]); // clicks "main"

    // Back button should now appear with count 1
    const backBtn = screen.getByTestId("inspector-back-btn");
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveTextContent("Back (1)");

    // Clicking Back button navigates back
    fireEvent.click(backBtn);
    expect(screen.queryByTestId("inspector-back-btn")).not.toBeInTheDocument();
  });

  it("renders class members and inheritance sections when inspecting a class", () => {
    const classSymbol: SymbolRecord = {
      ...mockSymbol,
      id: 50,
      name: "QueryEngine",
      kind: "class",
      signature: "class QueryEngine extends BaseEngine implements IEngine",
    };

    const mockClassDetail: ClassDetailResponse = {
      symbol: classSymbol,
      superclass_name: "BaseEngine",
      base_classes: ["BaseEngine"],
      interfaces: ["IEngine"],
      properties: [
        {
          name: "dbPath",
          type_annotation: "string",
          visibility: "private",
          is_static: false,
        },
      ],
      methods: [
        {
          name: "execute",
          signature: "execute(query: string): QueryResult",
          visibility: "public",
          is_static: false,
        },
      ],
      constructors: [
        {
          signature: "constructor(path: string)",
          parameters: [],
          start_line: 25,
          end_line: 30,
        },
      ],
      instantiations: [
        {
          id: 501,
          caller_symbol_id: 10,
          caller_name: "initEngine",
          caller_file_path: "src/app.ts",
          class_symbol_id: 50,
          class_name: "QueryEngine",
          resolution_status: "confirmed",
          start_line: 12,
          end_line: 12,
          start_column: 10,
          end_column: 32,
          snippet: "new QueryEngine('db.sqlite')",
          confidence: "confirmed",
        },
      ],
    };

    const classDetailSymbolDetail: SymbolDetail = {
      symbol: classSymbol,
      snippet: null,
      function_metrics: null,
      class_details: null,
      incoming_calls: [],
      outgoing_calls: [],
      instantiations: [],
    };

    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
        selectedSymbol={classSymbol}
        initialSymbolDetail={classDetailSymbolDetail}
        initialClassDetail={mockClassDetail}
      />
    );

    // Assert Class sections render
    expect(screen.getByTestId("inspector-section-classes")).toBeInTheDocument();
    expect(screen.getByText("Base Classes:")).toBeInTheDocument();
    expect(screen.getByText("BaseEngine")).toBeInTheDocument();
    expect(screen.getByText("Interfaces:")).toBeInTheDocument();
    expect(screen.getByText("IEngine")).toBeInTheDocument();
    expect(screen.getByText("QueryEngine")).toBeInTheDocument();
    expect(screen.getByText("execute")).toBeInTheDocument();
    expect(screen.getByText("dbPath")).toBeInTheDocument();
    expect(screen.getByText("initEngine")).toBeInTheDocument();
  });

  it("renders file inspector with metrics grid, truncated hash, and provenance", () => {
    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={mockFile}
      />
    );

    expect(screen.getByTestId("file-inspector-section")).toBeInTheDocument();
    expect(screen.getByText("parser.ts")).toBeInTheDocument();
    expect(screen.getByText("src/core/parser.ts")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(screen.getByText("Indexed")).toBeInTheDocument();
    expect(screen.getByText(/BLAKE3:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provenance tracked:/i)).toBeInTheDocument();
  });

  it("renders clean simplified error notification with Re-scan button and collapsible diagnostics when file has parse error", () => {
    const errorFile: FileRecord = {
      ...mockFile,
      id: 2,
      file_name: "route.ts",
      relative_path: "apps/api/src/app/api/academies/[id]/route.ts",
      status: "error",
      error_message: "CHECK constraint failed: evidence_type IN ('ast_node', 'manifest_entry')",
    };

    const onTriggerScan = vi.fn();

    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={errorFile}
        onTriggerScan={onTriggerScan}
      />
    );

    expect(screen.getByText("Analysis Update Recommended")).toBeInTheDocument();
    expect(screen.getByText(/Symbols or dependencies for this file are pending index sync/i)).toBeInTheDocument();

    const rescanBtn = screen.getByRole("button", { name: /Re-scan Project/i });
    expect(rescanBtn).toBeInTheDocument();
    fireEvent.click(rescanBtn);
    expect(onTriggerScan).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Technical diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/CHECK constraint failed/i)).toBeInTheDocument();
  });

  it("renders rich file intelligence with architectural role, API endpoints, exported symbols, internal imports, and blast radius", () => {
    const routeFile: FileRecord = {
      ...mockFile,
      id: 3,
      file_name: "route.ts",
      relative_path: "apps/api/src/app/api/academies/[id]/route.ts",
      status: "parsed",
    };

    const mockFileIntel = {
      file_path: "apps/api/src/app/api/academies/[id]/route.ts",
      role: "API Gateway Route Handler",
      explanation: "Exposes 1 HTTP endpoint(s) (GET /api/academies/[id]) for external consumers.",
      blast_radius_level: "low" as const,
      direct_dependants_count: 0,
      direct_dependants: [],
      external_packages_used: ["next/server", "zod"],
      internal_dependencies: ["apps/api/src/lib/prisma.ts"],
      exported_symbols: [
        {
          name: "GET",
          kind: "function",
          line_number: 15,
          is_exported: true,
          complexity: 4,
        },
      ],
      api_endpoints: [
        {
          method: "GET",
          route: "/api/academies/[id]",
          framework: "Next.js App Router",
        },
      ],
    };

    render(
      <InspectorPanel
        isOpen={true}
        onToggle={vi.fn()}
        width={340}
        selectedFile={routeFile}
        initialFileIntelligence={mockFileIntel}
      />
    );

    expect(screen.getByText("API Gateway Route Handler")).toBeInTheDocument();
    expect(screen.getByText(/Exposes 1 HTTP endpoint/i)).toBeInTheDocument();
    expect(screen.getByText("Declared API Endpoints (1)")).toBeInTheDocument();
    expect(screen.getAllByText("GET").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("/api/academies/[id]")).toBeInTheDocument();
    expect(screen.getByText("Exported Symbols (1)")).toBeInTheDocument();
    expect(screen.getByText("CC 4")).toBeInTheDocument();
    expect(screen.getByText("Imports Project Files (1)")).toBeInTheDocument();
    expect(screen.getByText("apps/api/src/lib/prisma.ts")).toBeInTheDocument();
    expect(screen.getByText("External Packages (2)")).toBeInTheDocument();
    expect(screen.getByText("next/server")).toBeInTheDocument();
    expect(screen.getByText("zod")).toBeInTheDocument();
  });
});
