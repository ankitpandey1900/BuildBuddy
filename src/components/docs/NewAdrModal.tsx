import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type AdrStatus = "Proposed" | "Accepted" | "Deprecated" | "Superseded";

export interface NewAdrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sectionKey: string, title: string, content: string) => Promise<void>;
  existingAdrCount: number;
}

export const NewAdrModal: React.FC<NewAdrModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingAdrCount,
}) => {
  const nextNumber = String(existingAdrCount + 1).padStart(4, "0");
  const [adrNumber, setAdrNumber] = useState(nextNumber);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<AdrStatus>("Proposed");
  const [context, setContext] = useState("");
  const [decision, setDecision] = useState("");
  const [consequences, setConsequences] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const num = String(existingAdrCount + 1).padStart(4, "0");
      setAdrNumber(num);
      setTitle("");
      setStatus("Proposed");
      setContext("");
      setDecision("");
      setConsequences("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, existingAdrCount]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      setError("Please provide an ADR title.");
      return;
    }
    if (!context.trim()) {
      setError("Please provide the context & problem statement.");
      return;
    }
    if (!decision.trim()) {
      setError("Please provide the decision outcome.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const fullTitle = `ADR-${adrNumber}: ${title.trim()}`;
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const sectionKey = `adr_${adrNumber}_${slug || "record"}`;

    const today = new Date().toISOString().slice(0, 10);
    const content = `### ${fullTitle}

- **Status**: ${status}
- **Date**: ${today}

#### Context & Problem Statement
${context.trim()}

#### Decision Outcome
${decision.trim()}

#### Consequences & Trade-offs
${consequences.trim() || "No specific negative trade-offs identified at this stage."}`;

    try {
      await onSave(sectionKey, fullTitle, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border-default bg-surface text-left">
          <DialogTitle className="text-subheading font-semibold text-text-primary">
            New Architecture Decision Record
          </DialogTitle>
          <DialogDescription className="text-meta text-text-muted mt-0.5">
            Record a verified architectural choice, rationale, and consequences.
          </DialogDescription>
        </DialogHeader>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-status-danger-bg border border-status-danger-border text-status-danger-text text-meta">
              {error}
            </div>
          )}

          {/* Number & Title */}
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div>
              <label htmlFor="adr-number" className="block text-meta font-medium text-text-secondary mb-1">
                Number
              </label>
              <input
                id="adr-number"
                type="text"
                value={adrNumber}
                onChange={(e) => setAdrNumber(e.target.value)}
                className="w-full h-8 px-2.5 bg-canvas border border-border-default rounded-sm font-mono text-body text-text-primary focus:border-border-focus focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="adr-title" className="block text-meta font-medium text-text-secondary mb-1">
                ADR Title <span className="text-status-danger-text">*</span>
              </label>
              <input
                id="adr-title"
                type="text"
                required
                autoFocus
                placeholder="e.g. Use SQLite with FTS5 for Codebase Intelligence"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-8 px-2.5 bg-canvas border border-border-default rounded-sm text-body text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
              />
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label htmlFor="adr-status" className="block text-meta font-medium text-text-secondary mb-1">
              Decision Status
            </label>
            <select
              id="adr-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AdrStatus)}
              className="w-full h-8 px-2.5 bg-canvas border border-border-default rounded-sm text-body text-text-primary focus:border-border-focus focus:outline-none cursor-pointer"
            >
              <option value="Proposed">Proposed</option>
              <option value="Accepted">Accepted</option>
              <option value="Deprecated">Deprecated</option>
              <option value="Superseded">Superseded</option>
            </select>
          </div>

          {/* Context */}
          <div>
            <label htmlFor="adr-context" className="block text-meta font-medium text-text-secondary mb-1">
              Context & Problem Statement <span className="text-status-danger-text">*</span>
            </label>
            <textarea
              id="adr-context"
              required
              rows={3}
              placeholder="What is the context, architectural constraint, or technical problem being addressed?"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full p-2.5 bg-canvas border border-border-default rounded-sm text-body text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none resize-y"
            />
          </div>

          {/* Decision */}
          <div>
            <label htmlFor="adr-decision" className="block text-meta font-medium text-text-secondary mb-1">
              Decision Outcome <span className="text-status-danger-text">*</span>
            </label>
            <textarea
              id="adr-decision"
              required
              rows={3}
              placeholder="What architecture choice was made? What concrete design, pattern, or dependency is chosen?"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              className="w-full p-2.5 bg-canvas border border-border-default rounded-sm text-body text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none resize-y"
            />
          </div>

          {/* Consequences */}
          <div>
            <label htmlFor="adr-consequences" className="block text-meta font-medium text-text-secondary mb-1">
              Consequences & Trade-offs
            </label>
            <textarea
              id="adr-consequences"
              rows={3}
              placeholder="What are the trade-offs, positive benefits, and operational consequences?"
              value={consequences}
              onChange={(e) => setConsequences(e.target.value)}
              className="w-full p-2.5 bg-canvas border border-border-default rounded-sm text-body text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none resize-y"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <DialogFooter className="px-5 py-3 border-t border-border-default bg-surface flex items-center justify-between sm:justify-between">
          <span className="text-caption text-text-muted">Tip: Press Ctrl+Enter to save</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Check className="w-3.5 h-3.5" />}
              disabled={isSubmitting}
              onClick={() => handleSubmit()}
            >
              {isSubmitting ? "Saving..." : "Create Record"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
