import React, { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { PanelRightClose, PanelRightOpen, Layers } from "lucide-react";

import { getFileSymbols } from "@/lib/tauri";
import type { FileContentDto, FileRecord, SymbolDto } from "@/types/ipc";

interface SourceViewerProps {
  selectedFile: FileRecord | null;
  fileContent: FileContentDto | null;
  isLoading: boolean;
  theme: "dark" | "light";
  targetLine?: number | null;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  selectedFile,
  fileContent,
  isLoading,
  theme,
  targetLine,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [symbols, setSymbols] = useState<SymbolDto[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);

  // Load symbols whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setSymbols([]);
      return;
    }

    getFileSymbols(selectedFile.id)
      .then((data: SymbolDto[]) => setSymbols(data || []))
      .catch((err: unknown) => {
        console.error("Failed to load symbols:", err);
        setSymbols([]);
      });
  }, [selectedFile?.id]);

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
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
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
    switch (kind) {
      case "function":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">fn</span>;
      case "class":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">cls</span>;
      case "method":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">mth</span>;
      case "interface":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">intf</span>;
      case "type_alias":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">type</span>;
      case "constant":
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">const</span>;
      default:
        return <span className="text-[10px] px-1 py-0.2 rounded font-mono font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">var</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas text-text-muted font-mono text-meta">
        <span>Loading file content...</span>
      </div>
    );
  }

  if (!fileContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-canvas text-text-muted gap-2 select-none">
        <p className="text-body font-medium text-text-secondary">No file selected</p>
        <p className="text-caption">Choose a file from the repository explorer to inspect its source code.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-canvas">
      {/* File Header */}
      <div className="h-7 bg-surface border-b border-border-default px-3 flex items-center justify-between select-none text-caption font-mono text-text-muted flex-shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="text-text-primary font-medium">{fileContent.file_name}</span>
          <span className="text-text-muted truncate">{fileContent.relative_path}</span>
        </div>
        <div className="flex items-center gap-3">
          {fileContent.is_truncated && (
            <span className="text-amber-400 text-micro bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
              Preview Truncated (File &gt; 10MB)
            </span>
          )}
          <button
            onClick={() => setIsOutlineOpen(!isOutlineOpen)}
            className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors text-micro"
            title={isOutlineOpen ? "Hide symbol outline" : "Show symbol outline"}
          >
            {isOutlineOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span>Outline ({symbols.length})</span>
          </button>
        </div>
      </div>

      {/* Editor & Outline Container */}
      <div className="flex-1 flex h-[calc(100%-28px)] overflow-hidden">
        {/* CodeMirror Host Container */}
        <div ref={containerRef} className="flex-1 h-full overflow-hidden" />

        {/* Symbol Outline Sidebar */}
        {isOutlineOpen && (
          <div className="w-64 border-l border-border-default bg-surface flex flex-col flex-shrink-0 overflow-hidden">
            <div className="h-7 px-3 border-b border-border-subtle flex items-center justify-between text-micro font-semibold uppercase tracking-wider text-text-muted select-none">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Outline
              </span>
              <span>{symbols.length} symbols</span>
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
