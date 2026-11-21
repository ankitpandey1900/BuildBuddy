import type { DiagramNode, DiagramEdge, DiagramGroup } from "../../../types/diagram";

export type ArchitectureLayer =
  | "frontend"
  | "shared"
  | "backend"
  | "data"
  | "config"
  | "external"
  | "unclassified";

export interface LayerStyle {
  label: string;
  accentColorDark: string;
  accentColorLight: string;
  surfaceColorDark: string;
  surfaceColorLight: string;
  borderColorDark: string;
  borderColorLight: string;
  order: number;
}

export const LAYER_STYLES: Record<ArchitectureLayer, LayerStyle> = {
  frontend: {
    label: "Frontend",
    accentColorDark: "#0A84FF",
    accentColorLight: "#007AFF",
    surfaceColorDark: "rgba(10, 132, 255, 0.12)",
    surfaceColorLight: "rgba(0, 122, 255, 0.08)",
    borderColorDark: "#0A84FF",
    borderColorLight: "#007AFF",
    order: 1,
  },
  shared: {
    label: "Shared & Utils",
    accentColorDark: "#fbbf24",
    accentColorLight: "#d97706",
    surfaceColorDark: "#291e07",
    surfaceColorLight: "#fffbeb",
    borderColorDark: "#d97706",
    borderColorLight: "#f59e0b",
    order: 2,
  },
  backend: {
    label: "Backend & Services",
    accentColorDark: "#60a5fa",
    accentColorLight: "#2563eb",
    surfaceColorDark: "#111726",
    surfaceColorLight: "#eff6ff",
    borderColorDark: "#2563eb",
    borderColorLight: "#3b82f6",
    order: 3,
  },
  data: {
    label: "Data & Persistence",
    accentColorDark: "#10b981",
    accentColorLight: "#059669",
    surfaceColorDark: "#062b1f",
    surfaceColorLight: "#ecfdf5",
    borderColorDark: "#059669",
    borderColorLight: "#10b981",
    order: 4,
  },
  external: {
    label: "External Services",
    accentColorDark: "#cbd5e1",
    accentColorLight: "#475569",
    surfaceColorDark: "#181920",
    surfaceColorLight: "#f1f5f9",
    borderColorDark: "#2a2d38",
    borderColorLight: "#cbd5e1",
    order: 5,
  },
  config: {
    label: "Config & Tooling",
    accentColorDark: "#a855f7",
    accentColorLight: "#7e22ce",
    surfaceColorDark: "#20112b",
    surfaceColorLight: "#faf5ff",
    borderColorDark: "#9333ea",
    borderColorLight: "#a855f7",
    order: 6,
  },
  unclassified: {
    label: "Unclassified",
    accentColorDark: "#64748b",
    accentColorLight: "#94a3b8",
    surfaceColorDark: "#181920",
    surfaceColorLight: "#f8fafc",
    borderColorDark: "#2a2d38",
    borderColorLight: "#e2e8f0",
    order: 7,
  },
};

/**
 * Classify a node into an architectural layer based on its kind, path, group, or label.
 */
export function classifyNodeLayer(node: DiagramNode): ArchitectureLayer {
  if (node.kind === "external") {
    return "external";
  }

  const rawPath = (node.source_ref?.file_path || node.id || node.label).toLowerCase();
  const normalized = rawPath.replace(/\\/g, "/");

  // Config files
  if (
    normalized.endsWith(".json") ||
    normalized.endsWith(".toml") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml") ||
    normalized.includes("config") ||
    normalized.includes(".env") ||
    normalized.includes("settings")
  ) {
    return "config";
  }

  // Database / Models
  if (
    normalized.includes("model") ||
    normalized.includes("schema") ||
    normalized.includes("db/") ||
    normalized.includes("database") ||
    normalized.includes("repository") ||
    normalized.includes("entity") ||
    normalized.includes("entities") ||
    normalized.includes("prisma") ||
    normalized.endsWith(".sql")
  ) {
    return "data";
  }

  // Frontend / UI
  if (
    node.kind === "component" ||
    normalized.includes("client/") ||
    normalized.includes("ui/") ||
    normalized.includes("component") ||
    normalized.includes("pages/") ||
    normalized.includes("views/") ||
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".vue") ||
    normalized.endsWith(".svelte") ||
    normalized.endsWith(".css") ||
    normalized.endsWith(".html")
  ) {
    return "frontend";
  }

  // Shared / Utils
  if (
    normalized.includes("shared/") ||
    normalized.includes("common/") ||
    normalized.includes("utils/") ||
    normalized.includes("util/") ||
    normalized.includes("types/") ||
    normalized.includes("lib/") ||
    normalized.includes("helpers/")
  ) {
    return "shared";
  }

  // Backend / Services
  if (
    normalized.includes("server/") ||
    normalized.includes("api/") ||
    normalized.includes("controller") ||
    normalized.includes("route") ||
    normalized.includes("service") ||
    normalized.includes("handler") ||
    normalized.endsWith(".rs") ||
    normalized.endsWith(".py") ||
    normalized.endsWith(".go")
  ) {
    return "backend";
  }

  return "unclassified";
}

/**
 * Classify a group into an architectural layer.
 */
export function classifyGroupLayer(group: DiagramGroup): ArchitectureLayer {
  const label = (group.label || group.id).toLowerCase();
  if (label.includes("front") || label.includes("ui") || label.includes("client") || label.includes("view")) {
    return "frontend";
  }
  if (label.includes("share") || label.includes("util") || label.includes("common") || label.includes("lib")) {
    return "shared";
  }
  if (label.includes("back") || label.includes("server") || label.includes("api") || label.includes("service")) {
    return "backend";
  }
  if (label.includes("data") || label.includes("db") || label.includes("model") || label.includes("store")) {
    return "data";
  }
  if (label.includes("extern") || label.includes("vendor") || label.includes("pkg")) {
    return "external";
  }
  if (label.includes("config") || label.includes("tool") || label.includes("setting")) {
    return "config";
  }
  return "unclassified";
}

/**
 * Filter rule: Exclude dot-folders, node_modules, and build outputs from module nodes and groups.
 */
export function isIgnoredModuleOrDirectory(identifier: string): boolean {
  const clean = identifier.replace(/^group:(dir:)?/, "").replace(/^module:/, "").replace(/\\/g, "/");
  const segments = clean.split("/").filter(Boolean);

  const ignoredExact = new Set([
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    ".git",
    ".github",
    ".vscode",
    ".idea",
    ".next",
    ".turbo",
    ".cache",
    ".pytest_cache",
    "__pycache__",
  ]);

  for (const seg of segments) {
    if (ignoredExact.has(seg)) return true;
    if (seg.startsWith(".") && seg !== "." && seg !== "..") return true;
  }

  return false;
}

/**
 * Compute in-degree and out-degree for each node in a graph.
 */
export function computeNodeDegree(
  nodes: DiagramNode[],
  edges: DiagramEdge[]
): Map<string, { inDegree: number; outDegree: number }> {
  const map = new Map<string, { inDegree: number; outDegree: number }>();
  for (const n of nodes) {
    map.set(n.id, { inDegree: 0, outDegree: 0 });
  }

  for (const e of edges) {
    const fromStats = map.get(e.from);
    if (fromStats) fromStats.outDegree += 1;

    const toStats = map.get(e.to);
    if (toStats) toStats.inDegree += 1;
  }

  return map;
}
