import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CircularDependencyList } from "./CircularDependencyList";
import { DependenciesTable, computeDependencyRows } from "./DependenciesTable";
import type { CircularDependencyCycle, ImportEdge } from "@/types/ipc";

const mockCycles: CircularDependencyCycle[] = [
  {
    cycle_files: ["src/cycle_a.ts", "src/cycle_b.ts"],
  },
];

const mockEdges: ImportEdge[] = [
  {
    source_file_id: 1,
    source_file_path: "src/index.ts",
    target_file_id: 2,
    target_file_path: "src/utils.ts",
    target_module: "./utils",
    imported_name: "helper",
    is_type_only: false,
    line_number: 10,
    resolution_status: "internal",
    source_evidence_id: 101,
  },
  {
    source_file_id: 3,
    source_file_path: "src/other.ts",
    target_file_id: 2,
    target_file_path: "src/utils.ts",
    target_module: "./utils",
    imported_name: "helper2",
    is_type_only: false,
    line_number: 5,
    resolution_status: "internal",
    source_evidence_id: 102,
  },
  {
    source_file_id: 1,
    source_file_path: "src/index.ts",
    target_file_id: null,
    target_file_path: null,
    target_module: "react",
    imported_name: "useState",
    is_type_only: false,
    line_number: 1,
    resolution_status: "external",
    source_evidence_id: 103,
  },
];

describe("CircularDependencyList Component", () => {
  it("renders detected cycles with loop notice", () => {
    const onSelectFile = vi.fn();
    render(<CircularDependencyList cycles={mockCycles} onSelectFile={onSelectFile} />);

    expect(screen.getByText(/1 Circular Import Cycle/i)).toBeInTheDocument();
    expect(screen.getByText("src/cycle_a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/cycle_b.ts")).toBeInTheDocument();
    expect(screen.getByText(/loops back to src\/cycle_a\.ts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("src/cycle_a.ts"));
    expect(onSelectFile).toHaveBeenCalledWith("src/cycle_a.ts");
  });

  it("renders clean state when no cycles exist", () => {
    render(<CircularDependencyList cycles={[]} />);
    expect(screen.getByText(/No circular dependency cycles detected/i)).toBeInTheDocument();
  });
});

describe("Dependencies Metrics Computation", () => {
  it("computes accurate fan-in, fan-out, and import counts", () => {
    const rows = computeDependencyRows(mockEdges);

    // src/utils.ts is imported by src/index.ts and src/other.ts
    const utils = rows.find((r) => r.name === "src/utils.ts");
    expect(utils).toBeDefined();
    expect(utils?.kind).toBe("internal");
    expect(utils?.fan_in).toBe(2); // 2 distinct files import it
    expect(utils?.import_count).toBe(2);

    // src/index.ts imports ./utils and react
    const index = rows.find((r) => r.name === "src/index.ts");
    expect(index).toBeDefined();
    expect(index?.fan_out).toBe(2); // imports 2 modules

    // react is external
    const react = rows.find((r) => r.name === "react");
    expect(react).toBeDefined();
    expect(react?.kind).toBe("external");
    expect(react?.fan_in).toBe(1);
    expect(react?.fan_out).toBe(0);
  });
});

describe("DependenciesTable Component (TanStack Table)", () => {
  it("renders TanStack table headers and rows with metrics", () => {
    render(<DependenciesTable edges={mockEdges} />);

    // Assert headers
    expect(screen.getByText("Dependency / Module")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Imports")).toBeInTheDocument();
    expect(screen.getByText("Fan-In")).toBeInTheDocument();
    expect(screen.getByText("Fan-Out")).toBeInTheDocument();

    // Assert rows
    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("sorts rows when column headers are clicked", () => {
    render(<DependenciesTable edges={mockEdges} />);

    // Initially sorted by fan_in descending
    let rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("src/utils.ts")).toBeInTheDocument(); // highest fan_in (2)

    const fanInHeader = screen.getByText("Fan-In");

    // Click to toggle sort to ascending
    fireEvent.click(fanInHeader);
    rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("src/index.ts")).toBeInTheDocument(); // lowest fan_in (0)

    // Click again to invert sort back to descending
    fireEvent.click(fanInHeader);
    rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("src/utils.ts")).toBeInTheDocument(); // highest fan_in (2)
  });

  it("filters rows by category tabs", () => {
    render(<DependenciesTable edges={mockEdges} />);

    // Click external tab
    const externalTab = screen.getByRole("button", { name: "external" });
    fireEvent.click(externalTab);

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.queryByText("src/utils.ts")).not.toBeInTheDocument();

    // Click internal tab
    const internalTab = screen.getByRole("button", { name: "internal" });
    fireEvent.click(internalTab);

    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
    expect(screen.queryByText("react")).not.toBeInTheDocument();
  });

  it("filters rows by global search input", () => {
    render(<DependenciesTable edges={mockEdges} />);

    const searchInput = screen.getByPlaceholderText(/Search dependencies/i);
    fireEvent.change(searchInput, { target: { value: "react" } });

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.queryByText("src/utils.ts")).not.toBeInTheDocument();
  });
});
