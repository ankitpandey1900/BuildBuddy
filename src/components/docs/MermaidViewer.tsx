import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Scan,
} from "lucide-react";

export interface MermaidViewerProps {
  code: string;
  title?: string;
  theme?: "dark" | "light";
}

interface ParsedNode {
  id: string;
  label: string;
  shape: "rect" | "pill" | "cylinder" | "diamond" | "subroutine";
  subgraph?: string;
}

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "thick" | "dotted" | "bidirectional";
}

interface ParsedSubgraph {
  id: string;
  label: string;
}

/**
 * Normalizes mermaid code if statements were joined on a single line or semicolons used.
 */
function normalizeMermaidCode(code: string): string {
  let s = code;
  s = s
    .replace(/;\s*/g, "\n")
    .replace(/(\S)\s+(subgraph\s+[a-zA-Z0-9_]+)/g, "$1\n$2")
    .replace(/(\S)\s+(end)(?=\s|$)/g, "$1\nend\n")
    .replace(/(\bend\b)\s*([a-zA-Z0-9_]+)/g, "$1\n$2")
    .replace(/([\]\)\}])\s+([a-zA-Z0-9_]+[\[\(\{])/g, "$1\n$2")
    .replace(/([\]\)\}])\s+([a-zA-Z0-9_]+\s*(?:-->|<-->|==>|-\.->|--))/g, "$1\n$2");
  return s;
}

/**
 * Wraps long label strings at word boundaries so SVG text never overflows node bounds.
 * Splits long words if they exceed maxLen.
 */
function wrapLabel(label: string, maxLen = 22): string[] {
  if (!label) return [];
  const rawLines = label.split("\n");
  const result: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxLen) {
      result.push(trimmed);
      continue;
    }
    const words = trimmed.split(/\s+/);
    let cur = "";
    for (const rawW of words) {
      // If a single word itself exceeds maxLen, break it into chunks
      const wChunks =
        rawW.length > maxLen
          ? rawW.match(new RegExp(`.{1,${maxLen}}`, "g")) || [rawW]
          : [rawW];
      for (const w of wChunks) {
        if (!cur) {
          cur = w;
        } else if ((cur + " " + w).length <= maxLen) {
          cur += " " + w;
        } else {
          result.push(cur);
          cur = w;
        }
      }
    }
    if (cur) result.push(cur);
  }
  return result.length > 0 ? result : [label];
}

/**
 * Parses Mermaid flowchart definitions (LR / TD) into renderable SVG nodes and edges.
 */
