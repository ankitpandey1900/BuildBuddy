import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiView } from "./ApiView";

describe("ApiView", () => {
  it("shows only evidence-backed endpoint rows and navigates to their declaration", () => {
    const navigate = vi.fn();
    render(<ApiView projectId={1} onNavigateToFileLine={navigate} initialEndpoints={[{
      id: 1, framework: "Express", method: "GET", route: "/api/health", controller_name: "healthHandler",
      file_path: "src/server.ts", start_line: 6, end_line: 6, snippet: "app.get('/api/health', healthHandler)", confidence: "static", source_evidence_id: 44,
    }]} />);
    expect(screen.getByText("/api/health")).toBeInTheDocument();
    expect(screen.getByText("src/server.ts:6")).toBeInTheDocument();
    expect(screen.getByText("static")).toBeInTheDocument();
    fireEvent.click(screen.getByText("/api/health"));
    expect(navigate).toHaveBeenCalledWith("src/server.ts", 6);
  });

  it("states the next action when no endpoint is stored", () => {
    render(<ApiView projectId={1} initialEndpoints={[]} />);
    expect(screen.getByText("No API endpoints detected")).toBeInTheDocument();
    expect(screen.getByText(/Run analysis on an Express, FastAPI, or Flask project/)).toBeInTheDocument();
  });
});
