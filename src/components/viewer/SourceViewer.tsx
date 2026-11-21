import React, { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Package,
} from "lucide-react";

import { getFileSymbols, getFileIntelligence } from "@/lib/tauri";
import type { FileContentDto, FileRecord, SymbolDto, FileIntelligenceDto } from "@/types/ipc";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

interface SourceViewerProps {
  selectedFile: FileRecord | null;
  fileContent: FileContentDto | null;
  isLoading: boolean;
  theme: "dark" | "light";
  targetLine?: number | null;
  onSelectFileByPath?: (filePath: string) => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  selectedFile,
  fileContent,
  isLoading,
  theme,
  targetLine,
  onSelectFileByPath,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [symbols, setSymbols] = useState<SymbolDto[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [intel, setIntel] = useState<FileIntelligenceDto | null>(null);
  const [isIntelExpanded, setIsIntelExpanded] = useState(false);

  // Load symbols and intelligence whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setSymbols([]);
      setIntel(null);
      return;
    }

    getFileSymbols(selectedFile.id)
      .then((data: SymbolDto[]) => setSymbols(data || []))
      .catch((err: unknown) => {
        console.error("Failed to load symbols:", err);
        setSymbols([]);
      });

    getFileIntelligence(selectedFile.project_id, selectedFile.relative_path)
      .then((data) => setIntel(data))
      .catch((err: unknown) => {
        console.error("Failed to load file intelligence:", err);
        setIntel(null);
      });
  }, [selectedFile?.id, selectedFile?.project_id, selectedFile?.relative_path]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    if (!fileContent) return;

    const getLanguageExtension = (ext: string | null) => {
      switch (ext?.toLowerCase()) {
        case "ts":
        case "tsx":
          return javascript({ typescript: true, jsx: true });
        case "js":
        case "jsx":
        case "mjs":
        case "cjs":
          return javascript({ jsx: true });
        case "py":
        case "pyw":
          return python();
        case "json":
          return json();
        case "md":
        case "markdown":
          return markdown();
        default:
          return [];
      }
    };

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      EditorView.editable.of(false), // STRICTLY READ-ONLY
      EditorState.readOnly.of(true),
      getLanguageExtension(fileContent.extension),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "12px",
          fontFamily: '"SF Mono", "Cascadia Code", Consolas, Menlo, Monaco, monospace',
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-primary)",
        },
        ".cm-gutters": {
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-muted)",
          borderRight: "1px solid var(--border-default)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--bg-hover)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--bg-hover)",
          color: "var(--text-primary)",
        },
      }),
    ];

    if (theme === "dark") {
      extensions.push(oneDark);
    } else {
      extensions.push(syntaxHighlighting(defaultHighlightStyle));
    }

    const state = EditorState.create({
      doc: fileContent.content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [fileContent, theme]);

  useEffect(() => {
    if (targetLine && viewRef.current) {
      jumpToLine(targetLine);
    }
  }, [targetLine, fileContent]);

  const jumpToLine = (lineNumber: number) => {
    if (!viewRef.current) return;
    try {
      const doc = viewRef.current.state.doc;
      const targetLine = Math.min(Math.max(1, lineNumber), doc.lines);
      const line = doc.line(targetLine);

      viewRef.current.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      viewRef.current.focus();
    } catch (e) {
      console.warn("Failed to jump to line:", e);
    }
  };

  const getKindBadge = (kind: string) => {
    const label =
      kind === "function"
        ? "fn"
        : kind === "class"
          ? "cls"
          : kind === "method"
            ? "mth"
            : kind === "interface"
              ? "intf"
              : kind === "type_alias"
                ? "type"
                : kind === "constant"
                  ? "const"
                  : "var";
    return (
      <span className="text-micro px-1 rounded-sm bg-elevated text-text-muted border border-border-subtle">
        {label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState title="Loading file" description="Reading source from the local index." />
      </div>
    );
  }

  if (!fileContent) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          title="No file selected"
          description="Choose a file from the repository explorer to inspect its source code."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-canvas">
      {/* File Header */}
      <div className="h-8 bg-surface border-b border-border-default px-3 flex items-center justify-between select-none text-caption text-text-muted flex-shrink-0">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="font-mono text-text-primary truncate">
            {fileContent.relative_path.split("/").join(" / ")}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-text-secondary">{fileContent.extension || "text"}</span>
          <span className="tabular-nums">{fileContent.content.split("\n").length} lines</span>
          {fileContent.is_truncated && (
            <span className="text-text-muted text-micro">Preview truncated</span>
          )}
          <Button
            variant="plain"
            size="sm"
            onClick={() => setIsOutlineOpen(!isOutlineOpen)}
            title={isOutlineOpen ? "Hide symbol outline" : "Show symbol outline"}
            icon={
              isOutlineOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )
            }
          >
            Outline
          </Button>
        </div>
      </div>

      {/* File Intelligence & Blast Radius Banner */}
      {intel && (
        <div className="border-b border-border-default bg-surface/30 px-3 py-1.5 flex-shrink-0 text-caption select-none">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate min-w-0">
              {/* Role Badge */}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface text-text-primary border border-border-subtle shrink-0">
                {intel.role}
              </span>

              {/* Blast Radius Pill */}
              {intel.blast_radius_level === "critical" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                  <ShieldAlert className="w-3 h-3" /> Critical ({intel.direct_dependants.length} dependents)
                </span>
              ) : intel.blast_radius_level === "warning" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                  <AlertTriangle className="w-3 h-3" /> Warning ({intel.direct_dependants.length} dependents)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface text-text-muted border border-border-subtle shrink-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Low Blast Radius
                </span>
              )}

              {/* Explanation Summary */}
              <span className="text-text-secondary truncate text-caption font-sans">
                {intel.explanation}
              </span>
            </div>

            {/* Expand / Collapse Button */}
            <button
              onClick={() => setIsIntelExpanded(!isIntelExpanded)}
              className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 shrink-0 font-mono"
            >
              {isIntelExpanded ? (
                <>Less <ChevronDown className="w-3 h-3" /></>
              ) : (
                <>Details <ChevronRight className="w-3 h-3" /></>
              )}
            </button>
          </div>

          {/* Expanded Drawer */}
          {isIntelExpanded && (
            <div className="mt-2 pt-2 border-t border-border-subtle/60 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Dependent Files ({intel.direct_dependants.length})</span>
                </div>
                {intel.direct_dependants.length === 0 ? (
                  <div className="text-text-muted italic text-[11px]">No internal files depend directly on this file.</div>
                ) : (
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                    {intel.direct_dependants.map((dep: string) => (
                      <button
                        key={dep}
                        onClick={() => onSelectFileByPath?.(dep)}
                        className="px-1.5 py-0.5 rounded bg-surface hover:bg-hover border border-border-subtle font-mono text-[10px] text-accent hover:underline transition-colors truncate max-w-xs text-left"
                        title={dep}
                      >
                        {dep}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider mb-1 flex items-center gap-1">
                  <Package className="w-3 h-3 text-blue-400" />
                  <span>External Packages Used ({intel.external_packages_used.length})</span>
                </div>
                {intel.external_packages_used.length === 0 ? (
                  <div className="text-text-muted italic text-[11px]">No external package imports detected.</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {intel.external_packages_used.map((pkg: string) => (
                      <span
                        key={pkg}
                        className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle font-mono text-[10px] text-text-secondary"
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor & Outline Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* CodeMirror Host Container */}
        <div ref={containerRef} className="flex-1 h-full overflow-hidden" />

        {/* Symbol Outline Sidebar */}
        {isOutlineOpen && (
          <div className="w-64 border-l border-border-default bg-surface flex flex-col flex-shrink-0 overflow-hidden">
            <div className="h-8 px-3 border-b border-border-subtle flex items-center justify-between text-body font-semibold text-text-primary select-none">
              <span>Outline</span>
              <span className="text-caption font-normal text-text-muted">{symbols.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
              {symbols.length === 0 ? (
                <div className="p-4 text-center text-text-muted text-caption">
                  No extracted symbols for this file.
                </div>
              ) : (
                symbols.map((sym) => (
                  <button
                    key={sym.stable_id}
                    onClick={() => jumpToLine(sym.start_line)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-hover flex items-center justify-between gap-1.5 group transition-colors text-caption"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      {getKindBadge(sym.kind)}
                      <span className="truncate text-text-primary font-mono group-hover:text-accent transition-colors">
                        {sym.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-text-muted flex-shrink-0">
                      L{sym.start_line}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
