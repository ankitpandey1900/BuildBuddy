import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { DiagramModel, DiagramNode, PositionedModel } from "../../types/diagram";
import { classifyNodeLayer } from "../../components/architecture/utils/layers";

export interface ExcalidrawConversionOptions {
  theme?: "dark" | "light";
  columnsPerLayer?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  gapX?: number;
  gapY?: number;
}

/**
 * Palette inspired by professional system architecture documentation (Image 3 & Image 1)
 * Soft pastel surfaces with distinct, high-contrast borders and readable labels.
 */
const PALETTES = {
  dark: {
    canvasBg: "#0C0C0E",
    titleBorder: "#ec4899",     // Pink pill border
    titleBg: "#2d1222",         // Soft dark pink
    titleText: "#f472b6",
    frontend: {
      border: "#38bdf8",        // Sky blue
      bg: "#0c2135",            // Soft dark blue
      text: "#e0f2fe",
      pillBorder: "#0284c7",
      pillBg: "#0f2f4a",
    },
    gateway: {
      border: "#fbbf24",        // Amber / Yellow
      bg: "#2b1e07",            // Soft dark amber
      text: "#fef3c7",
      pillBorder: "#d97706",
      pillBg: "#3b2a0a",
    },
    backend: {
      border: "#4ade80",        // Emerald green
      bg: "#0a2618",            // Soft dark emerald
      text: "#dcfce7",
      pillBorder: "#16a34a",
      pillBg: "#0f3622",
    },
    data: {
      border: "#c084fc",        // Purple
      bg: "#201133",            // Soft dark purple
      text: "#f3e8ff",
      pillBorder: "#9333ea",
      pillBg: "#2d1847",
    },
    external: {
      border: "#94a3b8",        // Slate
      bg: "#181d24",            // Soft dark slate
      text: "#f1f5f9",
      pillBorder: "#64748b",
      pillBg: "#222933",
    },
    annotation: {
      border: "#fb7185",        // Rose
      bg: "#2e121a",
      text: "#fecdd3",
    },
    edge: "#94a3b8",
    edgeText: "#cbd5e1",
  },
  light: {
    canvasBg: "#FFFFFF",
    titleBorder: "#db2777",     // Pink pill border
    titleBg: "#fdf2f8",         // Soft pink
    titleText: "#be185d",
    frontend: {
      border: "#0284c7",        // Blue
      bg: "#f0f9ff",            // Light pastel blue
      text: "#0369a1",
      pillBorder: "#38bdf8",
      pillBg: "#ffffff",
    },
    gateway: {
      border: "#d97706",        // Amber
      bg: "#fffbeb",            // Light pastel amber
      text: "#b45309",
      pillBorder: "#f59e0b",
      pillBg: "#ffffff",
    },
    backend: {
      border: "#16a34a",        // Green
      bg: "#f0fdf4",            // Light pastel green
      text: "#15803d",
      pillBorder: "#4ade80",
      pillBg: "#ffffff",
    },
    data: {
      border: "#9333ea",        // Purple
      bg: "#faf5ff",            // Light pastel purple
      text: "#7e22ce",
      pillBorder: "#c084fc",
      pillBg: "#ffffff",
    },
    external: {
      border: "#475569",        // Slate
      bg: "#f8fafc",            // Light pastel slate
      text: "#334155",
      pillBorder: "#94a3b8",
      pillBg: "#ffffff",
    },
    annotation: {
      border: "#e11d48",        // Rose
      bg: "#fff1f2",
      text: "#be123c",
    },
    edge: "#475569",
    edgeText: "#1e293b",
  },
};

function getLayerStyle(pal: typeof PALETTES.dark, layer: string) {
  switch (layer) {
    case "frontend":
      return pal.frontend;
    case "backend":
      return pal.backend;
    case "data":
      return pal.data;
    case "shared":
    case "gateway":
      return pal.gateway;
    case "config":
    case "external":
    default:
      return pal.external;
  }
}

