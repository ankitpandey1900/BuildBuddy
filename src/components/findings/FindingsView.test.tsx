import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingsView } from "./FindingsView";

it("shows finding confidence and source provenance", () => {
  render(<FindingsView projectId={1} initialFindings={[{ id: 1, category: "complexity", title: "High complexity: calculate", description: "calculate has cyclomatic complexity 12.", severity: "medium", confidence: "static", file_path: "src/calc.ts", start_line: 12, end_line: 24, source_evidence_id: 8, metadata_json: "{}" }]} />);
  expect(screen.getByText("High complexity: calculate")).toBeInTheDocument();
  expect(screen.getByText("static")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "src/calc.ts:12" })).toBeInTheDocument();
});
