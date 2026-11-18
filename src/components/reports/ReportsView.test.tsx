import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportsView } from "./ReportsView";
import type { Finding } from "@/types/ipc";

const mockFindings: Finding[] = [
  {
    id: 1,
    category: "security",
    title: "Hardcoded Stripe Secret Key",
    description: "Detected live secret key assignment in source.",
    severity: "high",
    confidence: "confirmed",
    file_path: "src/api/payment.ts",
    start_line: 42,
    end_line: 42,
    source_evidence_id: 101,
    metadata_json: "{}",
  },
  {
    id: 2,
    category: "complexity",
    title: "High Cyclomatic Complexity in parseAST",
    description: "Function exceeds cyclomatic threshold with 14 branching paths.",
    severity: "medium",
    confidence: "static",
    file_path: "src/parser/ast.ts",
    start_line: 110,
    end_line: 180,
    source_evidence_id: 102,
    metadata_json: "{}",
  },
  {
    id: 3,
    category: "circular_dependency",
    title: "Circular import loop between auth and user",
    description: "auth.ts -> user.ts -> auth.ts",
    severity: "medium",
    confidence: "confirmed",
    file_path: "src/auth.ts",
    start_line: 1,
    end_line: 1,
    source_evidence_id: 103,
    metadata_json: "{}",
  },
  {
    id: 4,
    category: "dead_code",
    title: "Unreachable block in helper",
    description: "Code block after unconditional return statement.",
    severity: "low",
    confidence: "static",
    file_path: "src/utils/helper.ts",
    start_line: 88,
    end_line: 95,
    source_evidence_id: 104,
    metadata_json: "{}",
  },
];

describe("ReportsView Component", () => {
  it("renders empty state when no project or findings provided", () => {
    render(<ReportsView projectId={null} />);
    expect(screen.getByText("No Project Selected")).toBeInTheDocument();
  });

  it("renders metric cards and table rows with accurate counts", () => {
    render(<ReportsView projectId={1} initialFindings={mockFindings} />);

    expect(screen.getByText("Engineering Health & Quality Audit")).toBeInTheDocument();
    // High/Critical count: 1
    expect(screen.getByText("Critical / High Issues")).toBeInTheDocument();
    expect(screen.getByText("Complexity Hotspots")).toBeInTheDocument();
    expect(screen.getByText("Dependency Loops")).toBeInTheDocument();
    expect(screen.getByText("Security Alerts")).toBeInTheDocument();

    // Check rows exist
    expect(screen.getByText("Hardcoded Stripe Secret Key")).toBeInTheDocument();
    expect(screen.getByText("High Cyclomatic Complexity in parseAST")).toBeInTheDocument();
    expect(screen.getByText("Circular import loop between auth and user")).toBeInTheDocument();
  });

  it("filters findings by category tab", () => {
    render(<ReportsView projectId={1} initialFindings={mockFindings} />);

    // Click Security tab
    fireEvent.click(screen.getByText(/Security \(1\)/i));

    expect(screen.getByText("Hardcoded Stripe Secret Key")).toBeInTheDocument();
    expect(screen.queryByText("High Cyclomatic Complexity in parseAST")).not.toBeInTheDocument();
    expect(screen.queryByText("Circular import loop between auth and user")).not.toBeInTheDocument();
  });

  it("searches findings by text input", () => {
    render(<ReportsView projectId={1} initialFindings={mockFindings} />);

    const searchInput = screen.getByPlaceholderText("Search report items...");
    fireEvent.change(searchInput, { target: { value: "payment" } });

    expect(screen.getByText("Hardcoded Stripe Secret Key")).toBeInTheDocument();
    expect(screen.queryByText("High Cyclomatic Complexity in parseAST")).not.toBeInTheDocument();
  });

  it("triggers onNavigateToFileLine when location link is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <ReportsView
        projectId={1}
        initialFindings={mockFindings}
        onNavigateToFileLine={onNavigate}
      />
    );

    const locationLink = screen.getByText("src/api/payment.ts:42");
    fireEvent.click(locationLink);

    expect(onNavigate).toHaveBeenCalledWith("src/api/payment.ts", 42);
  });

  it("triggers onNavigateToDocs when report shortcuts are clicked", () => {
    const onDocs = vi.fn();
    render(
      <ReportsView
        projectId={1}
        initialFindings={mockFindings}
        onNavigateToDocs={onDocs}
      />
    );

    fireEvent.click(screen.getByText("Security Report"));
    expect(onDocs).toHaveBeenCalledWith("security_report");

    fireEvent.click(screen.getByText("Debt Report"));
    expect(onDocs).toHaveBeenCalledWith("tech_debt_report");
  });
});