/**
 * 1. HIGH-LEVEL MULTI-TIER SYSTEM ARCHITECTURE GENERATOR
 * Replicates the clean multi-tier architecture diagram shown in Image 3 Panel 1:
 * - Top pink Title Pill: "① High Level System Architecture: <Project Name>"
 * - Layer 1: Frontend Presentation Tier (in soft pastel blue container with child component pills)
 * - Labelled bidirectional connectors: "Send commands / Invoke", "Events & state updates"
 * - Layer 2: API Gateway & Application Router Tier (in soft pastel amber container)
 * - Layer 3: Core Backend Logic & Services Tier (in soft pastel green container with module pills)
 * - Layer 4: Persistence & Database Schema Tier (in soft pastel purple container with table pills)
 * - Layer 5: External Dependencies & Packages Tier
 */
function buildHighLevelArchitectureExcalidraw(
  model: DiagramModel | PositionedModel,
  options: ExcalidrawConversionOptions
) {
  const theme = options.theme ?? "dark";
  const pal = PALETTES[theme];
  const rawElements: any[] = [];

  const startX = 60;
  let currentY = 50;
  const containerW = 760;

  // A. Top Header Pill: ① High Level System Architecture
  const titlePillW = 420;
  const titlePillH = 44;
  const titlePillX = startX + (containerW - titlePillW) / 2;

  rawElements.push({
    type: "rectangle",
    id: "title_pill",
    x: titlePillX,
    y: currentY,
    width: titlePillW,
    height: titlePillH,
    strokeColor: pal.titleBorder,
    backgroundColor: pal.titleBg,
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "① High Level System Architecture",
      fontSize: 16,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += titlePillH + 35;

  // Classify nodes into 4 core architectural tiers
  const frontendNodes: DiagramNode[] = [];
  const gatewayNodes: DiagramNode[] = [];
  const backendNodes: DiagramNode[] = [];
  const dataNodes: DiagramNode[] = [];
  const externalNodes: DiagramNode[] = [];

  model.nodes.forEach((node) => {
    const layer = classifyNodeLayer(node);
    if (layer === "frontend") {
      frontendNodes.push(node);
    } else if (layer === "data" || node.kind === "component" && (node.id.includes("api") || node.id.includes("route"))) {
      if (node.id.includes("api") || node.id.includes("route")) {
        gatewayNodes.push(node);
      } else {
        dataNodes.push(node);
      }
    } else if (layer === "external") {
      externalNodes.push(node);
    } else if (node.id.includes("api") || node.id.includes("server") || node.id.includes("route")) {
      gatewayNodes.push(node);
    } else {
      backendNodes.push(node);
    }
  });

  // Helper to draw a tier container with sub-component pills inside
  const drawTierCard = (
    tierId: string,
    tierTitle: string,
    tierSubtext: string,
    nodes: DiagramNode[],
    style: typeof pal.frontend,
    defaultPills: string[]
  ) => {
    const pillsToDisplay =
      nodes.length > 0
        ? nodes.slice(0, 10).map((n) => n.label.replace(/\s*\([^)]+\)$/, ""))
        : defaultPills;

    const pillsPerRow = 4;
    const pillW = 158;
    const pillH = 34;
    const pillGapX = 14;
    const pillGapY = 12;
    const paddingX = 26;
    const headerH = 46;

    const numRows = Math.max(1, Math.ceil(pillsToDisplay.length / pillsPerRow));
    const cardH = headerH + numRows * pillH + (numRows - 1) * pillGapY + 24;

    const cardY = currentY;

    // Outer Layer Box
    rawElements.push({
      type: "rectangle",
      id: `tier_${tierId}`,
      x: startX,
      y: cardY,
      width: containerW,
      height: cardH,
      strokeColor: style.border,
      backgroundColor: style.bg,
      fillStyle: "solid",
      strokeWidth: 2,
      roundness: { type: 3 },
      roughness: 0,
      label: {
        text: `${tierTitle}  —  ${tierSubtext}`,
        fontSize: 14,
        textAlign: "left",
        verticalAlign: "top",
      },
    });

    // Inner component pills
    pillsToDisplay.forEach((pillText, idx) => {
      const r = Math.floor(idx / pillsPerRow);
      const c = idx % pillsPerRow;

      const px = startX + paddingX + c * (pillW + pillGapX);
      const py = cardY + headerH + r * (pillH + pillGapY);

      rawElements.push({
        type: "rectangle",
        id: `pill_${tierId}_${idx}`,
        x: px,
        y: py,
        width: pillW,
        height: pillH,
        strokeColor: style.pillBorder,
        backgroundColor: style.pillBg,
        fillStyle: "solid",
        strokeWidth: 1.5,
        roundness: { type: 3 },
        roughness: 0,
        label: {
          text: pillText,
          fontSize: 12,
          textAlign: "center",
          verticalAlign: "middle",
        },
      });
    });

    currentY += cardH;
    return { y: cardY, height: cardH };
  };

  // Helper to draw bidirectional routed connectors between layers
  const drawBetweenLayerConnectors = (
    labelDown: string,
    labelUp: string
  ) => {
    const connectorH = 50;
    const centerY = currentY;

    const leftX = startX + containerW * 0.32;
    const rightX = startX + containerW * 0.68;

    // Downward arrow (left)
    rawElements.push({
      type: "arrow",
      id: `conn_down_${currentY}`,
      x: leftX,
      y: centerY,
      width: 0,
      height: connectorH,
      points: [
        [0, 0],
        [0, connectorH],
      ],
      endArrowhead: "arrow",
      strokeColor: pal.edge,
      strokeWidth: 1.5,
      roundness: { type: 2 },
      roughness: 0,
      label: { text: labelDown, fontSize: 11 },
    });

    // Upward arrow (right)
    rawElements.push({
      type: "arrow",
      id: `conn_up_${currentY}`,
      x: rightX,
      y: centerY + connectorH,
      width: 0,
      height: connectorH,
      points: [
        [0, 0],
        [0, -connectorH],
      ],
      endArrowhead: "arrow",
      strokeColor: pal.edge,
      strokeWidth: 1.5,
      roundness: { type: 2 },
      roughness: 0,
      label: { text: labelUp, fontSize: 11 },
    });

    currentY += connectorH;
  };

  // Tier 1: Frontend Presentation Tier
  drawTierCard(
    "frontend",
    "Frontend Presentation Tier",
    "Client UI, Views & State Store",
    frontendNodes,
    pal.frontend,
    ["Dashboard", "Explorer Tree", "Architecture Flow", "Intelligence", "Dependencies", "APIs", "Database", "Reports"]
  );

  drawBetweenLayerConnectors(
    "Send commands from UI to Core (invoke)",
    "Send progress/results to UI (events)"
  );

  // Tier 2: API Gateway & Application Router Tier
  drawTierCard(
    "gateway",
    "Application Gateway & IPC Bridge",
    "Request Controllers & Endpoints",
    gatewayNodes,
    pal.gateway,
    ["HTTP Routes", "Tauri IPC Handlers", "JSON API Bridge", "Request Dispatcher"]
  );

  drawBetweenLayerConnectors(
    "Execute domain logic & parsers",
    "Return structured data transfer objects"
  );

  // Tier 3: Core Backend Logic & Engine Tier
  drawTierCard(
    "backend",
    "Core Backend Engine & Domain Logic",
    "Static Parsers, Symbols & Graph Algorithms",
    backendNodes,
    pal.backend,
    ["Code Scanner", "Tree-Sitter Parser", "Symbol Indexer", "Graph Resolver", "Health Auditor", "Doc Generator"]
  );

  drawBetweenLayerConnectors(
    "Persist schema & query indexes",
    "Stream results & cached records"
  );

  // Tier 4: Persistence & Database Schema Tier
  drawTierCard(
    "data",
    "Data Storage & Persistence Tier",
    "Database Schemas, Entities & SQLite Index",
    dataNodes,
    pal.data,
    ["SQLite FTS5 DB", "Source Evidence", "Symbol Store", "Entities Table", "Graph Store", "Revision Logs"]
  );

  // Optional Side Annotation Callout Cloud (like in Image 1 & Image 2)
  const cloudX = startX + containerW + 40;
  const cloudY = 120;
  const cloudW = 280;
  const cloudH = 150;

  rawElements.push({
    type: "ellipse",
    id: "side_annotation_cloud",
    x: cloudX,
    y: cloudY,
    width: cloudW,
    height: cloudH,
    strokeColor: pal.annotation.border,
    backgroundColor: pal.annotation.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    strokeStyle: "dashed",
    roughness: 0,
    label: {
      text: "Local-First Engineering Architecture:\n• 100% Offline execution\n• Zero outbound network calls\n• Tree-sitter native AST parsing\n• Deterministic SQLite indexing",
      fontSize: 12,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Connector from cloud to Backend
  rawElements.push({
    type: "arrow",
    id: "cloud_connector",
    x: cloudX,
    y: cloudY + cloudH / 2,
    width: 30,
    height: 0,
    points: [
      [0, 0],
      [-30, 0],
    ],
    endArrowhead: "arrow",
    strokeColor: pal.annotation.border,
    strokeWidth: 1.5,
    roughness: 0,
  });

  return convertToExcalidrawElements(rawElements);
}

/**
 * 2. PIPELINE & OPERATIONAL FLOW GENERATOR
 * Replicates the multi-stage decision pipeline shown in Image 1 and Image 3 Panel 3:
 * - Start Box: Initial input
 * - Stage 1 Box: First tier filter
 * - Diamond: Decision condition with YES (downwards) and NO (side branch to discard)
 * - Stage 2 Box: Second tier
 * - Diamond: Decision condition
 * - Stage 3 Box: Full analysis
 * - Confirmed Output Box (in emerald green)
 * - Side cloud callouts explaining how each stage operates!
 */
function buildPipelineExcalidraw(
  _model: DiagramModel | PositionedModel,
  options: ExcalidrawConversionOptions
) {
  const theme = options.theme ?? "dark";
  const pal = PALETTES[theme];
  const rawElements: any[] = [];

  const centerX = 360;
  let currentY = 50;

  // Title Pill
  const titleW = 440;
  const titleH = 44;
  rawElements.push({
    type: "rectangle",
    id: "pipeline_title",
    x: centerX - titleW / 2,
    y: currentY,
    width: titleW,
    height: titleH,
    strokeColor: pal.titleBorder,
    backgroundColor: pal.titleBg,
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "③ Analysis & Data Processing Pipeline",
      fontSize: 16,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += titleH + 40;

  // Start Node
  const nodeW = 240;
  const nodeH = 56;
  const startX = centerX - nodeW / 2;

  rawElements.push({
    type: "rectangle",
    id: "step_start",
    x: startX,
    y: currentY,
    width: nodeW,
    height: nodeH,
    strokeColor: pal.frontend.border,
    backgroundColor: pal.frontend.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "All Workspace Files\n(Raw Source Code & Configs)",
      fontSize: 13,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Cloud annotation 1 on right
  rawElements.push({
    type: "ellipse",
    id: "cloud_1",
    x: startX + nodeW + 50,
    y: currentY - 10,
    width: 250,
    height: 80,
    strokeColor: pal.frontend.border,
    backgroundColor: pal.frontend.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    strokeStyle: "dashed",
    roughness: 0,
    label: {
      text: "Scans repository directories,\nrespects .gitignore, and filters\nout binary assets and builds.",
      fontSize: 11,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += nodeH + 35;

  // Arrow down
  rawElements.push({
    type: "arrow",
    id: "arrow_1",
    x: centerX,
    y: currentY - 35,
    width: 0,
    height: 35,
    points: [[0, 0], [0, 35]],
    endArrowhead: "arrow",
    strokeColor: pal.edge,
    strokeWidth: 1.5,
    roughness: 0,
  });

  // Decision Diamond 1: File Supported?
  const diamondSize = 110;
  rawElements.push({
    type: "diamond",
    id: "diamond_1",
    x: centerX - diamondSize / 2,
    y: currentY,
    width: diamondSize,
    height: diamondSize,
    strokeColor: pal.gateway.border,
    backgroundColor: pal.gateway.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    roughness: 0,
    label: {
      text: "File Language\nSupported?",
      fontSize: 11,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Discard branch (left)
  const discardW = 160;
  const discardH = 48;
  rawElements.push({
    type: "arrow",
    id: "arrow_discard_1",
    x: centerX - diamondSize / 2,
    y: currentY + diamondSize / 2,
    width: 60,
    height: 0,
    points: [[0, 0], [-60, 0]],
    endArrowhead: "arrow",
    strokeColor: pal.edge,
    strokeWidth: 1.5,
    roughness: 0,
    label: { text: "NO", fontSize: 11 },
  });

  rawElements.push({
    type: "rectangle",
    id: "box_discard_1",
    x: centerX - diamondSize / 2 - 60 - discardW,
    y: currentY + diamondSize / 2 - discardH / 2,
    width: discardW,
    height: discardH,
    strokeColor: pal.external.border,
    backgroundColor: pal.external.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "Skip File\n(Marked Unsupported)",
      fontSize: 11,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += diamondSize + 35;

  // Arrow YES down
  rawElements.push({
    type: "arrow",
    id: "arrow_yes_1",
    x: centerX,
    y: currentY - 35,
    width: 0,
    height: 35,
    points: [[0, 0], [0, 35]],
    endArrowhead: "arrow",
    strokeColor: pal.edge,
    strokeWidth: 1.5,
    roughness: 0,
    label: { text: "YES", fontSize: 11 },
  });

  // Stage 2: Tree-sitter AST Parsing
  rawElements.push({
    type: "rectangle",
    id: "step_2",
    x: startX,
    y: currentY,
    width: nodeW,
    height: nodeH,
    strokeColor: pal.backend.border,
    backgroundColor: pal.backend.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "Stage 2: Tree-sitter AST Parse\n(Extract Functions, Classes, Imports)",
      fontSize: 12,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Cloud annotation 2 on right
  rawElements.push({
    type: "ellipse",
    id: "cloud_2",
    x: startX + nodeW + 50,
    y: currentY - 10,
    width: 250,
    height: 80,
    strokeColor: pal.backend.border,
    backgroundColor: pal.backend.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    strokeStyle: "dashed",
    roughness: 0,
    label: {
      text: "Native tree-sitter grammars\nparse TypeScript, Python, Rust,\nand JSON into concrete syntax trees.",
      fontSize: 11,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += nodeH + 35;

  // Arrow down
  rawElements.push({
    type: "arrow",
    id: "arrow_2",
    x: centerX,
    y: currentY - 35,
    width: 0,
    height: 35,
    points: [[0, 0], [0, 35]],
    endArrowhead: "arrow",
    strokeColor: pal.edge,
    strokeWidth: 1.5,
    roughness: 0,
  });

  // Stage 3: Graph Resolution & SQLite Persist
  rawElements.push({
    type: "rectangle",
    id: "step_3",
    x: startX,
    y: currentY,
    width: nodeW,
    height: nodeH,
    strokeColor: pal.data.border,
    backgroundColor: pal.data.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "Stage 3: Graph Resolution\n(Resolve Imports & Persist Evidence)",
      fontSize: 12,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Cloud annotation 3 on right
  rawElements.push({
    type: "ellipse",
    id: "cloud_3",
    x: startX + nodeW + 50,
    y: currentY - 10,
    width: 250,
    height: 80,
    strokeColor: pal.data.border,
    backgroundColor: pal.data.bg,
    fillStyle: "solid",
    strokeWidth: 1.5,
    strokeStyle: "dashed",
    roughness: 0,
    label: {
      text: "Connects cross-module import paths,\nstores file line ranges, and builds\nSQLite FTS5 full-text index.",
      fontSize: 11,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += nodeH + 35;

  // Arrow down
  rawElements.push({
    type: "arrow",
    id: "arrow_3",
    x: centerX,
    y: currentY - 35,
    width: 0,
    height: 35,
    points: [[0, 0], [0, 35]],
    endArrowhead: "arrow",
    strokeColor: pal.edge,
    strokeWidth: 1.5,
    roughness: 0,
  });

  // Final Output Box: Confirmed Architecture Graph
  const finalW = 320;
  const finalH = 64;
  rawElements.push({
    type: "rectangle",
    id: "step_final",
    x: centerX - finalW / 2,
    y: currentY,
    width: finalW,
    height: finalH,
    strokeColor: pal.backend.border,
    backgroundColor: pal.backend.bg,
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "Confirmed System Intelligence Graph\n(Evidence-Backed Provenance Guaranteed)",
      fontSize: 13,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  return convertToExcalidrawElements(rawElements);
}

/**
 * 3. MODULE STRUCTURE & DIRECTORY TREE GENERATOR
 * Replicates the module structure view shown in Image 3 Panel 6:
 * - Top Title Pill: "⑥ Repository Module Architecture & Directory Structure"
 * - Root Module header box
 * - Child directory modules with file counts, layer tags, and cohesion scores
 * - Clear dependency arrows between modules
 */
function buildModuleStructureExcalidraw(
  model: DiagramModel | PositionedModel,
  options: ExcalidrawConversionOptions
) {
  const theme = options.theme ?? "dark";
  const pal = PALETTES[theme];
  const rawElements: any[] = [];

  const startX = 60;
  let currentY = 50;
  const containerW = 760;

  // Title Pill
  const titleW = 460;
  const titleH = 44;
  rawElements.push({
    type: "rectangle",
    id: "mod_title",
    x: startX + (containerW - titleW) / 2,
    y: currentY,
    width: titleW,
    height: titleH,
    strokeColor: pal.titleBorder,
    backgroundColor: pal.titleBg,
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "⑥ Repository Module Architecture & Structure",
      fontSize: 16,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += titleH + 35;

  // Root Box
  const rootW = 280;
  const rootH = 50;
  rawElements.push({
    type: "rectangle",
    id: "mod_root",
    x: startX + (containerW - rootW) / 2,
    y: currentY,
    width: rootW,
    height: rootH,
    strokeColor: pal.frontend.border,
    backgroundColor: pal.frontend.bg,
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    roughness: 0,
    label: {
      text: "src/ (Workspace Root)\n[Application Setup & Config]",
      fontSize: 13,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  currentY += rootH + 45;

  // Sub-modules grid
  const cols = 3;
  const modW = 224;
  const modH = 88;
  const gapX = 24;
  const gapY = 24;

  const nodePosMap = new Map<string, { x: number; y: number; width: number; height: number }>();

  model.nodes.forEach((node, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;

    const mx = startX + c * (modW + gapX);
    const my = currentY + r * (modH + gapY);

    nodePosMap.set(node.id, { x: mx, y: my, width: modW, height: modH });

    const layer = classifyNodeLayer(node);
    const style = getLayerStyle(pal, layer);

    const cleanName = node.label.replace(/\s*\([^)]+\)$/, "");
    const metricsText = node.metrics?.line_count
      ? `${node.metrics.line_count} lines`
      : "source module";

    rawElements.push({
      type: "rectangle",
      id: node.id,
      x: mx,
      y: my,
      width: modW,
      height: modH,
      strokeColor: style.border,
      backgroundColor: style.bg,
      fillStyle: "solid",
      strokeWidth: 1.5,
      roundness: { type: 3 },
      roughness: 0,
      label: {
        text: `${cleanName}\n[${layer.toUpperCase()}]\n${metricsText}`,
        fontSize: 12,
        textAlign: "center",
        verticalAlign: "middle",
      },
      customData: {
        nodeId: node.id,
        kind: node.kind,
        sourceRef: node.source_ref,
      },
    });
  });

  // Routed arrows for module imports
  const validIds = new Set(nodePosMap.keys());
  model.edges.forEach((edge) => {
    if (validIds.has(edge.from) && validIds.has(edge.to) && edge.from !== edge.to) {
      const fromPos = nodePosMap.get(edge.from)!;
      const toPos = nodePosMap.get(edge.to)!;

      rawElements.push({
        type: "arrow",
        id: edge.id,
        x: fromPos.x + fromPos.width / 2,
        y: fromPos.y + fromPos.height,
        width: Math.abs(toPos.x - fromPos.x),
        height: Math.abs(toPos.y - fromPos.y),
        points: [
          [0, 0],
          [toPos.x - fromPos.x, toPos.y - fromPos.y],
        ],
        endArrowhead: "arrow",
        strokeColor: pal.edge,
        strokeWidth: 1.5,
        roughness: 0,
        label: edge.label ? { text: edge.label, fontSize: 10 } : undefined,
      });
    }
  });

  return convertToExcalidrawElements(rawElements);
}

/**
 * Main dispatcher: converts any DiagramModel or PositionedModel into
 * rich, beautifully styled Excalidraw architectural artifacts.
 */
export function convertDiagramToExcalidraw(
  model: DiagramModel | PositionedModel,
  options: ExcalidrawConversionOptions = {}
) {
  if (model.diagram_type === "architecture_overview" || model.diagram_type === "system_flow") {
    return buildHighLevelArchitectureExcalidraw(model, options);
  }

  if (model.diagram_type === "module_dependency") {
    return buildModuleStructureExcalidraw(model, options);
  }

  if (model.diagram_type === "call_graph") {
    return buildPipelineExcalidraw(model, options);
  }

  // Fallback: build high level architecture
  return buildHighLevelArchitectureExcalidraw(model, options);
}
