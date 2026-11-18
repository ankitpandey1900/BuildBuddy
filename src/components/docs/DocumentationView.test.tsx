import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentationView } from "./DocumentationView";
import type { GeneratedDocument } from "@/types/ipc";

const mockDocument: GeneratedDocument = {
  doc_type: "hld",
  title: "High-Level Design (HLD): TestProject",
  sections: [
    {
      section_key: "system_context",
      title: "System Context & Boundaries",
      sort_order: 10,
      content: "TestProject is a web application with backend services.",
      content_hash: "hash-system-context",
      evidence_keys: ["src/index.ts:1-10:entry_point"],
      state: "generated",
    },
    {
      section_key: "architecture_style",
      title: "Architecture Style & Frameworks",
      sort_order: 20,
      content: "Modular monolith architecture using React and Express.",
      content_hash: "hash-arch-style",
      evidence_keys: ["package.json:1-5:manifest_entry"],
      state: "generated",
    },
  ],
};

describe("DocumentationView Component", () => {
  it("renders empty state when no project and no document provided", () => {
    render(<DocumentationView projectId={null} />);
    expect(screen.getByText("No project open")).toBeInTheDocument();
  });

  it("renders document types in the sidebar rail", () => {
    render(<DocumentationView projectId={1} initialDocument={mockDocument} />);

    expect(screen.getByText("Project Overview")).toBeInTheDocument();
    expect(screen.getByText("High-Level Design")).toBeInTheDocument();
    expect(screen.getByText("Low-Level Design")).toBeInTheDocument();
    expect(screen.getByText("API Documentation")).toBeInTheDocument();
    expect(screen.getByText("Database Documentation")).toBeInTheDocument();
    expect(screen.getByText("Security Audit Report")).toBeInTheDocument();
    expect(screen.getByText("Technical Debt Report")).toBeInTheDocument();
  });

  it("renders document title and section contents", () => {
    render(<DocumentationView projectId={1} initialDocument={mockDocument} />);

    expect(screen.getByText("High-Level Design (HLD): TestProject")).toBeInTheDocument();
    expect(screen.getByText("System Context & Boundaries")).toBeInTheDocument();
    expect(screen.getByText(/TestProject is a web application/i)).toBeInTheDocument();
    expect(screen.getByText("Architecture Style & Frameworks")).toBeInTheDocument();
  });

  it("allows switching between preview and edit modes", () => {
    render(<DocumentationView projectId={1} initialDocument={mockDocument} />);

    // Switch to Edit mode using SegmentedControl
    const editRadio = screen.getByRole("radio", { name: "Edit" });
    fireEvent.click(editRadio);

    // Textarea with section content should now be rendered
    const textarea = screen.getByDisplayValue("TestProject is a web application with backend services.");
    expect(textarea).toBeInTheDocument();

    // Switch back to Preview mode
    const previewRadio = screen.getByRole("radio", { name: "Preview" });
    fireEvent.click(previewRadio);

    // Textarea should no longer be present
    expect(screen.queryByDisplayValue("TestProject is a web application with backend services.")).not.toBeInTheDocument();
  });

  it("toggles revisions drawer when revisions button is clicked", () => {
    render(<DocumentationView projectId={1} initialDocument={mockDocument} />);

    const revisionsBtn = screen.getByText(/Revisions/i);
    fireEvent.click(revisionsBtn);

    expect(screen.getByText("Revision History")).toBeInTheDocument();
  });
});
