import React from "react";
import { MermaidViewer } from "./MermaidViewer";

export interface MarkdownRendererProps {
  content: string;
  theme?: "dark" | "light";
}

// Inline formatting parser: handles **bold**, *italic*, `code`, and [links](url)
function renderInlineFormatting(text: string): React.ReactNode {
  // Split by inline code: `...`
  const codeParts = text.split(/(`[^`]+`)/g);

  return codeParts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle font-mono text-xs text-accent"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Split by bold: **...**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={i}>
        {boldParts.map((bPart, j) => {
          if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length >= 4) {
            return (
              <strong key={j} className="font-semibold text-text-primary">
                {bPart.slice(2, -2)}
              </strong>
            );
          }

          // Split by links: [text](url)
          const linkParts = bPart.split(/(\[[^\]]+\]\([^)]+\))/g);
          return (
            <React.Fragment key={j}>
              {linkParts.map((lPart, k) => {
                const linkMatch = lPart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (linkMatch) {
                  return (
                    <a
                      key={k}
                      href={linkMatch[2]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline font-medium"
                    >
                      {linkMatch[1]}
                    </a>
                  );
                }
                return lPart;
              })}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  });
}

// Block parser: parses text into paragraphs, headings, tables, code blocks, and lists
function renderMarkdownBlocks(markdown: string): React.ReactNode {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Headings (#, ##, ###, ####)
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const key = `heading-${i}`;
        if (level === 1) {
          elements.push(
            <h1 key={key} className="text-xl font-semibold text-text-primary mt-6 mb-2 border-b border-border-default pb-1">
              {renderInlineFormatting(text)}
            </h1>
          );
        } else if (level === 2) {
          elements.push(
            <h2 key={key} className="text-lg font-semibold text-text-primary mt-5 mb-2 border-b border-border-subtle pb-1">
              {renderInlineFormatting(text)}
            </h2>
          );
        } else if (level === 3) {
          elements.push(
            <h3 key={key} className="text-sm font-semibold text-text-primary mt-4 mb-1">
              {renderInlineFormatting(text)}
            </h3>
          );
        } else {
          elements.push(
            <h4 key={key} className="text-xs font-semibold font-mono uppercase tracking-wider text-text-secondary mt-3 mb-1">
              {renderInlineFormatting(text)}
            </h4>
          );
        }
        i++;
        continue;
      }
    }

    // 2. Horizontal Rule (---, ***, ___)
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="border-border-default my-4" />);
      i++;
      continue;
    }

    // 3. Fenced Code Block (``` ... ```)
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const codeContent = codeLines.join("\n");

      if (lang === "mermaid") {
        elements.push(
          <div key={`mermaid-${i}`} className="my-4 rounded-lg bg-surface border border-border-default p-2 overflow-hidden shadow-xs">
            <MermaidViewer code={codeContent} />
          </div>
        );
        continue;
      }

      elements.push(
        <div key={`code-${i}`} className="my-3 rounded-md bg-surface border border-border-default overflow-hidden">
          {lang && (
            <div className="px-3 py-1 bg-elevated border-b border-border-subtle text-[11px] font-mono text-text-muted">
              {lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono overflow-x-auto text-text-primary leading-relaxed">
            <code>{codeContent}</code>
          </pre>
        </div>
      );
      continue;
    }

    // 4. Markdown Table (lines starting and ending with | or containing multiple |)
    if (trimmed.startsWith("|") && trimmed.includes("|", 1)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const splitRow = (rowStr: string) => {
          let s = rowStr.trim();
          if (s.startsWith("|")) s = s.slice(1);
          if (s.endsWith("|")) s = s.slice(0, -1);
          return s.split("|").map((c) => c.trim());
        };

        // Extract headers
        const headerCells = splitRow(tableLines[0]);

        // Check if line 1 is separator (e.g. |---|---| or |:---|---:|)
        const isSeparator = /^\|?(\s*:?-+:?\s*\|?)+$/.test(tableLines[1]);
        const startDataIdx = isSeparator ? 2 : 1;

        const bodyRows = tableLines.slice(startDataIdx).map((rowLine) => splitRow(rowLine));

        elements.push(
          <div key={`table-${i}`} className="my-4 overflow-x-auto rounded border border-border-default bg-surface/40 shadow-xs">
            <table className="w-full text-caption border-collapse font-sans">
              <thead>
                <tr className="bg-surface border-b border-border-default">
                  {headerCells.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-3.5 py-2.5 text-left text-xs font-semibold font-mono text-text-primary tracking-wide whitespace-nowrap"
                    >
                      {renderInlineFormatting(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-canvas">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-surface/60 transition-colors even:bg-surface/20">
                    {row.map((cell, cIdx) => {
                      const trimmedCell = cell.trim();
                      const upper = trimmedCell.toUpperCase();
                      const isHttpMethod = ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(upper);
                      const isNumeric = /^-?\d+(\.\d+)?%?$/.test(trimmedCell);

                      if (isHttpMethod) {
                        const methodClass =
                          upper === "GET"
                            ? "bg-status-success-bg text-status-success-text border-status-success-text/30"
                            : upper === "POST"
                            ? "bg-status-warning-bg text-status-warning-text border-status-warning-text/30"
                            : upper === "DELETE"
                            ? "bg-status-danger-bg text-status-danger-text border-status-danger-text/30"
                            : "bg-accent-subtle text-accent-text border-accent/30";
                        return (
                          <td key={cIdx} className="px-3.5 py-2 text-xs whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border inline-block select-none ${methodClass}`}>
                              {upper}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={cIdx}
                          className={`px-3.5 py-2 text-xs text-text-secondary whitespace-nowrap ${
                            isNumeric ? "font-mono text-right text-text-primary" : "font-sans"
                          }`}
                        >
                          {renderInlineFormatting(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 5. Blockquote (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-3 border-l-2 border-accent-default pl-3 py-1.5 italic text-text-secondary bg-surface/30 rounded-r text-xs leading-relaxed"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInlineFormatting(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 6. Bullet or Numbered Lists (- , * , 1. )
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const isOrdered = /^\d+\.\s+/.test(trimmed);
      const listItems: string[] = [];

      while (
        i < lines.length &&
        ((isOrdered && /^\d+\.\s+/.test(lines[i].trim())) ||
          (!isOrdered && /^[-*]\s+/.test(lines[i].trim())))
      ) {
        const itemText = isOrdered
          ? lines[i].trim().replace(/^\d+\.\s+/, "")
          : lines[i].trim().replace(/^[-*]\s+/, "");
        listItems.push(itemText);
        i++;
      }

      if (isOrdered) {
        elements.push(
          <ol key={`ol-${i}`} className="my-2 list-decimal pl-5 space-y-1 text-xs text-text-secondary leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineFormatting(item)}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${i}`} className="my-2 list-disc pl-5 space-y-1 text-xs text-text-secondary leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInlineFormatting(item)}</li>
            ))}
          </ul>
        );
      }
      continue;
    }

    // 7. Regular Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith(">") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\*\*\*|---|___)$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} className="text-xs text-text-secondary leading-relaxed my-1.5 font-sans">
          {renderInlineFormatting(paraLines.join(" "))}
        </p>
      );
    }
  }

  return <div className="space-y-1">{elements}</div>;
}

/**
 * Renders Markdown content while intercepting and rendering ```mermaid ... ``` code blocks
 * with our interactive MermaidViewer (supporting zoom, copy, fullscreen, and custom shapes),
 * and renders formatted tables, headings, lists, code, and inline elements.
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

        return <div key={idx}>{renderMarkdownBlocks(part.content)}</div>;
      })}
    </div>
  );
};
