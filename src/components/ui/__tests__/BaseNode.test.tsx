import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
  BaseNodeContent,
  BaseNodeFooter,
} from "../base-node";
import {
  DatabaseSchemaNode,
  DatabaseSchemaNodeHeader,
  DatabaseSchemaNodeBody,
  DatabaseSchemaTableRow,
  DatabaseSchemaTableCell,
} from "../database-schema-node";
import { FloatingNodeToolbar } from "@/components/architecture/controls/FloatingNodeToolbar";

describe("Shadcn React Flow UI Components", () => {
  it("renders BaseNode and its sub-components with shadcn card styling", () => {
    render(
      <BaseNode data-testid="base-node" selected={true}>
        <BaseNodeHeader>
          <BaseNodeHeaderTitle>Auth Module</BaseNodeHeaderTitle>
        </BaseNodeHeader>
        <BaseNodeContent>
          <p>Handles JWT validation</p>
        </BaseNodeContent>
        <BaseNodeFooter>
          <span>4 files</span>
        </BaseNodeFooter>
      </BaseNode>
    );

    const node = screen.getByTestId("base-node");
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Auth Module")).toBeInTheDocument();
    expect(screen.getByText("Handles JWT validation")).toBeInTheDocument();
    expect(screen.getByText("4 files")).toBeInTheDocument();
  });

  it("renders DatabaseSchemaNode with header, rows, and cells", () => {
    render(
      <DatabaseSchemaNode data-testid="db-schema-node" selected={false}>
        <DatabaseSchemaNodeHeader>
          <span>Users</span>
        </DatabaseSchemaNodeHeader>
        <DatabaseSchemaNodeBody>
          <DatabaseSchemaTableRow>
            <DatabaseSchemaTableCell>id</DatabaseSchemaTableCell>
            <span>UUID</span>
          </DatabaseSchemaTableRow>
          <DatabaseSchemaTableRow>
            <DatabaseSchemaTableCell>email</DatabaseSchemaTableCell>
            <span>String</span>
          </DatabaseSchemaTableRow>
        </DatabaseSchemaNodeBody>
      </DatabaseSchemaNode>
    );

    expect(screen.getByTestId("db-schema-node")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("UUID")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("String")).toBeInTheDocument();
  });

  it("renders FloatingNodeToolbar when visible with jump-to-source action", () => {
    const onOpenSource = vi.fn();
    render(
      <ReactFlowProvider>
        <FloatingNodeToolbar
          isVisible={true}
          label="route.ts"
          kind="FILE"
          sourceFilePath="apps/api/src/route.ts"
          sourceLine={15}
          onOpenSource={onOpenSource}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText("route.ts")).toBeInTheDocument();
    expect(screen.getByText("FILE")).toBeInTheDocument();

    const sourceBtn = screen.getByRole("button", { name: /Source/i });
    expect(sourceBtn).toBeInTheDocument();
    fireEvent.click(sourceBtn);
    expect(onOpenSource).toHaveBeenCalledWith("apps/api/src/route.ts", 15);
  });
});
