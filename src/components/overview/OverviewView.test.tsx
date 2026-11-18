import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverviewView } from "./OverviewView";
import type { OverviewDataDto, Project } from "@/types/ipc";

const mockProject: Project = {
  id: 1,
  name: "BuildBuddy-Demo",
  root_path: "/workspace/buildbuddy",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  settings_json: "{}",
};

const mockOverviewData: OverviewDataDto = {
  project_name: "BuildBuddy-Demo",
  root_path: "/workspace/buildbuddy",
  metrics: {
    total_files: 42,
    total_modules: 5,
    total_symbols: 128,
    total_functions: 85,
    total_classes: 12,
    total_entry_points: 3,
    total_dependencies: 18,
    unsupported_files_count: 2,
    partial_files_count: 1,
  },
  languages: [
    { name: "TypeScript", file_count: 25, line_count: 3200, percentage: 65.5 },
    { name: "Python", file_count: 10, line_count: 1200, percentage: 24.5 },
    { name: "JSON", file_count: 7, line_count: 500, percentage: 10.0 },
  ],
  frameworks: [
    {
      name: "React",
      version: "^18.3.1",
      confidence: "static",
      evidence: [
        {
          file_path: "package.json",
          start_line: 15,
          end_line: 15,
          snippet: '"react": "^18.3.1"',
          signal_type: "manifest_dependency",
          description: "Declared manifest dependency 'react' (Direct)",
        },
        {
          file_path: "src/client/App.tsx",
          start_line: 1,
          end_line: 1,
          snippet: "import React, { useState } from 'react';",
          signal_type: "import_usage",
          description: "AST import of React module 'react'",
        },
      ],
    },
    {
      name: "Express",
      version: "^4.19.2",
      confidence: "static",
      evidence: [
        {
          file_path: "package.json",
          start_line: 14,
          end_line: 14,
          snippet: '"express": "^4.19.2"',
          signal_type: "manifest_dependency",
          description: "Declared Express manifest dependency",
        },
        {
          file_path: "src/server/index.ts",
          start_line: 10,
          end_line: 10,
          snippet: "app.listen(port, () => {",
          signal_type: "source_pattern",
          description: "Express application initialization or router pattern",
        },
      ],
    },
  ],
  declared_only: [
    {
      name: "Vue",
      version: "^3.4.0",
      dependency_type: "dev",
      file_path: "package.json",
      line_number: 16,
    },
  ],
  entry_points: [
    {
      name: "package.json main",
      entry_type: "main",
      file_path: "package.json",
      start_line: 5,
      end_line: 5,
      snippet: '"main": "src/server/index.ts"',
      confidence: "static",
    },
    {
      name: "Express HTTP Server Entry",
      entry_type: "framework_entry",
      file_path: "src/server/index.ts",
      start_line: 10,
      end_line: 10,
      snippet: "app.listen(port, () => {",
      confidence: "static",
    },
    {
      name: "React DOM Root Entry",
      entry_type: "framework_entry",
      file_path: "src/client/main.tsx",
      start_line: 7,
      end_line: 7,
      snippet: "const root = createRoot(container);",
      confidence: "static",
    },
  ],
  modules: [
    {
      name: "src::client",
      root_directory: "src/client",
      layer: "frontend",
      file_count: 15,
      cohesion_score: 0.85,
      files: ["src/client/App.tsx", "src/client/main.tsx"],
    },
    {
      name: "src::server",
      root_directory: "src/server",
      layer: "backend",
      file_count: 10,
      cohesion_score: 0.9,
      files: ["src/server/index.ts"],
    },
  ],
  completion: {
    status: "completed",
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:00:02Z",
    duration_ms: 2150,
    files_scanned: 42,
    files_parsed: 39,
  },
};

