import React, { useEffect, useState } from "react";
import {
  BookOpen,
  RotateCcw,
  Download,
  History,
  Check,
  Layers,
  Code,
  Database,
  ShieldAlert,
  GitCommit,
  ExternalLink,
  ChevronRight,
  FileBarChart,
} from "lucide-react";
import type {
  DocumentType,
  GeneratedDocument,
  DocumentRevision,
} from "@/types/ipc";
import {
  getDocument,
  generateDocument,
  saveDocumentSection,
  listDocumentRevisions,
} from "@/lib/tauri";
import {
  Badge,
  Button,
  EmptyState,
  SegmentedControl,
} from "@/components/ui";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface DocumentationViewProps {
  projectId?: number | null;
  onNavigateToFileLine?: (filePath: string, line: number) => void;
  initialDocument?: GeneratedDocument | null;
}

interface DocumentItemConfig {
  type: DocumentType;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const DOCUMENT_ITEMS: DocumentItemConfig[] = [
  {
    type: "project_overview",
    title: "Project Overview",
    description: "Purpose, capabilities, stack, and entry points.",
    icon: BookOpen,
  },
  {
    type: "hld",
    title: "High-Level Design",
    description: "System boundaries, architecture pattern, and components.",
    icon: Layers,
  },
  {
    type: "lld",
    title: "Low-Level Design",
    description: "Module structure, classes, and function complexity.",
    icon: Code,
  },
  {
    type: "api_documentation",
    title: "API Documentation",
    description: "HTTP routes, controllers, and framework endpoints.",
    icon: ExternalLink,
  },
  {
    type: "database_documentation",
    title: "Database Documentation",
    description: "Declared database engines, SQL schemas, and fields.",
    icon: Database,
  },
  {
    type: "dependency_inventory",
    title: "Dependency Inventory",
    description: "Runtime, dev, and circular dependency tracking.",
    icon: ShieldAlert,
  },
  {
    type: "adrs",
    title: "Architecture Decisions",
    description: "Architecture decision records and technical logs.",
    icon: GitCommit,
  },
  {
    type: "security_report",
    title: "Security Audit Report",
    description: "Vulnerability analysis, secret scan, and dangerous sinks.",
    icon: ShieldAlert,
  },
  {
    type: "tech_debt_report",
    title: "Technical Debt Report",
    description: "Complexity hotspots, dead code, and dependency debt.",
    icon: FileBarChart,
  },
];

export const DocumentationView: React.FC<DocumentationViewProps> = ({
  projectId,
  onNavigateToFileLine,
  initialDocument,
}) => {
  const [selectedType, setSelectedType] = useState<DocumentType>(
    initialDocument?.doc_type ?? "project_overview"
  );
  const [document, setDocument] = useState<GeneratedDocument | null>(
    initialDocument ?? null
  );
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View vs Edit Mode
  const [mode, setMode] = useState<"preview" | "edit">("preview");

  // Revisions
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [isRevisionOpen, setIsRevisionOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<DocumentRevision | null>(null);

  // Section Editing State
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // Load document on change
  useEffect(() => {
    if (!projectId) {
      setDocument(null);
      return;
    }
    if (initialDocument && initialDocument.doc_type === selectedType) {
      setDocument(initialDocument);
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedRevision(null);

    getDocument(projectId, selectedType)
      .then((doc) => {
        setDocument(doc);
        const initialEdits: Record<string, string> = {};
        for (const sec of doc.sections) {
          initialEdits[sec.section_key] = sec.content;
        }
        setEditedSections(initialEdits);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));

    listDocumentRevisions(projectId, selectedType)
      .then(setRevisions)
      .catch(() => setRevisions([]));
  }, [projectId, selectedType, initialDocument]);

  const handleRegenerate = async () => {
    if (!projectId) return;
    setRegenerating(true);
    setError(null);
    try {
      const doc = await generateDocument(projectId, selectedType);
      setDocument(doc);
      const initialEdits: Record<string, string> = {};
      for (const sec of doc.sections) {
        initialEdits[sec.section_key] = sec.content;
      }
      setEditedSections(initialEdits);
      const revs = await listDocumentRevisions(projectId, selectedType);
      setRevisions(revs);
    } catch (err) {
      setError(String(err));
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveSection = async (sectionKey: string) => {
    if (!projectId) return;
    const content = editedSections[sectionKey];
    if (content === undefined) return;
    setSavingSection(sectionKey);
    try {
      await saveDocumentSection(projectId, selectedType, sectionKey, content);
      // Refresh document and revisions
      const doc = await getDocument(projectId, selectedType);
      setDocument(doc);
      const revs = await listDocumentRevisions(projectId, selectedType);
      setRevisions(revs);
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingSection(null);
    }
  };

  const handleExport = (format: "markdown" | "html") => {
    if (!document) return;
    const filenameBase = `${selectedType}_${new Date().toISOString().slice(0, 10)}`;
    const fullMd = document.sections
      .map((sec) => `## ${sec.title}\n\n${sec.content}`)
      .join("\n\n---\n\n");

    if (format === "markdown") {
      const blob = new Blob([`# ${document.title}\n\n${fullMd}`], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${filenameBase}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${document.title}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #24292f; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; }
th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
th { background: #f6f8fa; }
</style>
</head>
<body>
<h1>${document.title}</h1>
<pre>${fullMd.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`;
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${filenameBase}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="No project open"
          description="Open a project to generate and manage technical documentation."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 bg-canvas overflow-hidden" data-testid="documentation-view">
      {/* Sidebar: Document List */}
      <aside className="w-64 border-r border-border-default bg-surface flex flex-col flex-shrink-0">
        <header className="px-4 py-3.5 border-b border-border-default">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" />
            <span className="font-semibold text-text-primary text-body">Documents</span>
          </div>
        </header>

        <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Documentation Types">
          {DOCUMENT_ITEMS.map((item) => {
            const isSelected = selectedType === item.type;
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => setSelectedType(item.type)}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md text-left transition-colors focus-ring ${
                  isSelected
                    ? "bg-elevated text-text-primary font-medium"
                    : "text-text-secondary hover:text-text-primary hover:bg-hover"
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSelected ? "text-accent" : "text-text-muted"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-body font-medium truncate">{item.title}</div>
                  <div className="text-[11px] text-text-muted truncate mt-0.5 leading-snug">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Document Workspace */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-canvas overflow-hidden">
        {/* Document Header & Actions */}
        <header className="px-6 py-3.5 border-b border-border-default bg-surface flex items-center justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-subheading font-semibold text-text-primary truncate">
                {document?.title ?? "Loading document..."}
              </h1>
              {revisions.length > 0 && (
                <Badge variant="neutral" size="sm">
                  Rev {revisions[0]?.revision_number ?? 1}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-meta text-text-secondary">
              Deterministic, grounded facts extracted from indexed codebase architecture.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mode toggle */}
            <SegmentedControl
              items={[
                { id: "preview", label: "Preview" },
                { id: "edit", label: "Edit" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as "preview" | "edit")}
            />

            {/* Revisions button */}
            <Button
              variant="secondary"
              size="sm"
              icon={<History className="w-3.5 h-3.5" />}
              onClick={() => setIsRevisionOpen(!isRevisionOpen)}
            >
              Revisions ({revisions.length})
            </Button>

            {/* Regenerate */}
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />}
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              Regenerate
            </Button>

            {/* Export */}
            <Button
              variant="primary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => handleExport("markdown")}
            >
              Export .md
            </Button>
          </div>
        </header>

        {/* Error notification */}
        {error && (
          <div className="px-6 py-2 bg-danger-subtle text-danger-text border-b border-danger/30 text-meta flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-text-muted hover:text-text-primary text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Document Content View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20">
              <EmptyState
                title="Generating document"
                description="Extracting structured facts and synthesizing sections from offline analysis."
              />
            </div>
          ) : selectedRevision ? (
            /* Historical Revision View */
            <article className="max-w-4xl mx-auto border border-border-default rounded-md bg-surface p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
                <div>
                  <span className="font-semibold text-text-primary text-body">
                    Viewing Historical Revision #{selectedRevision.revision_number}
                  </span>
                  <span className="ml-3 text-meta text-text-muted">
                    {new Date(selectedRevision.created_at).toLocaleString()}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setSelectedRevision(null)}>
                  Return to Live Document
                </Button>
              </div>
              <pre className="font-mono text-body text-text-primary whitespace-pre-wrap leading-relaxed">
                {selectedRevision.content_markdown}
              </pre>
            </article>
          ) : document && document.sections.length > 0 ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {document.sections.map((section) => {
                const isEditing = mode === "edit";
                const isSaving = savingSection === section.section_key;
                const stateVariant =
                  section.state === "user_edited"
                    ? "accent"
                    : section.state === "stale"
                    ? "warning"
                    : "neutral";

                return (
                  <article
                    key={section.section_key}
                    className="border border-border-default rounded-md bg-surface overflow-hidden shadow-xs"
                    data-testid={`doc-section-${section.section_key}`}
                  >
                    {/* Section Header */}
                    <div className="px-5 py-3.5 border-b border-border-subtle bg-elevated/40 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-body font-semibold text-text-primary">
                          {section.title}
                        </h2>
                        <Badge variant={stateVariant} size="sm">
                          {section.state.replace("_", " ")}
                        </Badge>
                      </div>

                      {isEditing && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isSaving}
                            icon={<Check className="w-3.5 h-3.5" />}
                            onClick={() => handleSaveSection(section.section_key)}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Section Body */}
                    <div className="p-5">
                      {isEditing ? (
                        <textarea
                          rows={12}
                          className="w-full font-mono text-body bg-subtle text-text-primary p-3 rounded border border-border-default focus:border-border-focus focus:outline-none resize-y leading-relaxed"
                          value={editedSections[section.section_key] ?? section.content}
                          onChange={(e) =>
                            setEditedSections((prev) => ({
                              ...prev,
                              [section.section_key]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        <MarkdownRenderer content={section.content} />
                      )}

                      {/* Evidence Traceability Keys */}
                      {section.evidence_keys.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-mono text-text-muted mr-1">
                            Evidence:
                          </span>
                          {section.evidence_keys.map((evKey) => {
                            const [file, line] = evKey.split(":");
                            const lineNum = line ? parseInt(line, 10) : 1;
                            return (
                              <button
                                key={evKey}
                                type="button"
                                onClick={() => file && onNavigateToFileLine?.(file, isNaN(lineNum) ? 1 : lineNum)}
                                className="font-mono text-[11px] text-accent-text hover:underline focus-ring rounded-sm inline-flex items-center gap-1"
                              >
                                {evKey}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-20">
              <EmptyState
                icon={<BookOpen className="w-6 h-6" />}
                title="No documentation generated"
                description="Click Regenerate to synthesize this document from the codebase index."
              />
            </div>
          )}
        </div>
      </main>

      {/* Revision History Panel Drawer */}
      {isRevisionOpen && (
        <aside
          className="w-80 border-l border-border-default bg-surface flex flex-col flex-shrink-0 animate-in slide-in-from-right-4"
          data-testid="revisions-drawer"
        >
          <header className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-text-muted" />
              <span className="font-semibold text-text-primary text-body">Revision History</span>
            </div>
            <button
              type="button"
              onClick={() => setIsRevisionOpen(false)}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              Close
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {revisions.length === 0 ? (
              <p className="text-meta text-text-muted text-center py-8">
                No revisions recorded yet.
              </p>
            ) : (
              revisions.map((rev) => {
                const isSelected = selectedRevision?.revision_number === rev.revision_number;
                return (
                  <button
                    key={rev.revision_number}
                    type="button"
                    onClick={() => setSelectedRevision(rev)}
                    className={`w-full p-3 rounded-md text-left border transition-colors focus-ring ${
                      isSelected
                        ? "border-accent bg-accent-subtle/30"
                        : "border-border-default bg-elevated/40 hover:bg-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-text-primary text-body">
                        Revision #{rev.revision_number}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                    </div>
                    <div className="mt-1 text-meta text-text-muted">
                      {new Date(rev.created_at).toLocaleString()}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
