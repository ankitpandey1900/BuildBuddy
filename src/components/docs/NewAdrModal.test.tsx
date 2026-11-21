import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewAdrModal } from "./NewAdrModal";

describe("NewAdrModal Component", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <NewAdrModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        existingAdrCount={0}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when isOpen is true with auto-incremented ADR number", () => {
    render(
      <NewAdrModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        existingAdrCount={3}
      />
    );

    expect(screen.getByText("New Architecture Decision Record")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0004")).toBeInTheDocument();
    expect(screen.getByLabelText(/ADR Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Decision Status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Context & Problem Statement/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Decision Outcome/i)).toBeInTheDocument();
  });

  it("displays validation error when required fields are missing", async () => {
    render(
      <NewAdrModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        existingAdrCount={0}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Create Record/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText("Please provide an ADR title.")).toBeInTheDocument();
  });

  it("submits properly formatted ADR markdown content and closes on success", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <NewAdrModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        existingAdrCount={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/ADR Title/i), {
      target: { value: "Adopt SQLite with FTS5" },
    });
    fireEvent.change(screen.getByLabelText(/Context & Problem Statement/i), {
      target: { value: "We need an offline search index with zero cloud overhead." },
    });
    fireEvent.change(screen.getByLabelText(/Decision Outcome/i), {
      target: { value: "Use rusqlite embedded database with FTS5 full-text indexing." },
    });
    fireEvent.change(screen.getByLabelText(/Consequences & Trade-offs/i), {
      target: { value: "Database file must be managed on disk with transactional integrity." },
    });

    const submitBtn = screen.getByRole("button", { name: /Create Record/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const [sectionKey, title, content] = onSave.mock.calls[0];
    expect(sectionKey).toBe("adr_0001_adopt_sqlite_with_fts5");
    expect(title).toBe("ADR-0001: Adopt SQLite with FTS5");
    expect(content).toContain("### ADR-0001: Adopt SQLite with FTS5");
    expect(content).toContain("- **Status**: Proposed");
    expect(content).toContain("#### Context & Problem Statement");
    expect(content).toContain("We need an offline search index with zero cloud overhead.");
    expect(content).toContain("#### Decision Outcome");
    expect(content).toContain("Use rusqlite embedded database with FTS5 full-text indexing.");
    expect(content).toContain("#### Consequences & Trade-offs");
    expect(content).toContain("Database file must be managed on disk with transactional integrity.");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the close button or cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <NewAdrModal
        isOpen={true}
        onClose={onClose}
        onSave={vi.fn()}
        existingAdrCount={0}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Close modal/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
