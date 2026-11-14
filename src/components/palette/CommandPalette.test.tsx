import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";

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

    expect(screen.getByPlaceholderText("Type a command or search files...")).toBeInTheDocument();
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
});

