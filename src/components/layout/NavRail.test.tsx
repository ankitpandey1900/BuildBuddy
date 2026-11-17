import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NavRail } from "./NavRail";

describe("NavRail Sidebar Component", () => {
  it("renders grouped navigation sections with labels when expanded", () => {
    render(<NavRail activeView="overview" onSelectView={vi.fn()} isCollapsed={false} />);

    // Section group titles
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();

    // Group items
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Explorer")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Dependencies")).toBeInTheDocument();
    expect(screen.getByText("Code Intel")).toBeInTheDocument();
    expect(screen.getByText("Documentation")).toBeInTheDocument();
  });

  it("applies soft filled pill styling to the active item without outlines", () => {
    render(<NavRail activeView="architecture" onSelectView={vi.fn()} isCollapsed={false} />);

    const activeItem = screen.getByRole("button", { name: "Architecture" });
    expect(activeItem).toHaveAttribute("aria-current", "page");
    expect(activeItem.className).toContain("bg-accent-subtle");
    expect(activeItem.className).toContain("text-accent");
    // No hard borders/outlines
    expect(activeItem.className).not.toContain("border-accent");
  });

  it("calls onSelectView when an item is clicked", () => {
    const onSelect = vi.fn();
    render(<NavRail activeView="overview" onSelectView={onSelect} isCollapsed={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }));
    expect(onSelect).toHaveBeenCalledWith("dependencies");
  });

  it("supports collapsing and hides text labels in collapsed state", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <NavRail activeView="overview" onSelectView={vi.fn()} isCollapsed={false} onToggleCollapse={onToggle} />
    );

    expect(screen.getByText("Collapse")).toBeInTheDocument();

    // Re-render in collapsed state
    rerender(
      <NavRail activeView="overview" onSelectView={vi.fn()} isCollapsed={true} onToggleCollapse={onToggle} />
    );

    // Group titles and text labels should not be rendered
    expect(screen.queryByText("Explore")).not.toBeInTheDocument();
    expect(screen.queryByText("Analyze")).not.toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Collapse")).not.toBeInTheDocument();

    // But icon buttons with aria-label still exist
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  });
});
