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
    accentColorDark: "#58A6FF",
    accentColorLight: "#0969DA",
    surfaceColorDark: "#1C2433",
    surfaceColorLight: "#EEF4FF",
    borderColorDark: "#263B5A",
    borderColorLight: "#B6D3FE",
    order: 1,
  },
  shared: {
    label: "Shared & Utils",
    accentColorDark: "#BC8CFF",
    accentColorLight: "#8250DF",
    surfaceColorDark: "#271F30",
    surfaceColorLight: "#F5EEFF",
    borderColorDark: "#433256",
    borderColorLight: "#D9C3FC",
    order: 2,
  },
  backend: {
    label: "Backend & Services",
    accentColorDark: "#3FB950",
    accentColorLight: "#1A7F37",
    surfaceColorDark: "#1A2824",
    surfaceColorLight: "#EBF8EE",
    borderColorDark: "#27483B",
    borderColorLight: "#A5DEC0",
    order: 3,
  },
  data: {
    label: "Data & Persistence",
    accentColorDark: "#D29922",
    accentColorLight: "#9A6700",
    surfaceColorDark: "#2B2319",
    surfaceColorLight: "#FFF8E6",
    borderColorDark: "#4D3D24",
    borderColorLight: "#F1D592",
    order: 4,
  },
  external: {
    label: "External Services",
    accentColorDark: "#BC8CFF",
    accentColorLight: "#8250DF",
    surfaceColorDark: "#271F30",
    surfaceColorLight: "#F5EEFF",
    borderColorDark: "#433256",
    borderColorLight: "#D9C3FC",
    order: 5,
  },
  config: {
    label: "Config & Tooling",
    accentColorDark: "#8B949E",
    accentColorLight: "#656D76",
    surfaceColorDark: "#21262D",
    surfaceColorLight: "#F0F2F5",
    borderColorDark: "#30363D",
    borderColorLight: "#D0D7DE",
    order: 6,
  },
  unclassified: {
    label: "Unclassified",
    accentColorDark: "#6E7681",
    accentColorLight: "#8C959F",
    surfaceColorDark: "#161B22",
    surfaceColorLight: "#FFFFFF",
    borderColorDark: "#30363D",
    borderColorLight: "#D0D7DE",
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
