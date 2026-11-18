import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MermaidViewer } from "./MermaidViewer";

describe("MermaidViewer Component", () => {
  const sampleLayered = `flowchart TD
    subgraph Layer1 ["1. Presentation Layer"]
        User["Client Browser"]
    end
    subgraph Layer2 ["2. Application Engine"]
        Shell["Interactive Shell"] --> Handlers["API Handlers"]
        Handlers --> ORM["Database ORM"]
    end
    subgraph Layer3 ["3. Persistence Layer"]
        DB[("Database Cluster")]
    end
    User -->|"HTTPS"| Shell
    ORM --> DB
    Handlers <-->|"Events"| Ext["External Services"]`;

  it("renders nodes, subgraphs, and edges correctly", () => {
    render(<MermaidViewer code={sampleLayered} title="Test Layered Diagram" />);

    expect(screen.getByText("Test Layered Diagram")).toBeInTheDocument();
    expect(screen.getByText("Client Browser")).toBeInTheDocument();
    expect(screen.getByText("Interactive Shell")).toBeInTheDocument();
    expect(screen.getByText("API Handlers")).toBeInTheDocument();
    expect(screen.getByText("Database ORM")).toBeInTheDocument();
    expect(screen.getByText("Database Cluster")).toBeInTheDocument();
    expect(screen.getByText("External Services")).toBeInTheDocument();

    // Check subgraphs
    expect(screen.getByText("1. Presentation Layer")).toBeInTheDocument();
    expect(screen.getByText("2. Application Engine")).toBeInTheDocument();
    expect(screen.getByText("3. Persistence Layer")).toBeInTheDocument();

    // Check edge labels
    expect(screen.getByText("HTTPS")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("renders single-line / flattened mermaid code cleanly", () => {
    const flattenedCode =
      'flowchart TD subgraph S1 ["Clients"] A["Web App"] end subgraph S2 ["Backend"] B["API Server"] end A -->|"REST"| B';

    render(<MermaidViewer code={flattenedCode} title="Flattened Diagram" />);

    expect(screen.getByText("Web App")).toBeInTheDocument();
    expect(screen.getByText("API Server")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("REST")).toBeInTheDocument();
  });

  it("renders operational decision diamonds and decision branch edges", () => {
    const operationalCode = `flowchart TD
    Start(["Begin"]) --> Step1["Process Input"]
    Step1 --> Dec1{"Is Valid?"}
    Dec1 -- "Yes" --> Success["Approve"]
    Dec1 -- "No" --> Fail["Reject"]`;

    render(<MermaidViewer code={operationalCode} title="Operational Flow" />);

    expect(screen.getByText("Begin")).toBeInTheDocument();
    expect(screen.getByText("Process Input")).toBeInTheDocument();
    expect(screen.getByText("Is Valid?")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("correctly parses unquoted branch labels with spaces and wraps long labels", () => {
    const codeWithSpaces = `flowchart TD
    Dec1{"Conflict?"}
    Dec1 -- Unique / Valid --> Step4["4. Persist transaction in Database & emit audit event"]
    Dec1 -- Duplicate --> Err409["409 Conflict"]`;

    render(<MermaidViewer code={codeWithSpaces} title="Operational Branching" />);

    expect(screen.getByText("Operational Branching")).toBeInTheDocument();
    expect(screen.getByText("Unique / Valid")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("409 Conflict")).toBeInTheDocument();
    // Long label gets split cleanly into tspans
    expect(screen.getByText("4. Persist transaction")).toBeInTheDocument();
  });

  it("handles zoom and copy controls", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<MermaidViewer code={"flowchart TD\nA --> B"} title="Interactive Diagram" />);

    const copyBtn = screen.getByTitle("Copy Mermaid Syntax");
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith("flowchart TD\nA --> B");

    // Zoom buttons
    const zoomInBtn = screen.getByTitle("Zoom In");
    const zoomOutBtn = screen.getByTitle("Zoom Out");
    const fitBtn = screen.getByTitle("Fit to Screen");
    const resetBtn = screen.getByTitle("Reset Zoom & Pan");

    expect(zoomInBtn).toBeInTheDocument();
    expect(zoomOutBtn).toBeInTheDocument();
    expect(fitBtn).toBeInTheDocument();
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetBtn);
  });
});
