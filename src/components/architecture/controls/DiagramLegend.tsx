import React, { useState } from "react";
import { Info, ChevronDown, ChevronUp, Layers } from "lucide-react";

export interface DiagramLegendProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export const DiagramLegend: React.FC<DiagramLegendProps> = ({
  isOpen: externalIsOpen,
  onToggle: externalOnToggle,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;
  const handleToggle = isControlled ? externalOnToggle : () => setInternalIsOpen(!internalIsOpen);

  return (
    <div
      className="absolute bottom-4 left-16 z-20 bg-surface border border-border-default rounded-md shadow-md text-xs font-mono max-w-sm select-none"
      data-testid="diagram-legend-panel"
    >
      <button
        type="button"
        tabIndex={0}
        aria-label="Toggle diagram legend"
        onClick={handleToggle}
        className="flex items-center justify-between w-full px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-hover rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus transition-colors"
      >
        <div className="flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-text-muted" />
          <span className="font-semibold text-[11px] tracking-wide">Legend & Line Styles</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 ml-2 text-text-muted" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 ml-2 text-text-muted" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-2 border-t border-border-subtle space-y-3 text-[11px] max-h-96 overflow-y-auto">
          {/* Relationships */}
          <div>
            <div className="font-semibold text-text-primary mb-1 uppercase text-[9px] tracking-wider">
              Relationships
            </div>
            <div className="space-y-1.5 text-text-secondary">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <svg width="28" height="10" className="flex-shrink-0">
                    <line x1="0" y1="5" x2="28" y2="5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="font-medium text-text-primary">import</span>
                </div>
                <span className="text-[10px] text-text-muted">solid line</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <svg width="28" height="10" className="flex-shrink-0">
                    <line x1="0" y1="5" x2="28" y2="5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="font-medium text-text-primary">call</span>
                </div>
                <span className="text-[10px] text-text-muted">solid line</span>
              </div>

              <div className="flex items-center space-x-2">
                <svg width="28" height="10" className="flex-shrink-0">
                  <line
                    x1="0"
                    y1="5"
                    x2="28"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="5,4"
                  />
                </svg>
                <span className="font-medium text-text-primary">instantiation</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <svg width="28" height="10" className="flex-shrink-0">
                    <line
                      x1="0"
                      y1="5"
                      x2="28"
                      y2="5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="2,3"
                    />
                  </svg>
                  <span className="font-medium text-text-primary">manifest dep</span>
                </div>
                <span className="text-[10px] text-text-muted">dotted line</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-accent-default">
                  <svg width="28" height="10" className="flex-shrink-0">
                    <line x1="0" y1="5" x2="28" y2="5" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                  <span className="font-medium text-text-primary">entry point</span>
                </div>
                <span className="text-[10px] text-text-muted">bold solid</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <svg width="28" height="10" className="flex-shrink-0">
                    <line x1="0" y1="5" x2="22" y2="5" stroke="currentColor" strokeWidth="1.5" />
                    <polygon points="22,2 27,5 22,8" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <span className="font-medium text-text-primary">inheritance</span>
                </div>
                <span className="text-[10px] text-text-muted">triangle head</span>
              </div>
            </div>
          </div>

          {/* Confidence Badges */}
          <div>
            <div className="font-semibold text-text-primary mb-1.5 uppercase text-[10px] tracking-wider">
              Confidence
            </div>
            <div className="space-y-1 text-text-secondary">
              <div className="flex items-center justify-between">
                <span>confirmed / static</span>
                <span className="text-text-muted">solid syntax verified</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <span>inferred</span>
                  <span className="px-1 py-0.2 bg-subtle border border-dashed rounded-sm text-[9px] font-sans font-medium text-text-muted">
                    inferred
                  </span>
                </span>
                <span className="text-text-muted">dashed line</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <span>unknown</span>
                  <span className="px-1 py-0.2 bg-subtle border border-dotted rounded-sm text-[9px] font-sans font-medium text-text-faint">
                    unknown
                  </span>
                </span>
                <span className="text-text-muted">dotted line</span>
              </div>
            </div>
          </div>

          {/* Layer Accents */}
          <div>
            <div className="font-semibold text-text-primary mb-1.5 uppercase text-[10px] tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-text-muted" />
              <span>Architectural Layers (3px Accent)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-text-secondary">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#58A6FF] bg-surface border border-border-default" />
                <span>Frontend</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#BC8CFF] bg-surface border border-border-default" />
                <span>Shared</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#3FB950] bg-surface border border-border-default" />
                <span>Backend</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#D29922] bg-surface border border-border-default" />
                <span>Data</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#8B949E] bg-surface border border-border-default" />
                <span>Config</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-[#6E7681] bg-surface border border-border-default" />
                <span>Unclassified</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SvgMarkerDefs: React.FC = () => (
  <svg style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, pointerEvents: "none" }}>
    <defs>
      <marker
        id="bb-arrow-default"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted, #8B949E)" />
      </marker>

      <marker
        id="bb-arrow-entry"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent-default, #388BFD)" />
      </marker>

      <marker
        id="bb-arrow-inheritance"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <polygon
          points="0,1 9,5 0,9"
          fill="var(--bg-surface, #161B22)"
          stroke="var(--text-secondary, #C9D1D9)"
          strokeWidth="1.5"
        />
      </marker>
    </defs>
  </svg>
);
