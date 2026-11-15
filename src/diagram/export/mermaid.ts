import type { DiagramModel, DiagramNode, DiagramEdge } from "../../types/diagram";

export interface MermaidExportOptions {
  direction?: "TD" | "LR";
}

/**
 * Sanitizes a node ID for valid use as a Mermaid node identifier.
 * Replaces colons, slashes, dashes, dots, and at-symbols with underscores.
 */
export function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Formats a single node in Mermaid syntax according to its kind.
 */
function formatNode(node: DiagramNode): string {
  const safeId = sanitizeMermaidId(node.id);
  const safeLabel = node.label.replace(/"/g, "'");

  switch (node.kind) {
    case "module":
      // Stadium shape
      return `${safeId}(["${safeLabel}"])`;
    case "component":
      // Subroutine shape
      return `${safeId}[["${safeLabel}"]]`;
    case "class":
      // Rectangle with class prefix
      return `${safeId}["[class] ${safeLabel}"]`;
    case "external":
      // Hexagon / asymmetric shape
      return `${safeId}{{"${safeLabel}"}}`;
    case "file":
    default:
      // Standard rectangle
      return `${safeId}["${safeLabel}"]`;
  }
}

/**
 * Formats an edge in Mermaid syntax according to its relationship and confidence.
 */
function formatEdge(edge: DiagramEdge): string {
  const fromId = sanitizeMermaidId(edge.from);
  const toId = sanitizeMermaidId(edge.to);

  let labelText = edge.label ? edge.label.replace(/"/g, "'") : edge.relationship;
  if (edge.confidence === "inferred") {
    labelText = `${labelText} [inferred]`;
  } else if (edge.confidence === "unknown") {
    labelText = `${labelText} [unknown]`;
  }

  switch (edge.relationship) {
    case "entry":
      return `${fromId} ==>|${labelText}| ${toId}`;
    case "instantiation":
    case "declared_dependency":
      return `${fromId} -.->|${labelText}| ${toId}`;
    case "inheritance":
      return `${fromId} --|>|${labelText}| ${toId}`;
    case "call":
    case "import":
    default:
      if (edge.confidence === "inferred") {
        return `${fromId} -.->|${labelText}| ${toId}`;
      }
      return `${fromId} -->|${labelText}| ${toId}`;
  }
}

/**
 * Converts a DiagramModel into a deterministic Mermaid graph definition.
 * Produces deterministic output sorted by group, node, and edge IDs.
 */
export function exportToMermaid(
  model: DiagramModel,
  options: MermaidExportOptions = {}
): string {
  const direction = options.direction || "TD";
  const lines: string[] = [`graph ${direction}`];

  // 1. Group nodes by group_id
  const groupMap = new Map<string, DiagramNode[]>();
  const topLevelNodes: DiagramNode[] = [];

  for (const node of model.nodes) {
    if (node.group_id) {
      const existing = groupMap.get(node.group_id) || [];
      existing.push(node);
      groupMap.set(node.group_id, existing);
    } else {
      topLevelNodes.push(node);
    }
  }

  // 2. Render subgraphs (sorted by group id)
  const sortedGroups = [...model.groups].sort((a, b) => a.id.localeCompare(b.id));

  for (const group of sortedGroups) {
    const safeGroupId = sanitizeMermaidId(group.id);
    const safeGroupLabel = group.label.replace(/"/g, "'");
    lines.push(`    subgraph ${safeGroupId} ["${safeGroupLabel}"]`);

    const groupNodes = groupMap.get(group.id) || [];
    const sortedGroupNodes = [...groupNodes].sort((a, b) => a.id.localeCompare(b.id));

    for (const node of sortedGroupNodes) {
      lines.push(`        ${formatNode(node)}`);
    }

    lines.push("    end");
  }

  // 3. Render top-level nodes (sorted by id)
  const sortedTopLevel = [...topLevelNodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of sortedTopLevel) {
    lines.push(`    ${formatNode(node)}`);
  }

  // 4. Render edges (sorted by id)
  const sortedEdges = [...model.edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const edge of sortedEdges) {
    lines.push(`    ${formatEdge(edge)}`);
  }

  return lines.join("\n");
}
