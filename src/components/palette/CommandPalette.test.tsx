import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import type { SymbolRecord } from "@/types/ipc";

const mockSymbols: SymbolRecord[] = [
  {
    id: 101,
    project_id: 1,
    file_id: 10,
    file_path: "src/server/auth.ts",
    stable_id: "sym-101",
    name: "authenticateUser",
    qualified_name: "src/server/auth.ts::authenticateUser",
    kind: "function",
    parent_name: null,
    signature: "export async function authenticateUser(token: string): Promise<User>",
    return_type: "Promise<User>",
    visibility: "public",
    is_exported: true,
    is_async: true,
    docstring: null,
    start_line: 42,
    end_line: 65,
    start_column: 0,
    end_column: 1,
    complexity: 3,
    has_error_handling: true,
    has_side_effects: true,
    confidence: "confirmed",
    callers: [],
    callees: [],
  },
  {
    id: 102,
    project_id: 1,
    file_id: 11,
    file_path: "src/db/schema.ts",
    stable_id: "sym-102",
    name: "UserTable",
    qualified_name: "src/db/schema.ts::UserTable",
    kind: "class",
    parent_name: null,
    signature: "export class UserTable extends Table",
    return_type: null,
    visibility: "public",
    is_exported: true,
    is_async: false,
    docstring: null,
    start_line: 15,
    end_line: 80,
    start_column: 0,
    end_column: 1,
    complexity: 1,
    has_error_handling: false,
    has_side_effects: false,
    confidence: "confirmed",
    callers: [],
    callees: [],
  },
];

describe("CommandPalette Component", () => {
  it("renders when open", () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        files={[]}
        activeView="explorer"
        onSelectView={vi.fn()}
        onOpenFolder={vi.fn()}
        onTriggerScan={vi.fn()}
        onToggleTheme={vi.fn()}
        onSelectFile={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/Search commands, files, or symbols/i)).toBeInTheDocument();
    expect(screen.getByText("Open Project Folder...")).toBeInTheDocument();
    expect(screen.getByText("Go to Overview")).toBeInTheDocument();
    expect(screen.getByText("Go to Repository Explorer")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <CommandPalette
        isOpen={false}
        onClose={vi.fn()}
        files={[]}
        activeView="explorer"
        onSelectView={vi.fn()}
        onOpenFolder={vi.fn()}
        onTriggerScan={vi.fn()}
        onToggleTheme={vi.fn()}
        onSelectFile={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("triggers view navigation when clicked", () => {
    const handleSelectView = vi.fn();
    const handleClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        onClose={handleClose}
        files={[]}
        activeView="explorer"
        onSelectView={handleSelectView}
        onOpenFolder={vi.fn()}
        onTriggerScan={vi.fn()}
        onToggleTheme={vi.fn()}
        onSelectFile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Go to Architecture Diagrams"));
    expect(handleSelectView).toHaveBeenCalledWith("architecture");
    expect(handleClose).toHaveBeenCalled();
  });

  it("searches symbols and navigates to source file and line upon selection", () => {
    const handleNavigateFileLine = vi.fn();
    const handleClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        onClose={handleClose}
        files={[]}
        activeView="explorer"
        onSelectView={vi.fn()}
        onOpenFolder={vi.fn()}
        onTriggerScan={vi.fn()}
        onToggleTheme={vi.fn()}
        onSelectFile={vi.fn()}
        projectId={1}
        initialSymbols={mockSymbols}
        onNavigateToFileLine={handleNavigateFileLine}
      />
    );

    const input = screen.getByPlaceholderText(/Search commands, files, or symbols/i);
    fireEvent.change(input, { target: { value: "authenticate" } });

    expect(screen.getByTestId("command-palette-symbols")).toBeInTheDocument();
    expect(screen.getByText("authenticateUser")).toBeInTheDocument();
    expect(screen.getByText("function")).toBeInTheDocument();
    expect(screen.getByText("src/server/auth.ts:42")).toBeInTheDocument();

    // Click on symbol
    fireEvent.click(screen.getByTestId("symbol-result-authenticateUser"));
    expect(handleNavigateFileLine).toHaveBeenCalledWith("src/server/auth.ts", 42);
    expect(handleClose).toHaveBeenCalled();
  });

  it("supports keyboard arrow navigation and Enter key selection", () => {
    const handleNavigateFileLine = vi.fn();
    const handleClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        onClose={handleClose}
        files={[]}
        activeView="explorer"
        onSelectView={vi.fn()}
        onOpenFolder={vi.fn()}
        onTriggerScan={vi.fn()}
        onToggleTheme={vi.fn()}
        onSelectFile={vi.fn()}
        projectId={1}
        initialSymbols={mockSymbols}
        onNavigateToFileLine={handleNavigateFileLine}
      />
    );

    const input = screen.getByPlaceholderText(/Search commands, files, or symbols/i);
    fireEvent.change(input, { target: { value: "UserTable" } });

    expect(screen.getByText("UserTable")).toBeInTheDocument();

    // Press Enter to activate first matching item
    fireEvent.keyDown(window, { key: "Enter" });
    expect(handleNavigateFileLine).toHaveBeenCalledWith("src/db/schema.ts", 15);
    expect(handleClose).toHaveBeenCalled();
  });
});

