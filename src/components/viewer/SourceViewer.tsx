import React, { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import type { FileContentDto } from "@/types/ipc";

interface SourceViewerProps {
  fileContent: FileContentDto | null;
  isLoading: boolean;
  theme: "dark" | "light";
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  fileContent,
  isLoading,
  theme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

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
        {fileContent.is_truncated && (
          <span className="text-amber-400 text-micro bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
            Preview Truncated (File &gt; 10MB)
          </span>
        )}
      </div>

      {/* CodeMirror Host Container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
};

