import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders GFM tables with table, headers, and rows", () => {
    const tableMarkdown = `
| Language | Files | Lines | Percentage |
| --- | --- | --- | --- |
| TypeScript (TSX) | 116 | 27837 | 53.8% |
| TypeScript | 108 | 17907 | 34.6% |
| Markdown | 24 | 5283 | 10.2% |
`;

    render(<MarkdownRenderer content={tableMarkdown} />);

    // Assert table element
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Assert headers
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Lines")).toBeInTheDocument();
    expect(screen.getByText("Percentage")).toBeInTheDocument();

    // Assert cells
    expect(screen.getByText("TypeScript (TSX)")).toBeInTheDocument();
    expect(screen.getByText("27837")).toBeInTheDocument();
    expect(screen.getByText("53.8%")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
  });

  it("renders headings with proper semantic levels", () => {
    const md = `
# Main Title
## Subheading
### Section Header
#### Detail Header
`;
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByRole("heading", { level: 1, name: "Main Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Subheading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Section Header" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Detail Header" })).toBeInTheDocument();
  });

  it("renders bullet lists and numbered lists", () => {
    const md = `
- Bullet item 1
- Bullet item 2
- Bullet item 3

1. Numbered first
2. Numbered second
`;
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText("Bullet item 1")).toBeInTheDocument();
    expect(screen.getByText("Bullet item 2")).toBeInTheDocument();
    expect(screen.getByText("Numbered first")).toBeInTheDocument();
    expect(screen.getByText("Numbered second")).toBeInTheDocument();
  });

  it("renders inline bold, code, and links", () => {
    const md = "This is **important** with `inline_code` and a [link](https://example.com).";
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText("important")).toBeInTheDocument();
    expect(screen.getByText("inline_code")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders code blocks with language tag", () => {
    const md = `\`\`\`typescript
const greeting = "hello world";
console.log(greeting);
\`\`\``;
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText(/const greeting = "hello world";/)).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    const md = "> This is an architectural quote or note.";
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText("This is an architectural quote or note.")).toBeInTheDocument();
  });
});