function parseMermaid(code: string) {
  const normalized = normalizeMermaidCode(code);
  const lines = normalized.split("\n");
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];
  const subgraphs = new Map<string, ParsedSubgraph>();

  let currentSubgraph: string | undefined = undefined;
  let direction: "LR" | "TD" = "TD";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%")) continue;

    if (line.startsWith("flowchart") || line.startsWith("graph")) {
      if (line.includes("LR")) direction = "LR";
      else direction = "TD";
      continue;
    }

    if (line.startsWith("subgraph")) {
      const match = line.match(/subgraph\s+([a-zA-Z0-9_]+)\s*(?:\["([^"]+)"\]|\[([^\]]+)\])?/);
      if (match) {
        const id = match[1];
        const label = match[2] || match[3] || id;
        currentSubgraph = id;
        subgraphs.set(id, { id, label });
      }
      continue;
    }

    if (line === "end") {
      currentSubgraph = undefined;
      continue;
    }

    // Pattern 1: A -- "label" --> B or A -- label with spaces --> B
    const matchWithMiddleLabel = line.match(
      /([a-zA-Z0-9_]+)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\[\([^)]*\)\])?\s*(--|==|-\.)\s*(?:"([^"]*)"|(.+?))\s*(-->|==>|\.->)\s*([a-zA-Z0-9_]+)/
    );
    if (matchWithMiddleLabel) {
      const from = matchWithMiddleLabel[1];
      const label = matchWithMiddleLabel[3] || matchWithMiddleLabel[4];
      const arrow = matchWithMiddleLabel[5];
      const to = matchWithMiddleLabel[6];
      const style: ParsedEdge["style"] =
        arrow === "==>" ? "thick" : arrow === ".->" ? "dotted" : "solid";
      edges.push({ from, to, label: label?.trim(), style });
    } else {
      // Pattern 2: A -->|"label"| B or A <-->|"label"| B or A --> B
      const matchDirect = line.match(
        /([a-zA-Z0-9_]+)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\[\([^)]*\)\])?\s*(<-->|<--|==>|-->|-\.->)\s*(?:\|"([^"]*)"\||\|([^|]*)\|)?\s*([a-zA-Z0-9_]+)/
      );
      if (matchDirect) {
        const from = matchDirect[1];
        const arrow = matchDirect[2];
        const label = matchDirect[3] || matchDirect[4];
        const to = matchDirect[5];
        const style: ParsedEdge["style"] =
          arrow === "<-->"
            ? "bidirectional"
            : arrow === "==>"
            ? "thick"
            : arrow === "-.->"
            ? "dotted"
            : "solid";
        edges.push({ from, to, label: label?.trim(), style });
      }
    }

    // Node definitions: cylinder, pill, diamond, rect, etc.
    const nodeRegex =
      /([a-zA-Z0-9_]+)\s*(\[\("([^"]*)"\)\]|\(\["([^"]*)"\]\)|\(\("([^"]*)"\)\)|\{"([^"]*)"\}|\["([^"]*)"\]|\("([^"]*)"\)|\(\[([^\]]+)\]\)|\{([^}]+)\}|\[([^\]]+)\]|\(([^)]+)\))/g;
    let nMatch: RegExpExecArray | null;
    while ((nMatch = nodeRegex.exec(line)) !== null) {
      const id = nMatch[1];
      const fullDelim = nMatch[2];
      let label = "";
      let shape: ParsedNode["shape"] = "rect";

      if (fullDelim.startsWith('[("')) {
        shape = "cylinder";
        label = nMatch[3];
      } else if (fullDelim.startsWith('(["') || fullDelim.startsWith('(("')) {
        shape = "pill";
        label = nMatch[4] || nMatch[5];
      } else if (fullDelim.startsWith('{"')) {
        shape = "diamond";
        label = nMatch[6];
      } else if (fullDelim.startsWith('["')) {
        shape = "rect";
        label = nMatch[7];
      } else if (fullDelim.startsWith('("')) {
        shape = "pill";
        label = nMatch[8];
      } else if (fullDelim.startsWith("([")) {
        shape = "pill";
        label = nMatch[9];
      } else if (fullDelim.startsWith("{")) {
        shape = "diamond";
        label = nMatch[10];
      } else if (fullDelim.startsWith("[")) {
        shape = "rect";
        label = nMatch[11];
      } else if (fullDelim.startsWith("(")) {
        shape = "pill";
        label = nMatch[12];
      }

      const finalLabel = label ? label.replace(/\\n/g, "\n").trim() : id;
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: finalLabel,
          shape,
          subgraph: currentSubgraph,
        });
      } else {
        const existing = nodes.get(id)!;
        if (finalLabel && existing.label === id) {
          existing.label = finalLabel;
          existing.shape = shape;
        }
        if (currentSubgraph && !existing.subgraph) {
          existing.subgraph = currentSubgraph;
        }
      }
    }
  }

  // Ensure all edge endpoints exist as nodes
  for (const e of edges) {
    if (!nodes.has(e.from)) {
      nodes.set(e.from, { id: e.from, label: e.from, shape: "rect" });
    }
    if (!nodes.has(e.to)) {
      nodes.set(e.to, { id: e.to, label: e.to, shape: "rect" });
    }
  }

  return { direction, nodes: Array.from(nodes.values()), edges, subgraphs: Array.from(subgraphs.values()) };
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code, title, theme = "dark" }) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseMermaid(code), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  // Simple, deterministic layered grid layout calculation for SVG
  const layout = useMemo(() => {
    const { direction, nodes, edges, subgraphs } = parsed;
    const isLR = direction === "LR";

    // Compute node ranks (distance from root)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }
    for (const e of edges) {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      adj.get(e.from)?.push(e.to);
    }

    const rankMap = new Map<string, number>();
    const queue: string[] = [];

    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        rankMap.set(id, 0);
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const u = queue.shift()!;
      const r = rankMap.get(u) || 0;
      for (const v of adj.get(u) || []) {
        const nextRank = Math.max(rankMap.get(v) || 0, r + 1);
        rankMap.set(v, nextRank);
        queue.push(v);
      }
    }

    // Default rank for unvisited nodes
    for (const n of nodes) {
      if (!rankMap.has(n.id)) rankMap.set(n.id, 0);
    }

    // Group nodes by rank
    const ranks = new Map<number, ParsedNode[]>();
    for (const n of nodes) {
      const r = rankMap.get(n.id) || 0;
      const list = ranks.get(r) || [];
      list.push(n);
      ranks.set(r, list);
    }

    const nodeCoords = new Map<string, { x: number; y: number; width: number; height: number }>();
    const nodeWidth = isLR ? 240 : 260;
    const baseNodeHeight = isLR ? 68 : 68;
    const gapX = isLR ? 160 : 120;  // Generous horizontal spacing to prevent text collision
    const gapY = isLR ? 55 : 80;

    const getNodeHeight = (n: ParsedNode) => {
      const maxChars = isLR ? 24 : 22;
      const wrapped = wrapLabel(n.label, maxChars);
      const lineH = 17;
      // Diamond nodes need extra vertical space for the pointed shape
      const extraForDiamond = n.shape === "diamond" ? 24 : 0;
      return Math.max(baseNodeHeight, wrapped.length * lineH + 34) + extraForDiamond;
    };

    // For TD: compute per-rank max column count to decide total canvas width (cap at 3 columns for human readability)
    const maxCols = 3;
    const effectiveRankCols = Math.min(
      maxCols,
      Math.max(...Array.from(ranks.values()).map((l) => l.length), 1)
    );
    const canvasCenterX = Math.max(500, (effectiveRankCols * (nodeWidth + gapX)) / 2 + 60);

    let maxX = Math.max(800, effectiveRankCols * (nodeWidth + gapX) + 120);
    let maxY = 450;

    if (isLR) {
      for (const [r, list] of ranks.entries()) {
        const x = 60 + r * (nodeWidth + gapX);
        const rankHeight =
          list.reduce((acc, n) => acc + getNodeHeight(n), 0) + (list.length - 1) * gapY;
        const startY = Math.max(60, 240 - rankHeight / 2);
        let currentY = startY;

        list.forEach((n) => {
          const nh = getNodeHeight(n);
          nodeCoords.set(n.id, { x, y: currentY, width: nodeWidth, height: nh });
          maxX = Math.max(maxX, x + nodeWidth + 80);
          maxY = Math.max(maxY, currentY + nh + 80);
          currentY += nh + gapY;
        });
      }
    } else {
      // TD Layout — wrap ranks with >3 nodes into a compact multi-row matrix (max 3 columns)
      let currentY = 60;
      for (const [, list] of ranks.entries()) {
        const cols = Math.min(maxCols, Math.max(1, list.length));
        const numRows = Math.ceil(list.length / cols);
        const rankW = cols * nodeWidth + (cols - 1) * gapX;
        const startX = Math.max(60, canvasCenterX - rankW / 2);

        for (let r = 0; r < numRows; r++) {
          const rowNodes = list.slice(r * cols, (r + 1) * cols);
          let maxRowH = baseNodeHeight;
          const rowStartX = startX + ((cols - rowNodes.length) * (nodeWidth + gapX)) / 2;

          rowNodes.forEach((n, cIdx) => {
            const nh = getNodeHeight(n);
            if (nh > maxRowH) maxRowH = nh;
            const x = rowStartX + cIdx * (nodeWidth + gapX);
            nodeCoords.set(n.id, { x, y: currentY, width: nodeWidth, height: nh });
            maxX = Math.max(maxX, x + nodeWidth + 80);
            maxY = Math.max(maxY, currentY + nh + 80);
          });

          currentY += maxRowH + (r < numRows - 1 ? 24 : gapY);
        }
      }
    }

    // Compute bounding boxes for subgraphs
    interface SubgraphBox {
      id: string;
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
    const subgraphBoxes: SubgraphBox[] = [];

    for (const sg of subgraphs) {
      const memberCoords = nodes
        .filter((n) => n.subgraph === sg.id)
        .map((n) => nodeCoords.get(n.id))
        .filter(Boolean) as { x: number; y: number; width: number; height: number }[];

      if (memberCoords.length > 0) {
        const minX = Math.min(...memberCoords.map((c) => c.x)) - 16;
        const minY = Math.min(...memberCoords.map((c) => c.y)) - 28;
        const maxBoxX = Math.max(...memberCoords.map((c) => c.x + c.width)) + 16;
        const maxBoxY = Math.max(...memberCoords.map((c) => c.y + c.height)) + 16;
        subgraphBoxes.push({
          id: sg.id,
          label: sg.label,
          x: minX,
          y: minY,
          width: maxBoxX - minX,
          height: maxBoxY - minY,
        });
        maxX = Math.max(maxX, maxBoxX + 40);
        maxY = Math.max(maxY, maxBoxY + 40);
      }
    }

    return { nodeCoords, subgraphBoxes, width: maxX, height: maxY };
  }, [parsed]);

  // Excalidraw Auto-Fit to Screen
  const fitToScreen = useCallback(() => {
    if (!viewportRef.current) return;
    const { clientWidth, clientHeight } = viewportRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const pad = 48;
    const safeW = Math.max(layout.width, 100);
    const safeH = Math.max(layout.height, 100);
    const scaleX = (clientWidth - pad) / safeW;
    const scaleY = (clientHeight - pad) / safeH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.25);

    const targetWidth = safeW * newZoom;
    const targetHeight = safeH * newZoom;

    const targetX = Math.round((clientWidth - targetWidth) / 2);
    const targetY = Math.round((clientHeight - targetHeight) / 2);

    setZoom(Number(newZoom.toFixed(2)));
    setPan({ x: targetX, y: targetY });
  }, [layout.width, layout.height]);

  useEffect(() => {
    fitToScreen();
    const timer = setTimeout(() => {
      fitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, [fitToScreen, isFullscreen, code]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(() => {
      fitToScreen();
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [fitToScreen]);

  // Excalidraw Mouse Drag & Wheel Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Attach non-passive wheel listener with pointer-anchored zoom & two-finger pan
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Pinch-to-zoom on trackpad: ctrlKey=true, deltaY = zoom delta
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prevZoom) => {
          const nextZoom = Math.min(3.5, Math.max(0.15, Number((prevZoom * zoomFactor).toFixed(3))));
          if (nextZoom === prevZoom) return prevZoom;
          setPan((prevPan) => {
            const scaleRatio = nextZoom / prevZoom;
            return {
              x: Math.round(cursorX - (cursorX - prevPan.x) * scaleRatio),
              y: Math.round(cursorY - (cursorY - prevPan.y) * scaleRatio),
            };
          });
          return nextZoom;
        });
      } else {
        // Two-finger pan (no ctrl) — deltaX/deltaY are scroll deltas
        setPan((p) => ({
          x: Math.round(p.x - e.deltaX),
          y: Math.round(p.y - e.deltaY),
        }));
      }
    };

    // { passive: false } is required so preventDefault() actually works
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      className={`border border-border-default rounded-lg overflow-hidden bg-surface transition-all flex flex-col ${
        isFullscreen ? "fixed inset-4 z-50 shadow-2xl" : "relative w-full h-full flex-1"
      }`}
      ref={containerRef}
      data-testid="mermaid-viewer"
    >
      {/* Top Header Controls */}
      <div className="px-3.5 py-2 border-b border-border-subtle bg-elevated/40 flex items-center justify-between text-xs font-mono text-text-secondary select-none flex-shrink-0">
        <span className="font-semibold text-text-primary text-[12px]">
          {title || "Architecture Workflow & Protocol Flow"}
        </span>

        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-hover hover:text-text-primary text-text-muted transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Expand Diagram"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-hover hover:text-text-primary text-text-muted transition-colors text-[11px]"
            title="Copy Mermaid Syntax"
          >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Excalidraw-Style Freeform Interactive Canvas */}
      <div
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative flex-1 w-full h-full min-h-[350px] overflow-hidden select-none bg-canvas"
        style={{
          cursor: isPanning ? "grabbing" : "grab",
          backgroundImage: theme === "dark"
            ? "radial-gradient(rgba(255,255,255,0.07) 1.2px, transparent 1.2px)"
            : "radial-gradient(rgba(0,0,0,0.09) 1.2px, transparent 1.2px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isPanning ? "none" : "transform 0.08s ease-out",
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="select-none"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            textRendering="geometricPrecision"
            shapeRendering="geometricPrecision"
          >
            <defs>
              <marker
                id="arrowhead-solid"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--text-muted)" />
              </marker>
              <marker
                id="arrowhead-start"
                viewBox="0 0 10 10"
                refX="1"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 10 1.5 L 0 5 L 10 8.5 z" fill="var(--text-muted)" />
              </marker>
              {/* Per-node clip paths — prevents text from escaping node bounds */}
              {parsed.nodes.map((node) => {
                const c = layout.nodeCoords.get(node.id);
                if (!c) return null;
                const px = node.shape === "diamond" ? 10 : 8;
                const py = node.shape === "diamond" ? 6 : 4;
                return (
                  <clipPath key={`clip-${node.id}`} id={`clip-${node.id}`}>
                    <rect
                      x={c.x + px}
                      y={c.y + py}
                      width={c.width - px * 2}
                      height={c.height - py * 2}
                    />
                  </clipPath>
                );
              })}
            </defs>

            {/* Subgraphs - Clean Neutral Boundary Boxes */}
            {layout.subgraphBoxes?.map((sg) => (
              <g key={`subgraph-${sg.id}`}>
                <rect
                  x={sg.x}
                  y={sg.y}
                  width={sg.width}
                  height={sg.height}
                  rx={8}
                  fill="var(--bg-elevated)"
                  fillOpacity={0.18}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={sg.x + 12}
                  y={sg.y + 18}
                  fill="var(--text-secondary)"
                  fontSize="11"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="600"
                  letterSpacing="0.02em"
                >
                  {sg.label}
                </text>
              </g>
            ))}

            {/* Edges - Neutral Engineering Hairlines */}
            {parsed.edges.map((edge, idx) => {
              const fromC = layout.nodeCoords.get(edge.from);
              const toC = layout.nodeCoords.get(edge.to);
              if (!fromC || !toC) return null;

              const isLR = parsed.direction === "LR";
              const startX = isLR ? fromC.x + fromC.width : fromC.x + fromC.width / 2;
              const startY = isLR ? fromC.y + fromC.height / 2 : fromC.y + fromC.height;
              const endX = isLR ? toC.x : toC.x + toC.width / 2;
              const endY = isLR ? toC.y + toC.height / 2 : toC.y;

              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;

              const pathData = isLR
                ? `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
                : `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeWidth={edge.style === "thick" ? 2 : 1.5}
                    strokeDasharray={edge.style === "dotted" ? "4 3" : undefined}
                    markerStart={edge.style === "bidirectional" ? "url(#arrowhead-start)" : undefined}
                    markerEnd="url(#arrowhead-solid)"
                  />
                  {edge.label && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-(edge.label.length * 3.25 + 10)}
                        y={-10}
                        width={edge.label.length * 6.5 + 20}
                        height={20}
                        rx={5}
                        fill="var(--bg-elevated)"
                        stroke="var(--border-subtle)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="var(--text-secondary)"
                        fontSize="11"
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontWeight="500"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes - Clean Neutral Styling with NO colored accent stripes */}
            {parsed.nodes.map((node) => {
              const c = layout.nodeCoords.get(node.id);
              if (!c) return null;

              const cx = c.x + c.width / 2;
              const cy = c.y + c.height / 2;

              if (node.shape === "diamond") {
                const wrapped = wrapLabel(node.label, 16);
                const rx = Math.min(c.width / 2, 95);
                const ry = Math.min(c.height / 2 + 8, 50);
                const points = `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
                const startY = cy - ((wrapped.length - 1) * 14) / 2 + 4;
                return (
                  <g key={node.id} className="cursor-pointer">
                    <polygon
                      points={points}
                      fill="var(--bg-surface)"
                      stroke="var(--border-strong)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={cx}
                      y={startY}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="11"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontWeight="600"
                      clipPath={`url(#clip-${node.id})`}
                    >
                      {wrapped.map((dl, i) => (
                        <tspan key={i} x={cx} dy={i === 0 ? 0 : "1.3em"}>
                          {dl}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              }

              if (node.shape === "cylinder") {
                const ellipseRy = 9;
                const bodyHeight = c.height - ellipseRy * 2;
                const wrapped = wrapLabel(node.label, 20);
                const lineHeight = 15;
                const textBlockH = wrapped.length * lineHeight;
                const startY = c.y + ellipseRy + bodyHeight / 2 - textBlockH / 2 + lineHeight / 2;
                return (
                  <g key={node.id} className="cursor-pointer">
                    {/* Cylinder body */}
                    <rect
                      x={c.x}
                      y={c.y + ellipseRy}
                      width={c.width}
                      height={Math.max(bodyHeight, 1)}
                      fill="var(--bg-surface)"
                      stroke="var(--border-strong)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Top cap (filled ellipse) */}
                    <ellipse
                      cx={cx}
                      cy={c.y + ellipseRy}
                      rx={c.width / 2}
                      ry={ellipseRy}
                      fill="var(--bg-elevated)"
                      stroke="var(--border-strong)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Bottom arc (dashed) */}
                    <ellipse
                      cx={cx}
                      cy={c.y + c.height - ellipseRy}
                      rx={c.width / 2}
                      ry={ellipseRy}
                      fill="none"
                      stroke="var(--border-strong)"
                      strokeWidth={1}
                      strokeDasharray="4 2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={cx}
                      y={startY}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="11.5"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontWeight="600"
                      clipPath={`url(#clip-${node.id})`}
                    >
                      {wrapped.map((ln, i) => (
                        <tspan key={i} x={cx} dy={i === 0 ? 0 : "1.35em"}>
                          {ln}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              }

              // Standard Rectangle / Pill Node
              const isPill = node.shape === "pill";
              const wrapped = wrapLabel(node.label, 22);
              const lineHeight = 16;
              const textBlockH = wrapped.length * lineHeight;
              const startY = cy - textBlockH / 2 + lineHeight / 2;
              return (
                <g key={node.id} className="cursor-pointer">
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.width}
                    height={c.height}
                    rx={isPill ? Math.min(c.height / 2, 24) : 7}
                    fill="var(--bg-surface)"
                    stroke={isPill ? "var(--border-strong)" : "var(--border-default)"}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={cx}
                    y={startY}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize="11.5"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    fontWeight="600"
                    clipPath={`url(#clip-${node.id})`}
                  >
                    {wrapped.map((ln, i) => (
                      <tspan key={i} x={cx} dy={i === 0 ? 0 : "1.35em"}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Floating Excalidraw Controls (Fit View, Zoom In, Zoom Out, Reset, Indicator) */}
        <div className="absolute bottom-3 right-3 flex items-center bg-surface/90 backdrop-blur-xs border border-border-default rounded-md shadow-md p-1 space-x-1 font-mono text-xs z-10 select-none">
          <button
            type="button"
            onClick={fitToScreen}
            className="flex items-center space-x-1 px-1.5 py-1 hover:bg-hover rounded text-text-muted hover:text-text-primary text-[11px]"
            title="Fit to Screen"
          >
            <Scan className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>
          <div className="w-[1px] h-3.5 bg-border-subtle" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))}
            className="p-1 hover:bg-hover rounded text-text-muted hover:text-text-primary"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 text-[11px] text-text-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.15).toFixed(2))))}
            className="p-1 hover:bg-hover rounded text-text-muted hover:text-text-primary"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3.5 bg-border-subtle" />
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1 hover:bg-hover rounded text-text-muted hover:text-text-primary"
            title="Reset Zoom & Pan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
