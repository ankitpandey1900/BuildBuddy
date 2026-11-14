import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CircularDependencyList } from "./CircularDependencyList";
import { DependenciesTable } from "./DependenciesTable";
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
    source_evidence_id: null,
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
    source_evidence_id: null,
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

describe("DependenciesTable Component", () => {
  it("renders table with edges and filter controls", () => {
    render(<DependenciesTable edges={mockEdges} />);

    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getAllByText("internal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("external").length).toBeGreaterThanOrEqual(1);
  });

  it("filters edges by category tabs", () => {
    render(<DependenciesTable edges={mockEdges} />);

    // Click external tab
    const externalTab = screen.getByRole("button", { name: "external" });
    fireEvent.click(externalTab);

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.queryByText("src/utils.ts")).not.toBeInTheDocument();
  });

  it("filters edges by search query", () => {
    render(<DependenciesTable edges={mockEdges} />);

    const searchInput = screen.getByPlaceholderText(/Filter module or file/i);
    fireEvent.change(searchInput, { target: { value: "utils" } });

    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
    expect(screen.queryByText("react")).not.toBeInTheDocument();
  });
});
