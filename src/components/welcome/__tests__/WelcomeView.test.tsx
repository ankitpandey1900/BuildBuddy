import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeView } from "../WelcomeView";
import type { Project } from "@/types/ipc";

const mockRecentProjects: Project[] = [
  {
    id: 1,
    name: "Tallymate",
    root_path: "/projects/Tallymate",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    settings_json: "{}",
  },
  {
    id: 2,
    name: "ByteMap",
    root_path: "/projects/ByteMap",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    settings_json: "{}",
  },
];

describe("WelcomeView Component", () => {
  it("renders app name, purpose sentence, and offline note", () => {
    render(
      <WelcomeView
        onOpenFolder={vi.fn()}
        onReopenProject={vi.fn()}
        recentProjects={[]}
      />
    );

    expect(screen.getByText("BuildBuddy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Understand what you've built. Know how it works. Take control of your codebase."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/100% Local Analysis/i)).toBeInTheDocument();
  });

  it("triggers onOpenFolder when clicking Open Project Folder button", () => {
    const handleOpenFolder = vi.fn();
    render(
      <WelcomeView
        onOpenFolder={handleOpenFolder}
        onReopenProject={vi.fn()}
        recentProjects={[]}
      />
    );

    const openBtn = screen.getByTestId("welcome-open-btn");
    fireEvent.click(openBtn);
    expect(handleOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("renders recent projects and triggers onReopenProject when clicked", () => {
    const handleReopen = vi.fn();
    render(
      <WelcomeView
        onOpenFolder={vi.fn()}
        onReopenProject={handleReopen}
        recentProjects={mockRecentProjects}
      />
    );

    expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    expect(screen.getByText("Tallymate")).toBeInTheDocument();
    expect(screen.getByText("/projects/Tallymate")).toBeInTheDocument();
    expect(screen.getByText("ByteMap")).toBeInTheDocument();

    const tallymateItem = screen.getByText("Tallymate").closest("button")!;
    fireEvent.click(tallymateItem);
    expect(handleReopen).toHaveBeenCalledWith("/projects/Tallymate");
  });

  it("handles drag-over and drop events on the dropzone", () => {
    const handleOpenFolder = vi.fn();
    const handleReopen = vi.fn();
    render(
      <WelcomeView
        onOpenFolder={handleOpenFolder}
        onReopenProject={handleReopen}
        recentProjects={[]}
      />
    );

    const dropzone = screen.getByTestId("welcome-dropzone");

    // Drag over activates highlighted state
    fireEvent.dragOver(dropzone);

    // Drop folder with path
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [{ path: "/workspace/my-app" }],
      },
    });

    expect(handleReopen).toHaveBeenCalledWith("/workspace/my-app");
  });
});
