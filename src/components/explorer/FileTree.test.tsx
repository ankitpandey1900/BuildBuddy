import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTree } from "./FileTree";
import type { FileRecord } from "@/types/ipc";

const mockFiles: FileRecord[] = [
  {
    id: 1,
    project_id: 1,
    relative_path: "src/main.ts",
    file_name: "main.ts",
    extension: "ts",
    language_id: 1,
    size_bytes: 1024,
    line_count: 50,
    function_count: 3,
    class_count: 0,
    import_count: 2,
    content_hash: "hash1",
    status: "parsed",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    project_id: 1,
    relative_path: "package.json",
    file_name: "package.json",
    extension: "json",
    language_id: 2,
    size_bytes: 512,
    line_count: 20,
    function_count: 0,
    class_count: 0,
    import_count: 0,
    content_hash: "hash2",
    status: "parsed",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("FileTree Component", () => {
  it("renders search input and language filter buttons", () => {
    render(
      <FileTree
        files={mockFiles}
        selectedFile={null}
        searchQuery=""
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
        onSelectFile={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Search files...")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText(".ts")).toBeInTheDocument();
    expect(screen.getByText(".json")).toBeInTheDocument();
  });

  it("calls onSearchChange when user types in search input", () => {
    const handleSearch = vi.fn();
    render(
      <FileTree
        files={mockFiles}
        selectedFile={null}
        searchQuery=""
        onSearchChange={handleSearch}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
        onSelectFile={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText("Search files...");
    fireEvent.change(input, { target: { value: "main" } });
    expect(handleSearch).toHaveBeenCalledWith("main");
  });

  it("calls onLanguageFilterChange when clicking a language pill", () => {
    const handleLang = vi.fn();
    render(
      <FileTree
        files={mockFiles}
        selectedFile={null}
        searchQuery=""
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={handleLang}
        onSelectFile={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(".ts"));
    expect(handleLang).toHaveBeenCalledWith("ts");
  });

  it("uses 28px rows, a soft selection pill, and hides dot and ignored folders", () => {
    const hidden: FileRecord[] = [
      ...mockFiles,
      {
        ...mockFiles[0],
        id: 3,
        relative_path: ".git/config",
        file_name: "config",
        extension: null,
        line_count: 4,
      },
      {
        ...mockFiles[0],
        id: 4,
        relative_path: "node_modules/left-pad/index.js",
        file_name: "index.js",
        extension: "js",
        line_count: 12,
      },
    ];
    render(
      <FileTree
        files={hidden}
        selectedFile={mockFiles[0]}
        searchQuery=""
        onSearchChange={vi.fn()}
        languageFilter="all"
        onLanguageFilterChange={vi.fn()}
        onSelectFile={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.queryByText("config")).not.toBeInTheDocument();
    expect(screen.queryByText("index.js")).not.toBeInTheDocument();
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    const row = screen.getByText("main.ts").closest(".h-7");
    expect(row?.className).toContain("h-7");
    expect(row?.className).toContain("bg-accent-subtle");
  });
});