describe("OverviewView Component", () => {
  it("renders empty state when no project is loaded", () => {
    const handleOpenFolder = vi.fn();

    render(
      <OverviewView
        currentProject={null}
        onNavigateToView={vi.fn()}
        onOpenFolder={handleOpenFolder}
      />
    );

    expect(screen.getByText("No Project Loaded")).toBeInTheDocument();
    expect(
      screen.getByText(/Open a project workspace to inspect repository architecture/i)
    ).toBeInTheDocument();

    const openBtn = screen.getByRole("button", { name: /Open Project Folder/i });
    fireEvent.click(openBtn);
    expect(handleOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("renders all core workspace metrics with accurate values", () => {
    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
      />
    );

    expect(screen.getByTestId("metric-files")).toHaveTextContent("42");
    expect(screen.getByTestId("metric-modules")).toHaveTextContent("5");
    expect(screen.getByTestId("metric-symbols")).toHaveTextContent("128");
    expect(screen.getByTestId("metric-entry-points")).toHaveTextContent("3");
    expect(screen.getByTestId("metric-dependencies")).toHaveTextContent("18");
    // Unsupported (2) + Partial (1) = 3
    expect(screen.getByTestId("metric-unsupported")).toHaveTextContent("3");
  });

  it("metric cards have definition tooltips and trigger drill-down navigation", () => {
    const handleNavigate = vi.fn();
    const handleFilterStatus = vi.fn();

    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={handleNavigate}
        onFilterFilesByStatus={handleFilterStatus}
      />
    );

    // Total Files button
    const filesBtn = screen.getByTitle(/Total source and asset files tracked in workspace/i);
    expect(filesBtn).toBeInTheDocument();
    fireEvent.click(filesBtn);
    expect(handleNavigate).toHaveBeenCalledWith("explorer");

    // Modules button
    const modulesBtn = screen.getByTitle(/Directory modules clustered by import cohesion/i);
    expect(modulesBtn).toBeInTheDocument();
    fireEvent.click(modulesBtn);
    expect(handleNavigate).toHaveBeenCalledWith("architecture");

    // Symbols button
    const symbolsBtn = screen.getByTitle(/Functions, classes, interfaces, and methods parsed into SQLite/i);
    expect(symbolsBtn).toBeInTheDocument();
    fireEvent.click(symbolsBtn);
    expect(handleNavigate).toHaveBeenCalledWith("intelligence");

    // Dependencies button
    const depsBtn = screen.getByTitle(/External libraries declared in package manifests/i);
    expect(depsBtn).toBeInTheDocument();
    fireEvent.click(depsBtn);
    expect(handleNavigate).toHaveBeenCalledWith("dependencies");

    // Unsupported/Partial button
    const unsupBtn = screen.getByTitle(/Files skipped due to unsupported language/i);
    expect(unsupBtn).toBeInTheDocument();
    fireEvent.click(unsupBtn);
    expect(handleFilterStatus).toHaveBeenCalledWith("unsupported");
    expect(handleNavigate).toHaveBeenCalledWith("explorer");
  });

  it("renders detected frameworks and opens evidence modal upon clicking Inspect Evidence", () => {
    const handleNavigateFileLine = vi.fn();

    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
        onNavigateToFileLine={handleNavigateFileLine}
      />
    );

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Express")).toBeInTheDocument();

    const inspectButtons = screen.getAllByRole("button", { name: /Inspect evidence/i });
    expect(inspectButtons.length).toBe(2);

    // Click inspect on React
    fireEvent.click(inspectButtons[0]);

    // Modal opens
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("React Evidence")).toBeInTheDocument();
    expect(
      screen.getByText("Declared manifest dependency 'react' (Direct)")
    ).toBeInTheDocument();
    expect(screen.getByText("AST import of React module 'react'")).toBeInTheDocument();

    // Click jumping to line
    const fileLineBtn = screen.getByText("src/client/App.tsx:1");
    fireEvent.click(fileLineBtn);
    expect(handleNavigateFileLine).toHaveBeenCalledWith("src/client/App.tsx", 1);

    // Modal closes
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders language breakdown and filters files in Explorer on click", () => {
    const handleNavigate = vi.fn();
    const handleFilterLang = vi.fn();

    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={handleNavigate}
        onFilterFilesByLanguage={handleFilterLang}
      />
    );

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("3,200 lines")).toBeInTheDocument();
    expect(screen.getByText("65.5%")).toBeInTheDocument();

    const tsBtn = screen.getByText("TypeScript").closest("button")!;
    fireEvent.click(tsBtn);

    expect(handleFilterLang).toHaveBeenCalledWith("TypeScript");
    expect(handleNavigate).toHaveBeenCalledWith("explorer");
  });

  it("renders application entry points table and supports jump-to-code", () => {
    const handleNavigateFileLine = vi.fn();

    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
        onNavigateToFileLine={handleNavigateFileLine}
      />
    );

    expect(screen.getByTestId("entry-points-table")).toBeInTheDocument();
    expect(screen.getByText("package.json main")).toBeInTheDocument();
    expect(screen.getByText("Express HTTP Server Entry")).toBeInTheDocument();
    expect(screen.getByText("React DOM Root Entry")).toBeInTheDocument();

    const entryLink = screen.getByText("src/server/index.ts:10");
    fireEvent.click(entryLink);
    expect(handleNavigateFileLine).toHaveBeenCalledWith("src/server/index.ts", 10);
  });

  it("displays message when no frameworks are detected (e.g. negative fixture)", () => {
    const emptyFwData: OverviewDataDto = {
      ...mockOverviewData,
      frameworks: [],
    };

    render(
      <OverviewView
        currentProject={mockProject}
        initialData={emptyFwData}
        onNavigateToView={vi.fn()}
      />
    );

    expect(
      screen.getByText("No active frameworks detected based on code and manifest evidence.")
    ).toBeInTheDocument();
  });

  it("renders scan completion duration and files scanned/parsed banner", () => {
    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
      />
    );

    expect(screen.getByText(/Scan Time: 2\.15s/)).toBeInTheDocument();
    expect(screen.getByText(/Parsed: 39\/42 files/)).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders declared-only frameworks in a separate section", () => {
    render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
      />
    );

    expect(screen.getByTestId("declared-only-section")).toBeInTheDocument();
    expect(screen.getByTestId("declared-framework-vue")).toBeInTheDocument();
    expect(screen.getByText("Declared in Manifest (No Import Usage Detected)")).toBeInTheDocument();
  });

  it("confirms no composite health score exists anywhere in Overview UI", () => {
    const { container } = render(
      <OverviewView
        currentProject={mockProject}
        initialData={mockOverviewData}
        onNavigateToView={vi.fn()}
      />
    );

    // Rule compliance: Professional engineering workbench. No composite health score.
    const textContent = container.textContent || "";
    expect(textContent).not.toMatch(/health score/i);
    expect(textContent).not.toMatch(/grade/i);
    expect(textContent).not.toMatch(/overall rating/i);
  });

  it("strips the Windows UNC prefix and offers Re-analyze", () => {
    const onReanalyze = vi.fn();
    render(
      <OverviewView
        currentProject={{
          ...mockProject,
          root_path: "\\\\?\\D:\\repo\\arch-react-express",
        }}
        initialData={{
          ...mockOverviewData,
          root_path: "\\\\?\\D:\\repo\\arch-react-express",
        }}
        onNavigateToView={vi.fn()}
        onReanalyze={onReanalyze}
      />
    );

    expect(screen.getByText("D:\\repo\\arch-react-express")).toBeInTheDocument();
    expect(screen.queryByText(/\\\\\?\\/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }));
    expect(onReanalyze).toHaveBeenCalledTimes(1);
  });
});
