import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineProgress } from "../PipelineProgress";

describe("PipelineProgress Component", () => {
  it("renders calm 3-stage progress for scanning", () => {
    render(
      <PipelineProgress
        stage="scan"
        filesProcessed={42}
        currentFile="src/core/scanner.rs"
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId("pipeline-progress")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-stage-scan")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-stage-parse")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-stage-analyze")).toBeInTheDocument();
    expect(screen.getByText("Scanning repository (42 files found)")).toBeInTheDocument();
    expect(screen.getByText("src/core/scanner.rs")).toBeInTheDocument();
  });

  it("renders parse stage with percentage and cancel button", () => {
    const handleCancel = vi.fn();
    render(
      <PipelineProgress
        stage="parse"
        filesProcessed={50}
        totalFiles={100}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Parsing symbols & AST (50 of 100 files)")).toBeInTheDocument();

    const cancelBtn = screen.getByTestId("pipeline-cancel-btn");
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("renders analyze stage smoothly", () => {
    render(
      <PipelineProgress
        stage="analyze"
      />
    );

    expect(
      screen.getByText("Analyzing dependency graph & relationships...")
    ).toBeInTheDocument();
  });

  it("renders plain-language error with Show details disclosure", () => {
    render(
      <PipelineProgress
        stage="error"
        error="Tree-sitter failed on unclosed token in legacy.js"
        errorDetails="SyntaxError: Unexpected end of input at legacy.js:42\n  at Parser.parse"
      />
    );

    expect(screen.getByTestId("pipeline-error")).toBeInTheDocument();
    expect(screen.getByText("The analysis pipeline was interrupted.")).toBeInTheDocument();
    expect(
      screen.getAllByText("Tree-sitter failed on unclosed token in legacy.js").length
    ).toBeGreaterThan(0);

    // Check disclosure
    const disclosure = screen.getByTestId("pipeline-error-disclosure");
    expect(disclosure).toBeInTheDocument();
    expect(screen.getByText("Show details")).toBeInTheDocument();
    expect(screen.getByText(/SyntaxError: Unexpected end of input/i)).toBeInTheDocument();
  });
});
