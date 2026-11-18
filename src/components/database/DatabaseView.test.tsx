import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DatabaseView } from "./DatabaseView";
import * as tauri from "@/lib/tauri";

describe("DatabaseView", () => {
  it("renders only persisted explicit schemas and navigates to their declaration", async () => {
    vi.spyOn(tauri, "getDatabaseTables").mockResolvedValue([{ name: "users", file_path: "schema.sql", start_line: 1, end_line: 4, confidence: "static", source_evidence_id: 1, fields: [{ name: "id", declared_type: "INTEGER", is_primary_key: true, is_foreign_key: false, line: 2, source_evidence_id: 2 }] }]);
    const navigate = vi.fn(); render(<DatabaseView projectId={1} onNavigateToFileLine={navigate} />);
    expect(await screen.findByText("users")).toBeInTheDocument();
    expect(screen.getByText("PK")).toBeInTheDocument();
    fireEvent.click(screen.getByText("users")); expect(navigate).toHaveBeenCalledWith("schema.sql", 1);
  });
});
