import React from "react";
import { Filter, X, RotateCcw } from "lucide-react";
import type { RelationshipType, DiagramConfidence, DiagramGroup } from "../../../types/diagram";

export interface DiagramFilterState {
  relationshipTypes: Set<RelationshipType>;
  confidences: Set<DiagramConfidence>;
  isolatedGroupId: string | null;
}

export interface DiagramFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: DiagramFilterState;
  groups: DiagramGroup[];
  onToggleRelationship: (rel: RelationshipType) => void;
  onToggleConfidence: (conf: DiagramConfidence) => void;
  onSetIsolatedGroup: (groupId: string | null) => void;
  onResetFilters: () => void;
}

const ALL_RELATIONSHIPS: RelationshipType[] = [
  "import",
  "call",
  "inheritance",
  "instantiation",
  "declared_dependency",
  "entry",
];

const ALL_CONFIDENCES: DiagramConfidence[] = [
  "confirmed",
  "static",
  "inferred",
  "unknown",
];

export const DiagramFilterPanel: React.FC<DiagramFilterPanelProps> = ({
  isOpen,
  onClose,
  filters,
  groups,
  onToggleRelationship,
  onToggleConfidence,
  onSetIsolatedGroup,
  onResetFilters,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Diagram filters"
      className="absolute top-12 right-4 z-20 w-72 bg-surface/98 backdrop-blur-sm border border-border-default rounded shadow-md p-3 text-xs font-mono select-none"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-subtle">
        <div className="flex items-center space-x-1.5 font-semibold text-text-primary">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <span>Filter Diagram</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            aria-label="Reset all filters"
            onClick={onResetFilters}
            className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            title="Reset all filters"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            type="button"
            aria-label="Close filter panel"
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Module Isolation */}
        {groups.length > 0 && (
          <div>
            <label htmlFor="isolate-module-select" className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
              Isolate Module
            </label>
            <select
              id="isolate-module-select"
              aria-label="Isolate Module"
              value={filters.isolatedGroupId || ""}
              onChange={(e) => onSetIsolatedGroup(e.target.value || null)}
              className="w-full bg-subtle border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-border-focus"
            >
              <option value="">Show All Modules ({groups.length})</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Relationship Types */}
        <div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Relationship Types
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_RELATIONSHIPS.map((rel) => {
              const active = filters.relationshipTypes.has(rel);
              return (
                <label
                  key={rel}
                  className={`flex items-center space-x-1.5 px-2 py-1 rounded cursor-pointer border transition-colors ${
                    active
                      ? "bg-subtle/80 border-border-strong text-text-primary font-medium"
                      : "bg-surface border-border-subtle text-text-muted opacity-60 hover:opacity-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onToggleRelationship(rel)}
                    className="sr-only"
                  />
                  <span className="truncate text-[11px]">{rel}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Confidence */}
        <div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Confidence Levels
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_CONFIDENCES.map((conf) => {
              const active = filters.confidences.has(conf);
              return (
                <label
                  key={conf}
                  className={`flex items-center space-x-1.5 px-2 py-1 rounded cursor-pointer border transition-colors ${
                    active
                      ? "bg-subtle/80 border-border-strong text-text-primary font-medium"
                      : "bg-surface border-border-subtle text-text-muted opacity-60 hover:opacity-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onToggleConfidence(conf)}
                    className="sr-only"
                  />
                  <span className="truncate text-[11px]">{conf}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

