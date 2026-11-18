import React, { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { getFileSymbols } from "@/lib/tauri";
import type { FileContentDto, FileRecord, SymbolDto } from "@/types/ipc";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

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

      {/* Editor & Outline Container */}
      <div className="flex-1 flex h-[calc(100%-28px)] overflow-hidden">
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
