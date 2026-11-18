import React from "react";
import { MermaidViewer } from "./MermaidViewer";

export interface MarkdownRendererProps {
  content: string;
  theme?: "dark" | "light";
}

/**
 * Renders Markdown content while intercepting and rendering ```mermaid ... ``` code blocks
 * with our interactive MermaidViewer (supporting zoom, copy, fullscreen, and custom shapes).
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, theme = "dark" }) => {
  const parts = React.useMemo(() => {
    const segments: Array<{ type: "text" | "mermaid"; content: string; title?: string }> = [];
    const regex = /```mermaid\s*([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: "text",
          content: content.slice(lastIndex, match.index),
        });
      }

      // Check if preceding lines had a header
      const preText = content.slice(Math.max(0, match.index - 80), match.index);
      const headerMatch = preText.match(/###+\s*([^\n]+)\s*$/);

      segments.push({
        type: "mermaid",
        content: match[1].trim(),
        title: headerMatch ? headerMatch[1].trim() : undefined,
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex),
      });
    }

    return segments;
  }, [content]);

  return (
    <div className="space-y-4">
      {parts.map((part, idx) => {
        if (part.type === "mermaid") {
          return <MermaidViewer key={idx} code={part.content} title={part.title} theme={theme} />;
        }

        return (
          <div
            key={idx}
            className="prose prose-neutral dark:prose-invert max-w-none text-body leading-relaxed whitespace-pre-wrap font-sans text-text-primary"
          >
            {part.content}
          </div>
        );
      })}
    </div>
  );
};
